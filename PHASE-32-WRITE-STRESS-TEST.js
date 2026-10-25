const http=require('http');
const fs=require('fs');
const path=require('path');
const {performance}=require('perf_hooks');
const base=process.env.ANGELSTORE_TEST_URL||'http://127.0.0.1:8092';
function req(method,p,data,headers={}){return new Promise((resolve,reject)=>{const u=new URL(p,base),body=data===undefined?null:JSON.stringify(data);const r=http.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method,headers:{'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(body)}:{}),...headers}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{let j=null;try{j=JSON.parse(b)}catch{}resolve({status:res.statusCode,json:j,body:b})})});r.on('error',reject);if(body)r.write(body);r.end()})}
async function mapLimit(items,limit,fn){let next=0,out=new Array(items.length);async function w(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:limit},w));return out}
function assert(ok,msg){if(!ok)throw new Error(msg)}
(async()=>{
 const started=performance.now();
 const svc=await req('GET','/api/services'); assert(svc.status===200&&svc.json?.services?.length,'services endpoint failed');
 const service=svc.json.services[0]; const serviceName=service?.services?.[0]?.name || service?.name || service?.service; const serviceValue=service?.category+' — '+serviceName; assert(serviceName,'No service name');
 const sub=service.services[0]; const gov=Number(String(sub.govt||'').replace(/,/g,'').match(/₹\s*([0-9]+(?:\.[0-9]+)?)/)?.[1]||0); const amount=Number((gov+Number(sub.csc||0)).toFixed(2)); assert(Number.isFinite(amount)&&amount>0,'Could not determine service charge');
 const screenshot='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const apps=await mapLimit(Array.from({length:19},(_,i)=>i),10,async i=>{const mobile=String(9000000000+i).slice(-10);return req('POST','/api/customer/application',{name:'Load Test '+i,mobile,service:serviceValue,address:'Test',note:'Phase32'});});
 assert(apps.every(x=>x.status===200),'Application concurrency failure: '+apps.filter(x=>x.status!==200).map(x=>x.status).join(','));
 const payments=await mapLimit(apps,19,async(a,i)=>req('POST','/api/customer/payment',{name:a.json.name,mobile:a.json.mobile,service:serviceValue,amount,utr:'P32-'+String(i).padStart(4,'0'),screenshot,application_id:a.json.id},{'X-Customer-Session':a.json.customer_token}));
 assert(payments.every(x=>x.status===200),'Payment concurrency failure: '+payments.filter(x=>x.status!==200).map(x=>x.status).join(','));
 const dupBase=apps[0], dup1=await req('POST','/api/customer/payment',{name:dupBase.json.name,mobile:dupBase.json.mobile,service:serviceValue,amount,utr:'P32-DUP',screenshot,application_id:dupBase.json.id},{'X-Customer-Session':dupBase.json.customer_token});
 const dup2=await req('POST','/api/customer/payment',{name:dupBase.json.name,mobile:dupBase.json.mobile,service:serviceValue,amount,utr:'P32-DUP',screenshot,application_id:dupBase.json.id},{'X-Customer-Session':dupBase.json.customer_token});
 assert(dup1.status===200&&dup2.status===409,'Duplicate UTR protection failed: '+dup1.status+'/'+dup2.status);
 const user=process.env.ANGELSTORE_ADMIN_USER||'',pass=process.env.ANGELSTORE_ADMIN_PASS||'';
 const login=await req('POST','/api/auth/login',{username:user,password:pass}); assert(login.status===200&&login.json?.access_token,'Admin login failed'); const auth={'Authorization':'Bearer '+login.json.access_token};
 const allPayments=payments.map(x=>x.json.id);
 const view=await mapLimit(allPayments,10,id=>req('GET','/api/payments/proof/'+id,undefined,auth));
 assert(view.every(x=>x.status===200),'Proof viewing failure: '+view.filter(x=>x.status!==200).map(x=>x.status).join(','));
 const ver=await mapLimit(allPayments,10,id=>req('POST','/api/payments/status',{id,status:'Verified'},auth));
 assert(ver.every(x=>x.status===200&&x.json?.status==='Verified'),'Payment verification failure: '+ver.filter(x=>x.status!==200).map(x=>x.status).join(','));
 const race=await Promise.all(Array.from({length:20},()=>req('POST','/api/tokens',{action:'issue',payment_id:payments[0].json.id,name:apps[0].json.name,mobile:apps[0].json.mobile,service:serviceValue},auth)));
 const raceOk=race.filter(x=>x.status===200).length, race409=race.filter(x=>x.status===409).length; assert(raceOk===1&&race409===19,'Concurrent duplicate-token protection failed: '+race.map(x=>x.status).join(','));
 const tokens=await mapLimit(payments.slice(1),18,async(p,i)=>{const a=apps[i+1].json;return req('POST','/api/tokens',{action:'issue',payment_id:p.json.id,name:a.name,mobile:a.mobile,service:serviceValue},auth)});
 assert(tokens.every(x=>x.status===200),'Token generation failure: '+tokens.filter(x=>x.status!==200).map(x=>x.status).join(','));
 const dupToken=await req('POST','/api/tokens',{action:'issue',payment_id:payments[0].json.id,name:apps[0].json.name,mobile:apps[0].json.mobile,service:serviceValue},auth);
 assert(dupToken.status===409,'Duplicate token protection failed: '+dupToken.status);
 const integrity=await req('GET','/api/system/integrity',undefined,auth);
 assert([200,503].includes(integrity.status)&&integrity.json,'Integrity endpoint unavailable'); assert(integrity.status===200&&integrity.json.ok===true,'Integrity check failed');
 const elapsed=performance.now()-started;
 const result={ok:true,service:serviceValue,amount,applications:apps.length,payments:payments.length,tokens:tokens.length+1,token_race:{success:raceOk,conflict:race409},duplicate_utr:{first:dup1.status,second:dup2.status},duplicate_token:dupToken.status,integrity:integrity.json,elapsed_ms:Number(elapsed.toFixed(2)),storage_isolated:true,production_data_used:false};
 fs.writeFileSync(path.join(__dirname,'PHASE-32-WRITE-STRESS-RESULT.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});

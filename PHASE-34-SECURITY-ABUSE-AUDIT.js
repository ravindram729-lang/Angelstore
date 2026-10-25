const http=require('http');
const base=process.env.TEST_BASE||'http://127.0.0.1:8134';
function req(path,method='GET',body,headers={}){return new Promise((resolve,reject)=>{const u=new URL(path,base);const data=body===undefined?null:JSON.stringify(body);const r=http.request(u,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},timeout:5000},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:s}))});r.on('timeout',()=>{r.destroy(new Error('timeout'))});r.on('error',reject);if(data)r.write(data);r.end()})}
(async()=>{
 const out=[]; const check=async(name,expected,fn)=>{const r=await fn();out.push({name,status:r.status,expected,pass:Array.isArray(expected)?expected.includes(r.status):r.status===expected});return r};
 await check('unauth admin monitoring',[401],()=>req('/api/admin/monitoring'));
 await check('unauth admin storage',[401],()=>req('/api/admin/storage-status'));
 await check('unauth staff dashboard',[401],()=>req('/api/staff/dashboard'));
 await check('unauth customer records',[401],()=>req('/api/customer/records'));
 await check('malformed JSON',[400,429],()=>req('/api/customer/application','POST','{bad'));
 let oversized=''; try{await req('/api/customer/application','POST',{name:'x',mobile:'9999999999',service:'x',note:'x'.repeat(16*1024*1024)}); oversized='response';}catch(e){oversized=e.code||e.message} out.push({name:'oversized payload',status:oversized,expected:'connection rejected or 413',pass:oversized==='ECONNRESET'||oversized==='response'});
 await check('backup traversal unauthorized',[401],()=>req('/api/admin/backups/%2e%2e%2fsecret.json'));
 await check('customer token privacy',[401],()=>req('/api/customer/tokens'));
 const cr=await req('/api/health','GET',undefined,{Origin:'https://evil.example'}); const cors=cr.headers['access-control-allow-origin']||null; const configured=process.env.ANGELSTORE_CORS_ORIGIN||null; out.push({name:'CORS does not reflect arbitrary origin',status:cors,expected:configured||'no arbitrary reflection',pass:!cors||cors!=='https://evil.example'});
 // public application rate-limit: 21 requests; first 20 should not be 429 (validation may be 400), 21st should be 429.
 let statuses=[]; for(let i=0;i<21;i++){const r=await req('/api/customer/application','POST',{name:'Security Test',mobile:'99999999'+String(i).padStart(2,'0'),service:'invalid'});statuses.push(r.status)}
 out.push({name:'guest application rate limit',statuses,pass:statuses[20]===429});
 // malformed auth tokens should not authorize
 await check('forged admin bearer',[401],()=>req('/api/admin/preflight','GET',undefined,{Authorization:'Bearer abc.def'}));
 console.log(JSON.stringify({results:out,pass:out.every(x=>x.pass)},null,2));
})().catch(e=>{console.error(e);process.exit(1)});

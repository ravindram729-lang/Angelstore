const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8015';
const ROOT = __dirname;
const report = { started_at:new Date().toISOString(), steps:[], ok:false };
function assert(ok, name, detail){ report.steps.push({name,ok:Boolean(ok),detail:detail??''}); if(!ok) throw new Error(name + (detail?': '+detail:'')); }
function req(method, pathname, body, headers={}){
  return new Promise((resolve,reject)=>{
    const u=new URL(pathname,BASE); const b=body===undefined?null:Buffer.from(JSON.stringify(body));
    const h={...(b?{'Content-Type':'application/json','Content-Length':b.length}:{}),...headers};
    const r=http.request({method,hostname:u.hostname,port:u.port,path:u.pathname+u.search,headers:h},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let data;try{data=s?JSON.parse(s):null}catch{data=s}resolve({status:res.statusCode,data,headers:res.headers})})});r.on('error',reject);if(b)r.write(b);r.end();
  });
}
async function main(){
  let r=await req('GET','/api/health'); assert(r.status===200&&r.data?.ok,'Health check',JSON.stringify(r.data));

  r=await req('POST','/api/auth/login',{username:process.env.ANGELSTORE_ADMIN_USER||'',password:process.env.ANGELSTORE_ADMIN_PASS||''}); assert(r.status===200&&r.data.access_token,'Admin login'); const admin='Bearer '+r.data.access_token;
  r=await req('GET','/api/system/integrity',undefined,{Authorization:admin}); assert(r.status===200&&r.data.ok,'Initial integrity',JSON.stringify(r.data));

  r=await req('GET','/api/services'); assert(r.status===200&&r.data.services?.length,'Service catalog');
  const category=r.data.services.find(x=>x.services?.length); const sub=category.services[0]; const service=category.category+' — '+sub.name;
  r=await req('GET','/api/service-charges?category='+encodeURIComponent(category.category)+'&service='+encodeURIComponent(sub.name)); assert(r.status===200&&r.data.charge,'Service charge');
  const amount=Number(r.data.charge.total); assert(amount>0,'Payable amount',String(amount));
  r=await req('POST','/api/payments',{name:'Manual UPI Proof Test',mobile:'92222'+String(Math.floor(10000+Math.random()*89999)),service,amount,method:'UPI',utr:'MANUAL-NO-PROOF-'+Date.now()},{Authorization:admin}); assert(r.status===400,'Admin UPI manual payment requires proof');

  const mobile='90000'+String(Math.floor(10000+Math.random()*89999));
  r=await req('POST','/api/customer/register',{name:'E2E Test Customer',mobile,pin:'2468'}); assert(r.status===201&&r.data.session_token,'Customer registration'); const customer=r.data.session_token;
  r=await req('GET','/api/customer/me',undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.customer?.mobile===mobile,'Customer session');
  r=await req('POST','/api/customer/home-services',{service:'आधार सेवाएँ — Aadhaar Address Update',address:'E2E Test Address',preferred_date:new Date(Date.now()+24*60*60*1000).toISOString().slice(0,10),preferred_time:'10:00'},{'X-Customer-Session':customer}); assert(r.status===201&&r.data.home_service_id,'Home service request');
  r=await req('GET','/api/customer/home-services',undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.home_services?.length===1,'Home service list');

  r=await req('POST','/api/customer/application',{name:'E2E Test Customer',mobile,service,address:'Test Address'}); assert(r.status===200&&r.data.application_id,'Application creation'); const app=r.data;
  r=await req('GET','/api/customer/track?ref='+encodeURIComponent(app.application_id)); assert(r.status===401,'Unauthenticated application tracking blocked');
  r=await req('GET','/api/customer/track?ref='+encodeURIComponent(app.application_id),undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.result?.reference===app.application_id,'Authenticated own application tracking');
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const screenshot='data:image/png;base64,'+Buffer.concat([Buffer.from(png,'base64'),Buffer.from('ANGELSTORE-E2E-'+Date.now())]).toString('base64');
  r=await req('POST','/api/customer/payment',{name:'E2E Test Customer',mobile,service,amount,utr:'E2E-'+Date.now(),application_id:app.id,screenshot},{'X-Customer-Session':customer}); assert(r.status===200&&r.data.status==='Pending Verification','Customer payment submission',JSON.stringify(r.data)); const paymentId=r.data.id;
  r=await req('GET','/api/customer/payment/status?id='+paymentId,undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.payment.status==='Pending Verification','Payment pending status');

  r=await req('GET','/api/payments/proof/'+paymentId,undefined,{Authorization:admin}); assert(r.status===200&&String(r.headers['content-type']).startsWith('image/'),'Admin proof review');
  r=await req('POST','/api/payments/status',{id:paymentId,status:'Verified'},{Authorization:admin}); assert(r.status===200&&r.data.status==='Verified','Admin payment verification',JSON.stringify(r.data));
  r=await req('GET','/api/customer/payment/status?id='+paymentId,undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.payment.status==='Verified','Customer sees verified payment');
  r=await req('POST','/api/customer/application',{name:'UTR Only Test',mobile:'90000'+String(Math.floor(10000+Math.random()*89999)),service,address:'UTR Test Address'}); assert(r.status===200&&r.data.application_id,'UTR-only application'); const utrApp=r.data;
  r=await req('POST','/api/customer/payment',{name:'UTR Only Test',mobile:utrApp.mobile,service,amount,utr:'UTR-ONLY-'+Date.now(),application_id:utrApp.id},{'X-Customer-Session':utrApp.customer_token}); assert(r.status===400,'UTR-only payment must require screenshot');

  r=await req('POST','/api/customer/tokens',{payment_id:paymentId,name:'E2E Test Customer',mobile,service},{'X-Customer-Session':customer}); assert(r.status===409,'Token blocked until required documents are verified');
  r=await req('GET','/api/sops?service='+encodeURIComponent(service),undefined,{Authorization:admin}); assert(r.status===200&&r.data.sop,'Service SOP');
  const requiredDocs=r.data.sop.documents||[]; assert(requiredDocs.length>0,'Required documents configured');
  const jpeg='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8jK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
  const files=requiredDocs.map((name,i)=>({name:String(name||('required-'+i))+'.jpg',mime_type:'image/jpeg',data:jpeg}));
  r=await req('POST','/api/customer/documents',{application_id:app.id,files},{'X-Customer-Session':customer}); assert(r.status===201&&r.data.documents?.length>=requiredDocs.length,'Customer uploads required documents',JSON.stringify(r.data));
  for(const d of r.data.documents){r=await req('POST','/api/documents/'+d.id+'/status',{status:'verified',note:'E2E Admin document verification'},{Authorization:admin});assert(r.status===200&&r.data.document?.status==='verified','Admin verifies document',JSON.stringify(r.data));}
  r=await req('POST','/api/customer/tokens',{payment_id:paymentId,name:'E2E Test Customer',mobile,service},{'X-Customer-Session':customer}); assert(r.status===200&&r.data.token,'Token generation after document verification',JSON.stringify(r.data)); const tokenId=r.data.id, tokenRef=r.data.token;
  r=await req('GET','/api/customer/track?ref='+encodeURIComponent(tokenRef)); assert(r.status===401,'Unauthenticated token tracking blocked');
  r=await req('GET','/api/customer/track?ref='+encodeURIComponent(tokenRef),undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.result?.reference===tokenRef,'Authenticated own token tracking');
  r=await req('GET','/api/customer/records',undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.tokens?.some(x=>Number(x.id)===Number(tokenId)),'Customer token history');

  r=await req('POST','/api/staff',{name:'E2E Viewer Staff',mobile:'92222'+String(Math.floor(10000+Math.random()*89999)),pin:'1358',role:'viewer',daily_rate:250},{Authorization:admin}); assert(r.status===200&&r.data?.role==='viewer'&&r.data?.permissions?.includes('quality_view')&&!r.data?.permissions?.includes('task_update'),'Viewer role creation/RBAC'); const viewerEmployee=r.data.employee_id;
  r=await req('POST','/api/staff',{name:'E2E Invalid Role',mobile:'93333'+String(Math.floor(10000+Math.random()*89999)),pin:'1359',role:'not_a_role',daily_rate:250},{Authorization:admin}); assert(r.status===400,'Invalid staff role rejected');
  r=await req('POST','/api/staff/login',{identifier:viewerEmployee,pin:'1358'}); assert(r.status===200&&r.data.session,'Viewer staff login'); const viewer=r.data.session;
  r=await req('POST','/api/staff/tasks',{id:tokenId,action:'start'},{'X-Staff-Session':viewer}); assert(r.status===403,'Viewer cannot update staff task');
  r=await req('GET','/api/staff/dashboard',undefined,{'X-Staff-Session':viewer}); assert(r.status===200,'Viewer dashboard access');
  r=await req('POST','/api/staff/logout',undefined,{'X-Staff-Session':viewer}); assert(r.status===200,'Viewer logout');
  r=await req('POST','/api/staff',{name:'E2E Test Staff',mobile:'91111'+String(Math.floor(10000+Math.random()*89999)),pin:'1357',role:'staff',daily_rate:300},{Authorization:admin}); assert(r.status===200&&r.data?.staff_id,'Staff creation',JSON.stringify(r.data)); const staffId=r.data.staff_id, staffEmployee=r.data.employee_id, staffMobile=r.data.mobile;
  r=await req('POST','/api/staff/'+encodeURIComponent(staffId),{action:'assign',token_id:tokenId},{Authorization:admin}); assert(r.status===200,'Token assignment');
  // The queue state machine requires Admin to call a pending token before assigned staff can start it.
  r=await req('POST','/api/tokens',{id:tokenId,action:'next'},{Authorization:admin}); assert(r.status===200&&r.data?.status==='बुलाया','Token called');
  r=await req('POST','/api/staff/login',{identifier:staffEmployee,pin:'1357'}); assert(r.status===200&&r.data.session,'Staff login'); const staff=r.data.session;
  r=await req('POST','/api/staff/tasks',{id:tokenId,action:'start'},{'X-Staff-Session':staff}); assert(r.status===200&&r.data.status==='प्रगति','Staff starts task');
  r=await req('GET','/api/service-quality?token_id='+tokenId,undefined,{'X-Staff-Session':staff}); assert(r.status===200&&r.data.sop?.checks?.length,'Staff gets SOP');
  const sop=r.data.sop;
  const checks=sop.checks.map(x=>({id:x.id,checked:true}));
  r=await req('POST','/api/service-quality',{token_id:tokenId,checks,notes:'E2E staff checklist submission'},{'X-Staff-Session':staff}); assert(r.status===200&&r.data.quality?.status==='submitted','Staff submits quality review',JSON.stringify(r.data));
  r=await req('POST','/api/staff/tasks',{id:tokenId,action:'complete'},{'X-Staff-Session':staff}); assert(r.status===400,'Staff cannot complete before Admin QC');
  r=await req('POST','/api/service-quality',{token_id:tokenId,checks,action:'pass',notes:'E2E admin final quality review'},{Authorization:admin}); assert(r.status===200&&r.data.quality?.status==='passed'&&r.data.quality?.review_stage==='admin','Admin final quality review pass',JSON.stringify(r.data));
  r=await req('POST','/api/staff/tasks',{id:tokenId,action:'complete'},{'X-Staff-Session':staff}); assert(r.status===200&&r.data.status==='पूर्ण','Staff completes task');
  r=await req('GET','/api/customer/dashboard',undefined,{'X-Customer-Session':customer}); assert(r.status===200&&r.data.receipts?.some(x=>x.receipt_no),'Automatic completion receipt');

  r=await req('GET','/api/customer/dashboard',undefined,{'X-Customer-Session':customer}); assert(r.status===200,'Customer dashboard');
  r=await req('GET','/api/customer-history?mobile='+mobile,undefined,{Authorization:admin}); assert(r.status===200&&r.data.summary?.tokens>=1&&r.data.summary?.payments>=1,'Admin customer history');
  r=await req('GET','/api/reports',undefined,{Authorization:admin}); assert(r.status===200&&r.data.summary,'Reports',JSON.stringify(r.data));
  r=await req('GET','/api/control-center',undefined,{Authorization:admin}); assert(r.status===200&&r.data.kpis,'Control center');
  r=await req('GET','/api/finance/summary',undefined,{Authorization:admin}); assert(r.status===200&&r.data.summary,'Finance summary');
  r=await req('GET','/api/system/integrity',undefined,{Authorization:admin}); assert(r.status===200&&r.data.ok,'Final integrity',JSON.stringify(r.data));

  r=await req('POST','/api/staff/logout',undefined,{'X-Staff-Session':staff}); assert(r.status===200,'Staff logout');
  r=await req('GET','/api/staff/me',undefined,{'X-Staff-Session':staff}); assert(r.status===401,'Revoked staff session');
  r=await req('POST','/api/customer/logout',undefined,{'X-Customer-Session':customer}); assert(r.status===200,'Customer logout');
  r=await req('GET','/api/customer/me',undefined,{'X-Customer-Session':customer}); assert(r.status===401,'Revoked customer session');
  r=await req('POST','/api/auth/logout',undefined,{Authorization:admin}); assert(r.status===200,'Admin logout');
  r=await req('GET','/api/control-center',undefined,{Authorization:admin}); assert(r.status===401,'Revoked admin session');

  report.ok=true; report.finished_at=new Date().toISOString();
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{report.ok=false;report.error=e.message;report.finished_at=new Date().toISOString();console.error(JSON.stringify(report,null,2));process.exitCode=1});

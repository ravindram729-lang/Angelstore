const base=(process.env.ANGELSTORE_TEST_URL||'http://127.0.0.1:8000').replace(/\/$/,'');
const user=process.env.ANGELSTORE_TEST_USER;
const pass=process.env.ANGELSTORE_TEST_PASS;
async function req(path,options={}){const r=await fetch(base+path,{redirect:'manual',...options});let data=null;const ct=r.headers.get('content-type')||'';if(ct.includes('application/json')){try{data=await r.json()}catch{}}return {r,data}}
async function main(){
  let x=await req('/api/health'); if(x.r.status!==200||!x.data?.ok)throw new Error(`health failed: ${x.r.status}`); console.log('PASS health');
  x=await req('/admin.html'); if(x.r.status!==200)throw new Error(`admin static failed: ${x.r.status}`); console.log('PASS admin static');
  if(!user||!pass){console.log('SKIP authenticated checks: set ANGELSTORE_TEST_USER and ANGELSTORE_TEST_PASS');return}
  x=await req('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:pass})});
  if(x.r.status!==200||!x.data?.access_token)throw new Error(`admin login failed: ${x.r.status}`); const token=x.data.access_token; const h={Authorization:'Bearer '+token}; console.log('PASS admin login');
  for(const p of ['/api/admin/preflight','/api/control-center','/api/reports','/api/reports/service','/api/reports/staff']){x=await req(p,{headers:h});if(x.r.status!==200)throw new Error(`${p} failed: ${x.r.status}`);console.log('PASS '+p)}
  x=await req('/api/auth/logout',{method:'POST',headers:h});if(x.r.status!==200)throw new Error('logout failed');console.log('PASS admin logout');
  x=await req('/api/control-center',{headers:h});if(x.r.status!==401)throw new Error(`revoked session expected 401, got ${x.r.status}`);console.log('PASS revoked session');
}
main().catch(e=>{console.error('FAIL',e.message);process.exit(1)});

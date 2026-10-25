const https = require('https');
const { URL } = require('url');
const fs = require('fs');

const backend = process.env.ANGELSTORE_PROD_BACKEND_URL || 'https://angelstore-csc-project4.onrender.com';
const frontend = process.env.ANGELSTORE_PROD_FRONTEND_URL || 'https://eloquent-tulumba-26fd2e.netlify.app';
const origin = process.env.ANGELSTORE_CORS_ORIGIN || frontend;
const timeout = Number(process.env.ANGELSTORE_VERIFY_TIMEOUT_MS || 15000);
const results = [];

function request(url, options={}) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return resolve({ok:false,error:`Invalid URL: ${e.message}`}); }
    const req = https.request(parsed, {method: options.method || 'GET', headers: options.headers || {}, timeout}, res => {
      let body='';
      res.on('data', c => { body += c.toString(); if(body.length > 4096) body=body.slice(0,4096); });
      res.on('end', () => resolve({ok:true,status:res.statusCode,headers:res.headers,body}));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', e => resolve({ok:false,error:e.code ? `${e.code}: ${e.message}` : e.message}));
    req.end();
  });
}
function add(name, ok, detail){ results.push({name,ok:Boolean(ok),detail:String(detail||'')}); }

(async()=>{
  const f = await request(frontend);
  add('Frontend reachable', f.ok && f.status >= 200 && f.status < 500, f.ok ? `HTTP ${f.status}` : f.error);

  const h = await request(`${backend.replace(/\/$/,'')}/api/health`);
  let healthDetail = h.ok ? `HTTP ${h.status}` : h.error;
  let healthOk = h.ok && h.status === 200;
  if (h.ok && h.body) {
    try { const j=JSON.parse(h.body); healthDetail += ` body.ok=${j.ok}`; healthOk = healthOk && j.ok !== false; } catch {}
  }
  add('Backend health', healthOk, healthDetail);

  const services = await request(`${backend.replace(/\/$/,'')}/api/services`);
  add('Public services API', services.ok && services.status === 200, services.ok ? `HTTP ${services.status}` : services.error);

  const cors = await request(`${backend.replace(/\/$/,'')}/api/health`, {method:'OPTIONS', headers:{Origin:origin,'Access-Control-Request-Method':'GET'}});
  const allow = cors.headers && cors.headers['access-control-allow-origin'];
  add('CORS exact origin', cors.ok && (allow === origin), cors.ok ? `allow-origin=${allow || '<missing>'}` : cors.error);

  const traversal = await request(`${backend.replace(/\/$/,'')}/../package.json`);
  add('Static traversal blocked', traversal.ok && [400,401,403,404].includes(traversal.status), traversal.ok ? `HTTP ${traversal.status}` : traversal.error);

  const out={ok:results.every(x=>x.ok),generated_at:new Date().toISOString(),backend,frontend,origin,checks:results};
  console.log(JSON.stringify(out,null,2));
  if(process.env.ANGELSTORE_VERIFY_OUTPUT) fs.writeFileSync(process.env.ANGELSTORE_VERIFY_OUTPUT, JSON.stringify(out,null,2));
  process.exit(out.ok?0:1);
})().catch(e=>{ console.error(e); process.exit(1); });

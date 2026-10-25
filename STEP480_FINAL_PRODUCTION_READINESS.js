const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const ROOT=__dirname;
const results=[];
function add(name,ok,detail=''){results.push({name,ok:Boolean(ok),detail:String(detail||'')});}
function run(cmd,args=[],env={}){
  const r=cp.spawnSync(cmd,args,{cwd:ROOT,env:{...process.env,...env},encoding:'utf8',maxBuffer:20*1024*1024});
  return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||''};
}
function jsonFrom(text){
  const s=String(text||'').trim();
  try{return JSON.parse(s)}catch{}
  const a=s.lastIndexOf('{'),b=s.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
  return null;
}
function file(name){return fs.existsSync(path.join(ROOT,name));}

// 1. Release artifact / syntax checks
for(const f of ['server.js','storage.js','service-catalog.js','index.html','customer.html','admin.html','staff.html','app.js','customer.js','style.css','package.json','.env.example','render.yaml','FINAL-RELEASE-AUDIT.js','PRODUCTION-PREFLIGHT.js','PRODUCTION-OPS-AUDIT.js','PRODUCTION-DEPLOYMENT-VERIFY.js']) add(`Artifact: ${f}`,file(f));
for(const f of ['server.js','app.js','customer.js','P0-P1-REGRESSION-TEST.js','STEP480_FINAL_PRODUCTION_READINESS.js']){const r=run(process.execPath,['--check',f]);add(`Syntax: ${f}`,r.code===0,r.stderr.trim()||r.stdout.trim());}

// 2. UPPCL structural UI gate — reference layout is Step 1/2 top row, Step 3/4 bottom row, flow full-width, side rail.
const html=fs.readFileSync(path.join(ROOT,'customer.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'style.css'),'utf8');
const requiredIds=['uppclConsumerForm','uppclBillCard','uppclManualPaymentBox','uppclProofCard','uppclFetchBill','uppclCopyUpi','uppclUpiOpen','uppclSubmitPayment','uppclHistoryRefresh'];
add('UPPCL required workflow IDs',requiredIds.every(id=>new RegExp(`id=["']${id}["']`).test(html)));
add('UPPCL Step 1/2/3/4 visible in DOM',/1\. उपभोक्ता विवरण/.test(html)&&/2\. बिल विवरण/.test(html)&&/3\. UPI से भुगतान/.test(html)&&/4\. भुगतान की जानकारी/.test(html));
add('UPPCL desktop 2x2 grid',/\.uppcl-main\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css)&&/\.uppcl-main>\.uppcl-consumer-card\{grid-column:1\}/.test(css)&&/\.uppcl-main>\.uppcl-bill-card\{grid-column:2\}/.test(css)&&/\.uppcl-main>\.uppcl-payment-card\{grid-column:1\}/.test(css)&&/\.uppcl-main>\.uppcl-proof-card\{grid-column:2\}/.test(css));
add('UPPCL flow full-width',/\.uppcl-main>\.uppcl-flow-card\{grid-column:1\/-1\}/.test(css));
add('UPPCL responsive collapse',/@media\(max-width:900px\)[\s\S]*?\.uppcl-main\{grid-template-columns:1fr\}/.test(css));
add('UPPCL Step 3/4 remain present when locked',html.includes('id="uppclManualPaymentBox" class="uppcl-card uppcl-payment-card is-locked"')&&html.includes('id="uppclProofCard" class="uppcl-card uppcl-proof-card is-locked"'));

// 3. Duplicate IDs and static source-map exposure
const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
add('Customer duplicate HTML IDs',dup.length===0,dup.join(', '));
const admin=fs.readFileSync(path.join(ROOT,'admin.html'),'utf8');
const adminMarkup=admin.replace(/<script[\s\S]*?<\/script>/gi,'');
const adminIds=[...adminMarkup.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const adminDup=[...new Set(adminIds.filter((id,i)=>adminIds.indexOf(id)!==i))];
add('Admin duplicate HTML IDs',adminDup.length===0,adminDup.join(', '));
const maps=[];(function walk(d){for(const n of fs.readdirSync(d,{withFileTypes:true})){if(['.git','node_modules'].includes(n.name))continue;const p=path.join(d,n.name);if(n.isDirectory())walk(p);else if(n.name.endsWith('.map'))maps.push(path.relative(ROOT,p));}})(ROOT);
add('No public source-map files',maps.length===0,maps.join(', '));
add('No production data.json bundled',!file('data.json'));

// 4. Existing release/regression/targeted E2E suite
// Historical UPPCL scripts are fixture-driven. Create only an empty temporary fixture for the test run, then remove it.
const historicalFixture=path.join(ROOT,'data.json');
fs.writeFileSync(historicalFixture,'{}');
for(const f of ['STEP456_UPPCL_SECURITY_E2E.js','STEP460_UPPCL_STATE_MACHINE_E2E.js','STEP462_UPPCL_IDEMPOTENCY_E2E.js']){
  const rr=run(process.execPath,[f]); const jj=jsonFrom(rr.stdout); add(`UPPCL E2E: ${f}`,rr.code===0&&jj?.ok===true,rr.code===0?'PASS':String(jj?.error||rr.stderr||'FAIL').slice(0,500));
}
try{fs.rmSync(historicalFixture,{force:true});}catch{}
let r=run(process.execPath,['FINAL-RELEASE-AUDIT.js']);let j=jsonFrom(r.stdout);add('Final release audit',r.code===0&&j?.ok!==false,r.code===0?'PASS':'FAIL');
r=run(process.execPath,['P0-P1-REGRESSION-TEST.js']);j=jsonFrom(r.stdout);add('P0/P1 regression',r.code===0&&j?.ok===true,r.code===0?'PASS':'FAIL');
for(const f of ['STEP463_UPPCL_PAYMENT_CONSISTENCY_E2E.js','STEP465_UPPCL_RECONCILIATION_RECOVERY_E2E.js','STEP466_GLOBAL_PAYMENT_ARCHITECTURE_E2E.js','STEP467_GLOBAL_PAYMENT_RECONCILIATION_E2E.js','STEP468_GLOBAL_RECOVERY_E2E.js','STEP469_PAYMENT_LIFECYCLE_E2E.js','STEP470_FINANCIAL_LEDGER_E2E.js','STEP471_FINANCIAL_REPORT_E2E.js','STEP472_FINANCIAL_DOCUMENT_E2E.js','STEP473_BACKUP_RESTORE_DR_E2E.js']){
  r=run(process.execPath,[f]);j=jsonFrom(r.stdout);add(`Targeted E2E: ${f}`,r.code===0&&j?.ok!==false,r.code===0?'PASS':String(j?.error||r.stderr||'FAIL').slice(0,500));
}

// 5. Full application E2E in isolated storage. This never uses production data.
const e2eDir='/tmp/angelstore-step480-final-e2e';
try{fs.rmSync(e2eDir,{recursive:true,force:true});fs.mkdirSync(e2eDir,{recursive:true});}catch{}
const secret='Step480-Isolated-Test-Secret-2026-9f7a3b2c1d4e5f6g';
const adminUser='step480admin',adminPass='Step480-Test-Admin-2026!';
const port=18180;
let proc=cp.spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(port),ANGELSTORE_STORAGE_DIR:e2eDir,ANGELSTORE_AUTH_SECRET:secret,ANGELSTORE_ADMIN_USER:adminUser,ANGELSTORE_ADMIN_PASS:adminPass,ANGELSTORE_CORS_ORIGIN:'https://example.com'},stdio:['ignore','pipe','pipe']});
let out='';proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>out+=d);
const start=Date.now(); while(Date.now()-start<5000){const h=run(process.execPath,['-e',`require('http').get('http://127.0.0.1:${port}/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))`]);if(h.code===0)break;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}
r=run(process.execPath,['E2E-TEST.js'],{E2E_BASE:`http://127.0.0.1:${port}`,ANGELSTORE_ADMIN_USER:adminUser,ANGELSTORE_ADMIN_PASS:adminPass});
try{proc.kill('SIGTERM')}catch{};
j=jsonFrom(r.stdout);add('Full isolated application E2E',r.code===0&&j?.ok===true,r.code===0?'PASS':'FAIL');

// 6. Production ops gate — expected to block in this development environment unless real host config is present.
r=run(process.execPath,['PRODUCTION-OPS-AUDIT.js']);j=jsonFrom(r.stdout);const opsPass=j?.ok===true;add('Production ops configuration gate',opsPass,opsPass?'PASS':'BLOCKED: host production configuration is not supplied');

// 7. Live deployment verification. DNS/network failure is reported distinctly, never treated as a code PASS.
r=run(process.execPath,['PRODUCTION-DEPLOYMENT-VERIFY.js']);j=jsonFrom(r.stdout);const networkChecks=j?.checks||[];const targetNotConfigured=j?.status==='NOT_CONFIGURED'||networkChecks.some(x=>/ANGELSTORE_PROD_(BACKEND|FRONTEND)_URL/.test(x.detail||''));const networkUnavailable=networkChecks.length>0&&networkChecks.every(x=>/EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(x.detail||''));add('Live deployment verification',j?.ok===true, j?.ok===true?'PASS':(targetNotConfigured?'NOT VERIFIED: exact production URLs were not supplied':networkUnavailable?'NOT VERIFIED: deployment host/network unreachable from this environment':'FAIL: live deployment checks did not pass'));

const blocking=results.filter(x=>!x.ok).map(x=>x.name);
const verdict=blocking.length===0?'READY':'NOT READY';
const report={step:'STEP480',generated_at:new Date().toISOString(),verdict,blocking_failures:blocking,checks:results,notes:[
 'No production credentials or production data were added to the release package.',
 'Full isolated E2E uses temporary storage and test credentials only.',
 'Live browser click-by-click verification is not claimed when localhost Chromium is environment-restricted.',
 'Production readiness remains blocked until the actual deployment host passes the production ops configuration gate and live deployment verification.'
]};
fs.writeFileSync(path.join(ROOT,'STEP480_FINAL_PRODUCTION_READINESS_REPORT.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(verdict==='READY'?0:1);

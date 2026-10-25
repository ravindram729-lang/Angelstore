const fs=require('fs');
const path=require('path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const storage=fs.readFileSync(path.join(__dirname,'storage.js'),'utf8');
const checks=[
 ['transaction helper snapshots affected collections',/function withDbTransaction\(collections, mutator, rollbackCleanup=\(\)=>\{[\s\S]*?snapshot\[name\]=value==null\?value:structuredClone\(value\)/.test(server)],
 ['transaction commits only after mutation succeeds',/const result=mutator\(\);\s*save\(\);\s*return result;/.test(server)],
 ['transaction restores collections after save failure',/catch\(err\)\{[\s\S]*?for\(const name of names\)db\[name\]=snapshot\[name\]/.test(server)],
 ['transaction restores database metadata after failure',/snapshot\.meta===undefined\)delete db\.meta;else db\.meta=snapshot\.meta/.test(server)],
 ['failed transaction cleans uploaded proof file',/withDbTransaction\(\[[^\]]*'notifications'\][\s\S]*?fs\.unlinkSync\(path\.join\(UPLOAD_DIR,proof\.filename\)\)/.test(server)],
 ['application/payment/recharge are committed in one transaction',/withDbTransaction\(\['applications','payments','recharge_transactions','payment_idempotency','audit','notifications'\][\s\S]*?db\.applications\.push\(app\);db\.payments\.push\(pay\);db\.recharge_transactions\.unshift\(row\)/.test(server)],
 ['idempotency record is part of atomic commit',/withDbTransaction\(\[[^\]]*'payment_idempotency'[^\]]*\][\s\S]*?rememberPaymentIdempotency\('recharge-retry'/.test(server)],
 ['audit and notification are part of atomic commit',/withDbTransaction\(\[[^\]]*'audit','notifications'\][\s\S]*?db\.audit\.unshift\(auditRow\)[\s\S]*?notifyCustomer/.test(server)],
 ['save uses lock + revision check',/acquireLock\(\)[\s\S]*?diskRevision!==expectedRevision/.test(storage)],
 ['save writes temp file before atomic rename',/const tmp = DATA_FILE \+ '\.tmp\.'[\s\S]*?fs\.renameSync\(tmp, DATA_FILE\)/.test(storage)],
 ['save failure returns non-success response',/catch\(e\)\{\s*return json\(res,503,\{error:'Recharge retry save/.test(server)],
 ['successful retry response is emitted only after transaction commit',server.indexOf("withDbTransaction(['applications'") < server.indexOf("return json(res,201,{ok:true,payment:customerPayment(pay),recharge:customerRecharge(row)")],
 ['no partial direct save remains in retry endpoint',!(/db\.applications\.push\(app\);[\s\S]*?\n\s*save\(\);return json\(res,201/.test(server))],
 ['retry still remains cart/order independent',!/cart|order/i.test(server.match(/if\(p==='\/api\/customer\/recharge\/retry'[\s\S]*?(?=\n    if\(p===)/)?.[0]||'')]
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} — ${name}`);if(ok)pass++;}
const report={step:'STEP538',scope:'Recharge Retry Database/Transaction Integrity',total:checks.length,passed:pass,failed:checks.length-pass,ok:pass===checks.length,checks:checks.map(([name,ok])=>({name,ok}))};
fs.writeFileSync(path.join(__dirname,'STEP538_RECHARGE_RETRY_TRANSACTION_INTEGRITY_AUDIT_REPORT.md'),`# STEP538 — Recharge Retry Database & Transaction Integrity Audit\n\n${pass}/${checks.length} PASS\n\n`+checks.map(([n,o],i)=>`${i+1}. **${o?'PASS':'FAIL'}** — ${n}`).join('\n')+'\n');
fs.writeFileSync(path.join(__dirname,'STEP538_RECHARGE_RETRY_TRANSACTION_INTEGRITY_AUDIT_REPORT.json'),JSON.stringify(report,null,2));
process.exit(report.ok?0:1);

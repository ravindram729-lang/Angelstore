const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const childProcess=require('child_process');
const STORAGE=require('./storage');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||8000);
const SERVICE_INFO=require('./service-catalog');
const IS_PRODUCTION=String(process.env.NODE_ENV||'').toLowerCase()==='production';
const CONFIGURED_AUTH_SECRET=String(process.env.ANGELSTORE_AUTH_SECRET||'');
const AUTH_SECRET=CONFIGURED_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USER=String(process.env.ANGELSTORE_ADMIN_USER||(IS_PRODUCTION?'':'ravindram143')).trim();
const ADMIN_PASS=String(process.env.ANGELSTORE_ADMIN_PASS||'');
// Local-development fallback is intentionally hash-only in the credential store.
// Production still requires environment-provided credentials and rejects known weak passwords.
const LOCAL_ADMIN_SALT='5f7c3e2a9b1d4f68a0c5e7d9f1234567';
const LOCAL_ADMIN_HASH='96254d1fd313579edf05649a5afece1d2e26727ec87dc7219d413bab669cf89f8363557d2e6a70b2cf5949e6290a7382771cb30f736c1ebc04b82e3e04f18dda';
const FRONTEND_ORIGIN=process.env.ANGELSTORE_CORS_ORIGIN||(IS_PRODUCTION?'':'*');
const FRONTEND_ORIGINS=String(FRONTEND_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
const VALID_PRODUCTION_ORIGIN=FRONTEND_ORIGINS.length>0 && FRONTEND_ORIGINS.every(x=>/^https:\/\/[^*\s]+$/i.test(x));
const CONFIGURED_STORAGE_DIR=String(process.env.ANGELSTORE_STORAGE_DIR||'').trim();
function corsOrigin(req){const origin=String(req.headers.origin||'');if(!origin)return '';if(FRONTEND_ORIGINS.includes('*'))return '*';return FRONTEND_ORIGINS.includes(origin)?origin:''}
function corsHeaders(req){return {'Access-Control-Allow-Origin':corsOrigin(req),'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Customer-Session, X-Staff-Session, X-CSRF-Token','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Vary':'Origin'}}
const WEAK_PASSWORDS=new Set(['Love@143','Love@143#','password','password123','admin123','admin@123','changeme','change-me','ravindram143']);
const WEAK_ADMIN_USERS=new Set(['admin','administrator','root','user','change-me','ravindram143']);
const SECRET_HAS_ENTROPY=CONFIGURED_AUTH_SECRET.length>=32&&new Set(CONFIGURED_AUTH_SECRET).size>=12;
const ADMIN_PASS_HAS_ENTROPY=ADMIN_PASS.length>=12&&new Set(ADMIN_PASS).size>=8;
const PRODUCTION_CONFIG_ERROR=IS_PRODUCTION && (!SECRET_HAS_ENTROPY || !ADMIN_USER || WEAK_ADMIN_USERS.has(ADMIN_USER.toLowerCase()) || !ADMIN_PASS_HAS_ENTROPY || !VALID_PRODUCTION_ORIGIN || !CONFIGURED_STORAGE_DIR || !path.isAbsolute(CONFIGURED_STORAGE_DIR) || WEAK_PASSWORDS.has(ADMIN_PASS.toLowerCase()));
if(PRODUCTION_CONFIG_ERROR){
  console.error('Angelstore production configuration invalid. Set a high-entropy ANGELSTORE_AUTH_SECRET (>=32 chars), a non-default ANGELSTORE_ADMIN_USER, a strong ANGELSTORE_ADMIN_PASS (>=12 chars), ANGELSTORE_CORS_ORIGIN to explicit HTTPS origins, and ANGELSTORE_STORAGE_DIR to an absolute persistent-disk path.');
  process.exit(1);
}
const DATA=STORAGE.DATA_FILE;
const STORAGE_ROOT=STORAGE.STORAGE_ROOT;
const UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','payments'));
const DOCUMENT_UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_DOCUMENT_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','documents'));
const STAFF_PROOF_UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_STAFF_PROOF_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','staff-proof'));
const HOME_HERO_UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_HOME_HERO_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','homepage'));
fs.mkdirSync(STAFF_PROOF_UPLOAD_DIR,{recursive:true});
fs.mkdirSync(HOME_HERO_UPLOAD_DIR,{recursive:true});
const DOCUMENT_FILE_RE=/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|jpeg|png|webp)$/i;
const BACKUP_DIR=path.resolve(process.env.ANGELSTORE_BACKUP_DIR || path.join(STORAGE_ROOT,'backups'));
const UUID_FILE_BASE='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const LEGACY_HEX_FILE_BASE='[a-f0-9]{36}';
const PAYMENT_PROOF_FILE_RE=new RegExp(`^(?:${UUID_FILE_BASE}|${LEGACY_HEX_FILE_BASE})\.(pdf|png|jpg|webp)$`,'i');
const OFFICIAL_RECEIPT_FILE_RE=new RegExp(`^(?:${UUID_FILE_BASE})\.(pdf|png|jpg|jpeg|webp)$`,'i');
const OFFSITE_BACKUP_URL=String(process.env.ANGELSTORE_OFFSITE_BACKUP_URL||'').trim();
const OFFSITE_BACKUP_TOKEN=String(process.env.ANGELSTORE_OFFSITE_BACKUP_TOKEN||'').trim();
const OFFSITE_BACKUP_ENCRYPTION_KEY=String(process.env.ANGELSTORE_OFFSITE_BACKUP_ENCRYPTION_KEY||'').trim();
const PII_KEY=crypto.createHash('sha256').update(AUTH_SECRET+'|angelstore-pii-v1').digest();
function encryptPii(value){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',PII_KEY,iv);const raw=typeof value==='string'?value:JSON.stringify(value);const out=Buffer.concat([c.update(raw,'utf8'),c.final()]);return 'v1:'+iv.toString('base64url')+':'+c.getAuthTag().toString('base64url')+':'+out.toString('base64url')}
function decryptPii(value){try{const [v,iv,tag,data]=String(value||'').split(':');if(v!=='v1'||!iv||!tag||!data)return null;const d=crypto.createDecipheriv('aes-256-gcm',PII_KEY,Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));return d.update(Buffer.from(data,'base64url'),'','utf8')+d.final('utf8')}catch{return null}}
function maskedPiiFields(d){let f=d?.ocr_fields; if(!f&&d?.ocr_fields_enc){const raw=decryptPii(d.ocr_fields_enc);try{f=raw?JSON.parse(raw):null}catch{f=null}};f=f||{};const mask=(v,keep=4)=>{const x=String(v||'');if(!x)return null;return x.length<=keep?'*'.repeat(x.length):'*'.repeat(Math.max(0,x.length-keep))+x.slice(-keep)};return {detected_type:f.detected_type||'Unknown',aadhaar:mask(f.aadhaar,4),pan:mask(f.pan,4),mobile:mask(f.mobile,4),email:f.email?String(f.email).replace(/^(.{1,2}).*(@.*)$/,'$1***$2'):null,dob:f.dob?'****-**-**':null,percentage:f.percentage||null,total:f.total||null,obtained:f.obtained||null}}
const OCR_MAX_CONCURRENCY=Math.max(1,Number(process.env.ANGELSTORE_OCR_MAX_CONCURRENCY||2));
let ocrActive=0;
const OCR_LIMITER_QUEUE=[];
const OCR_JOB_QUEUE=[];
function runOcrLimited(task){return new Promise((resolve,reject)=>{const run=()=>{ocrActive++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{ocrActive--;const next=OCR_LIMITER_QUEUE.shift();if(next)next()})};if(ocrActive<OCR_MAX_CONCURRENCY)run();else OCR_LIMITER_QUEUE.push(run)})}
function execTesseract(inputPath,outputBase){return new Promise((resolve,reject)=>{childProcess.execFile('tesseract',[inputPath,outputBase,'-l','eng+Devanagari','--psm','6'],{timeout:30000,windowsHide:true},(error)=>error?reject(error):resolve())})}
async function processDocumentOcr(documentId){
  const doc=db.documents.find(x=>String(x.document_id||'')===String(documentId));
  if(!doc||doc.ocr_status==='completed'||doc.ocr_status==='not_supported')return;
  const fp=path.join(DOCUMENT_UPLOAD_DIR,doc.path||'');
  if(!doc.path||!fs.existsSync(fp)){doc.ocr_status='failed';doc.ocr_error='Document file missing';doc.updated_at=now();save();return;}
  const tmp=fp+'.ocr-'+crypto.randomUUID();
  try{
    doc.ocr_status='processing';doc.ocr_started_at=now();doc.ocr_error='';save();
    await runOcrLimited(async()=>{await execTesseract(fp,tmp)});
    const txt=fs.readFileSync(tmp+'.txt','utf8').slice(0,20000);
    doc.ocr_status='completed';doc.ocr_text_enc=encryptPii(txt);doc.ocr_fields_enc=encryptPii(extractOcrFields(txt));delete doc.ocr_text;delete doc.ocr_fields;doc.ocr_completed_at=now();doc.updated_at=now();
  }catch(e){
    doc.ocr_status='failed';doc.ocr_error=String(e?.message||e).slice(0,500);doc.ocr_completed_at=now();doc.updated_at=now();
  }finally{try{fs.unlinkSync(tmp+'.txt')}catch{};try{fs.unlinkSync(tmp)}catch{};save()}
}
function enqueueDocumentOcr(documentId){
  const doc=db.documents.find(x=>String(x.document_id||'')===String(documentId));
  if(!doc||!String(doc.mime_type||'').startsWith('image/'))return;
  doc.ocr_status='queued';doc.ocr_queued_at=now();
  OCR_JOB_QUEUE.push(()=>processDocumentOcr(documentId));
  drainOcrJobs();
}
function drainOcrJobs(){
  while(ocrActive<OCR_MAX_CONCURRENCY && OCR_JOB_QUEUE.length){
    const job=OCR_JOB_QUEUE.shift();
    Promise.resolve().then(job).catch(()=>{}).finally(()=>setImmediate(drainOcrJobs));
  }
}
function recoverPendingOcr(){
  for(const doc of db.documents||[]){
    if(String(doc.mime_type||'').startsWith('image/') && ['queued','processing'].includes(String(doc.ocr_status||''))){doc.ocr_status='queued';OCR_JOB_QUEUE.push(()=>processDocumentOcr(doc.document_id));}
  }
  if(OCR_JOB_QUEUE.length)setImmediate(drainOcrJobs);
}
function validateFileSignature(buf,mime){
  if(!Buffer.isBuffer(buf)||buf.length<4)return false;
  if(mime==='application/pdf')return buf.subarray(0,5).toString('ascii')==='%PDF-';
  if(mime==='image/png')return buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/jpeg')return buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff;
  if(mime==='image/webp')return buf.subarray(0,4).toString('ascii')==='RIFF'&&buf.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}
function validIsoDate(value){const v=String(value||'').trim();if(!v)return false;const d=new Date(v);return Number.isFinite(d.getTime())&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v)&&d.getTime()<=Date.now()+24*60*60*1000}
function encryptOffsitePayload(payload){
  if(!OFFSITE_BACKUP_ENCRYPTION_KEY) return null;
  const key=crypto.createHash('sha256').update(OFFSITE_BACKUP_ENCRYPTION_KEY).digest();
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
  return {version:1,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}
const SCHEDULED_BACKUP_ENABLED=String(process.env.ANGELSTORE_SCHEDULED_BACKUP||'').toLowerCase()==='true';
const SCHEDULED_BACKUP_HOURS=Math.max(1,Number(process.env.ANGELSTORE_BACKUP_INTERVAL_HOURS||24));
const BACKUP_RETENTION=Math.max(1,Number(process.env.ANGELSTORE_BACKUP_RETENTION||14));
const ALERT_WEBHOOK_URL=String(process.env.ANGELSTORE_ALERT_WEBHOOK_URL||'').trim();
const ALERT_WEBHOOK_TOKEN=String(process.env.ANGELSTORE_ALERT_WEBHOOK_TOKEN||'').trim();
const MONITOR_INTERVAL_MINUTES=Math.max(5,Number(process.env.ANGELSTORE_MONITOR_INTERVAL_MINUTES||15));
const BACKUP_OVERDUE_MULTIPLIER=Math.max(1.25,Number(process.env.ANGELSTORE_BACKUP_OVERDUE_MULTIPLIER||1.5));
fs.mkdirSync(UPLOAD_DIR,{recursive:true});
fs.mkdirSync(DOCUMENT_UPLOAD_DIR,{recursive:true});
fs.mkdirSync(BACKUP_DIR,{recursive:true});

// Storage v2: migration-safe repository over the current local JSON store.
// Existing records are preserved; new normalized collections are initialized empty.
let db=STORAGE.load();
let piiMigrated=false;for(const d of (db.documents||[])){if(d.ocr_text&&!d.ocr_text_enc){d.ocr_text_enc=encryptPii(String(d.ocr_text));delete d.ocr_text;piiMigrated=true}if(d.ocr_fields&&!d.ocr_fields_enc){d.ocr_fields_enc=encryptPii(d.ocr_fields);delete d.ocr_fields;piiMigrated=true}}if(piiMigrated)STORAGE.save(db);
db.staff_sessions=db.staff_sessions||[];
db.admin_sessions=db.admin_sessions||[];
db.incidents=db.incidents||[];
db.login_attempts=db.login_attempts||[];
db.staff_login_attempts=db.staff_login_attempts||[];
db.recharge_transactions=db.recharge_transactions||[];
// Recharge plans are configured by Admin. Do not seed sample prices that may be outdated.
db.recharge_plans=Array.isArray(db.recharge_plans)?db.recharge_plans:[];
// Remove only legacy sample rows inserted by older builds. Preserve any row an Admin has edited.
const LEGACY_SAMPLE_RECHARGE_IDS=new Set(['JIO-199','JIO-249','JIO-299','JIO-349','AIRTEL-199','AIRTEL-299','AIRTEL-349','AIRTEL-499','VI-199','VI-299','VI-349','VI-399','BSNL-199','BSNL-299','BSNL-397','BSNL-499']);
const beforeLegacyRechargeCount=db.recharge_plans.length;
db.recharge_plans=db.recharge_plans.filter(plan=>!LEGACY_SAMPLE_RECHARGE_IDS.has(String(plan.id||''))||!!String(plan.updated_by||'').trim());
if(db.recharge_plans.length!==beforeLegacyRechargeCount){
  db.audit.unshift({id:newId(),action:'LEGACY_SAMPLE_RECHARGE_PLANS_REMOVED',count:beforeLegacyRechargeCount-db.recharge_plans.length,at:now(),by:'system-migration'});
  save();
}
db.uppcl_manual_bills=db.uppcl_manual_bills||[];
db.uppcl_bill_requests=db.uppcl_bill_requests||[];
db.payment_idempotency=db.payment_idempotency||[];
db.financial_ledger=db.financial_ledger||[];
// STEP645: Partner referral catalogs. This is additive only: existing workflows/records remain untouched.
db.partner_banks=Array.isArray(db.partner_banks)?db.partner_banks:[
  {id:645001,name:'Kotak Mahindra Bank',account_type:'Savings / Current',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()},
  {id:645002,name:'IndusInd Bank',account_type:'Savings / Current',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()}
];
db.demat_partners=Array.isArray(db.demat_partners)?db.demat_partners:[
  {id:645101,name:'5paisa',account_type:'Demat & Trading',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()},
  {id:645102,name:'Lemonn',account_type:'Demat & Trading',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()},
  {id:645103,name:'Ventura',account_type:'Demat & Trading',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()},
  {id:645104,name:'Upstox',account_type:'Demat & Trading',logo:'',referral_link:'',active:true,created_at:now(),updated_at:now()}
];


// Remove expired sessions on process startup so stale authentication state is not retained indefinitely.
function cleanupSessions(){const t=Date.now();db.admin_sessions=db.admin_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t);db.staff_sessions=db.staff_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t);db.customer_sessions=db.customer_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t)}
cleanupSessions();

function save(){STORAGE.save(db)}
function withDbTransaction(collections, mutator, rollbackCleanup=()=>{}){
  const names=[...new Set(collections)];
  const snapshot={meta:db.meta?structuredClone(db.meta):undefined};
  for(const name of names){
    const value=db[name];
    snapshot[name]=value==null?value:structuredClone(value);
  }
  try{
    const result=mutator();
    save();
    return result;
  }catch(err){
    for(const name of names)db[name]=snapshot[name];
    if(snapshot.meta===undefined)delete db.meta;else db.meta=snapshot.meta;
    try{rollbackCleanup()}catch{}
    throw err;
  }
}
function paymentIdempotencyKey(req, body){
  return String(body?.idempotency_key||req.headers['idempotency-key']||'').trim().slice(0,100);
}
function paymentFingerprint(parts){
  return crypto.createHash('sha256').update(parts.map(x=>String(x??'')).join('|')).digest('hex');
}
function findPaymentIdempotency(scope,key,fingerprint){
  if(!key)return null;
  const row=db.payment_idempotency.find(x=>x.scope===scope&&x.key===key);
  if(!row)return null;
  if(row.fingerprint!==fingerprint)return {conflict:true,row};
  return row;
}
function rememberPaymentIdempotency(scope,key,fingerprint,extra={}){
  if(!key)return null;
  const row={id:newId(),scope,key,fingerprint,created_at:now(),...extra};
  db.payment_idempotency.unshift(row);
  return row;
}
function ledgerHash(row,prevHash=''){
  const payload=[prevHash,row.event_id,row.event_type,row.payment_id||'',row.recharge_id||'',row.application_id||'',row.amount||0,row.direction||'',row.status||'',row.created_at||'',row.source_ref||''].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}
function appendLedgerEvent(event){
  const rows=Array.isArray(db.financial_ledger)?db.financial_ledger:[];
  const key=String(event.event_key||'');
  if(key && rows.some(x=>x.event_key===key)) return false;
  const prev=rows[0]?.hash||'';
  const row={id:newId(),event_id:'LED-'+crypto.randomBytes(6).toString('hex').toUpperCase(),...event,created_at:event.created_at||now(),prev_hash:prev};
  row.hash=ledgerHash(row,prev);
  rows.unshift(row);db.financial_ledger=rows;
  return true;
}
function syncFinancialLedger(){
  let changed=false;
  const payments=Array.isArray(db.payments)?db.payments:[];
  for(const p of payments){
    const base={payment_id:p.id,application_id:p.application_id||null,amount:Number(p.amount||0),direction:'credit',source_ref:p.txn_id||`PAY-${p.id}`};
    changed=appendLedgerEvent({...base,event_type:'PAYMENT_CREATED',status:'Created',event_key:`payment-created:${p.id}`,created_at:p.created_at||now()})||changed;
    if(p.status==='Verified') changed=appendLedgerEvent({...base,event_type:'PAYMENT_VERIFIED',status:'Verified',event_key:`payment-verified:${p.id}`,created_at:p.verified_at||p.created_at||now()})||changed;
    if(p.status==='Rejected') changed=appendLedgerEvent({...base,event_type:'PAYMENT_REJECTED',status:'Rejected',event_key:`payment-rejected:${p.id}`,created_at:p.rejected_at||p.created_at||now()})||changed;
    if(p.service==='UPPCL Bill Payment' && p.uppcl_processing_status==='Completed') changed=appendLedgerEvent({...base,event_type:'UPPCL_COMPLETED',status:'Completed',event_key:`uppcl-completed:${p.id}`,created_at:p.completed_at||p.uppcl_processed_at||now()})||changed;
    if(p.receipt_no) changed=appendLedgerEvent({...base,event_type:'RECEIPT_GENERATED',status:'Generated',event_key:`receipt-generated:${p.id}:${p.receipt_no}`,created_at:p.receipt_generated_at||p.completed_at||now()})||changed;
  }
  const recharges=Array.isArray(db.recharge_transactions)?db.recharge_transactions:[];
  for(const r of recharges){
    if(!['Success','Failed'].includes(String(r.status||''))) continue;
    changed=appendLedgerEvent({recharge_id:r.id,payment_id:r.payment_id||null,application_id:r.application_id||null,amount:Number(r.amount||0),direction:'credit',source_ref:r.txn_id||`RECHARGE-${r.id}`,event_type:`RECHARGE_${String(r.status).toUpperCase()}`,status:r.status,event_key:`recharge-${String(r.status).toLowerCase()}:${r.id}`,created_at:r.completed_at||r.updated_at||r.created_at||now()})||changed;
  }
  if(changed) save();
  return changed;
}
function financialLedgerAudit(){
  syncFinancialLedger();
  const rows=(db.financial_ledger||[]).slice();
  const issues=[]; let prev='';
  const payments=new Map((db.payments||[]).map(x=>[String(x.id),x]));
  const recharges=new Map((db.recharge_transactions||[]).map(x=>[String(x.id),x]));
  const applications=new Map((db.applications||[]).map(x=>[String(x.id),x]));
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    const expectedPrev=i<rows.length-1?(rows[i+1].hash||''):'';
    const expected=ledgerHash(row,row.prev_hash||'');
    if((row.prev_hash||'')!==expectedPrev || row.hash!==expected) issues.push({type:'LEDGER_HASH_CHAIN_BROKEN',severity:'critical',event_id:row.event_id,message:`Ledger event ${row.event_id} hash chain validation failed.`,event_key:row.event_key});
    if(row.payment_id && !payments.has(String(row.payment_id))) issues.push({type:'LEDGER_ORPHAN_PAYMENT',severity:'high',event_id:row.event_id,payment_id:row.payment_id,message:'Ledger event references a missing payment.'});
    if(row.recharge_id && !recharges.has(String(row.recharge_id))) issues.push({type:'LEDGER_ORPHAN_RECHARGE',severity:'high',event_id:row.event_id,recharge_id:row.recharge_id,message:'Ledger event references a missing recharge.'});
    if(row.application_id && !applications.has(String(row.application_id))) issues.push({type:'LEDGER_ORPHAN_APPLICATION',severity:'high',event_id:row.event_id,application_id:row.application_id,message:'Ledger event references a missing application.'});
    if(row.payment_id && payments.has(String(row.payment_id))){const payment=payments.get(String(row.payment_id));if(Math.abs(Number(row.amount||0)-Number(payment.amount||0))>0.009) issues.push({type:'LEDGER_AMOUNT_MISMATCH',severity:'critical',event_id:row.event_id,payment_id:row.payment_id,message:'Ledger amount does not match payment amount.'});}
  }
  const verifiedPayments=(db.payments||[]).filter(p=>p.status==='Verified');
  const verifiedTotal=verifiedPayments.reduce((a,p)=>a+Number(p.amount||0),0);
  const ledgerVerified=(rows.filter(x=>x.event_type==='PAYMENT_VERIFIED').reduce((a,x)=>a+Number(x.amount||0),0));
  if(Math.abs(verifiedTotal-ledgerVerified)>0.009) issues.push({type:'LEDGER_VERIFIED_TOTAL_MISMATCH',severity:'critical',message:`Verified payment total ₹${verifiedTotal.toFixed(2)} does not match ledger total ₹${ledgerVerified.toFixed(2)}.`});
  return {ok:issues.length===0,issue_count:issues.length,issues:issues.slice(0,300),checked:{ledger_entries:rows.length,payments:(db.payments||[]).length,recharges:(db.recharge_transactions||[]).length,applications:(db.applications||[]).length},summary:{verified_collection:money(verifiedTotal),pending_collection:money((db.payments||[]).filter(p=>p.status==='Pending Verification').reduce((a,p)=>a+Number(p.amount||0),0)),rejected_amount:money((db.payments||[]).filter(p=>p.status==='Rejected').reduce((a,p)=>a+Number(p.amount||0),0)),recharge_success:money((db.recharge_transactions||[]).filter(r=>r.status==='Success').reduce((a,r)=>a+Number(r.amount||0),0)),uppcl_completed:money((db.payments||[]).filter(p=>p.service==='UPPCL Bill Payment'&&p.uppcl_processing_status==='Completed').reduce((a,p)=>a+Number(p.amount||0),0)),receipts:(db.payments||[]).filter(p=>p.receipt_no).length},chain_head:rows[0]?.hash||null,checked_at:now()};
}

// Recover OCR jobs that were queued/processing before a server restart.
recoverPendingOcr();
function tokenLifecycleHealthMonitor(){
  const issues=[];
  const tokens=Array.isArray(db.tokens)?db.tokens:[];
  const add=(type,severity,message,extra={})=>issues.push({type,severity,message,...extra});
  // Build token-scoped indexes once so a health scan stays close to O(tokens + audit + notifications)
  // instead of repeatedly filtering the full audit/notification collections for every token.
  const auditByToken=new Map();
  for(const row of (db.audit||[])){const id=Number(row.token_id||0);if(!id)continue;const list=auditByToken.get(id);if(list)list.push(row);else auditByToken.set(id,[row]);}
  const notesByToken=new Map();
  for(const row of (db.notifications||[])){const id=Number(row.token_id||0);if(!id)continue;const list=notesByToken.get(id);if(list)list.push(row);else notesByToken.set(id,[row]);}
  const ctx={auditByToken,notesByToken};
  const active=tokens.filter(t=>['लंबित','बुलाया','प्रगति','होल्ड','स्किप'].includes(String(t.status||'')));
  for(const t of active){
    const r=tokenLifecycleReconcile(t,ctx);
    if(!r.ok) add('TOKEN_LIFECYCLE_INCONSISTENT',r.issues.some(x=>String(x).includes('payment')||String(x).includes('receipt'))?'high':'critical',`Token ${t.token||t.id} lifecycle inconsistency: ${r.issues.join('; ')}`,{token_id:t.id,token:t.token,issues:r.issues,state_revision:Number(t.state_revision||0)});
    if(r.warnings.length) add('TOKEN_LIFECYCLE_WARNING','warning',`Token ${t.token||t.id} lifecycle warning: ${r.warnings.join('; ')}`,{token_id:t.id,token:t.token,warnings:r.warnings,state_revision:Number(t.state_revision||0)});
    if(['बुलाया','प्रगति','होल्ड'].includes(t.status) && !t.staff_id) add('TOKEN_ACTIVE_WITHOUT_STAFF','warning',`Active token ${t.token||t.id} has no assigned staff.`,{token_id:t.id,token:t.token,status:t.status});
    if(t.status==='होल्ड' && !t.hold_reason) add('TOKEN_HOLD_WITHOUT_REASON','warning',`Held token ${t.token||t.id} has no hold reason.`,{token_id:t.id,token:t.token});
    if(['बुलाया','प्रगति','होल्ड'].includes(t.status) && t.completed_at) add('TOKEN_ACTIVE_WITH_COMPLETION_TIME','high',`Active token ${t.token||t.id} has completed_at set.`,{token_id:t.id,token:t.token});
  }
  const completed=tokens.filter(t=>t.status==='पूर्ण');
  for(const t of completed){
    const r=tokenLifecycleReconcile(t,ctx);
    if(!r.ok) add('TOKEN_COMPLETED_LIFECYCLE_INCONSISTENT','critical',`Completed token ${t.token||t.id} is inconsistent: ${r.issues.join('; ')}`,{token_id:t.id,token:t.token,issues:r.issues});
  }
  return {ok:issues.length===0,issue_count:issues.length,issues:issues.slice(0,300),checked:{tokens:tokens.length,active:active.length,completed:completed.length},checked_at:now()};
}
function rechargeRetryRecoveryAudit(){
  const issues=[];
  const add=(type,severity,message,extra={})=>issues.push({type,severity,message,...extra});
  const recharges=Array.isArray(db.recharge_transactions)?db.recharge_transactions:[];
  const payments=Array.isArray(db.payments)?db.payments:[];
  const applications=Array.isArray(db.applications)?db.applications:[];
  const idems=Array.isArray(db.payment_idempotency)?db.payment_idempotency:[];
  const paymentById=new Map(payments.map(x=>[String(x.id),x]));
  const appById=new Map(applications.map(x=>[String(x.id),x]));
  const rechargeById=new Map(recharges.map(x=>[String(x.id),x]));
  for(const r of recharges.filter(x=>x.source==='customer-recharge-retry')){
    if(!r.payment_id || !paymentById.has(String(r.payment_id))) add('RECHARGE_RETRY_ORPHAN_PAYMENT','critical',`Retry recharge ${r.id} references missing payment.`,{recharge_id:r.id,payment_id:r.payment_id});
    if(!r.application_id || !appById.has(String(r.application_id))) add('RECHARGE_RETRY_ORPHAN_APPLICATION','critical',`Retry recharge ${r.id} references missing application.`,{recharge_id:r.id,application_id:r.application_id});
    const pay=r.payment_id?paymentById.get(String(r.payment_id)):null;
    const app=r.application_id?appById.get(String(r.application_id)):null;
    if(pay && Number(pay.application_id)!==Number(r.application_id)) add('RECHARGE_RETRY_PAYMENT_APPLICATION_MISMATCH','critical',`Retry recharge ${r.id} payment/application link mismatch.`,{recharge_id:r.id,payment_id:r.payment_id,application_id:r.application_id});
    if(app && String(app.retry_of_recharge_id||'')!==String(r.retry_of_recharge_id||'')) add('RECHARGE_RETRY_APPLICATION_PARENT_MISMATCH','high',`Retry recharge ${r.id} application parent reference mismatch.`,{recharge_id:r.id,application_id:r.application_id});
    if(pay && String(pay.retry_of_recharge_id||'')!==String(r.retry_of_recharge_id||'')) add('RECHARGE_RETRY_PAYMENT_PARENT_MISMATCH','high',`Retry recharge ${r.id} payment parent reference mismatch.`,{recharge_id:r.id,payment_id:r.payment_id});
    if(r.retry_of_recharge_id && !rechargeById.has(String(r.retry_of_recharge_id))) add('RECHARGE_RETRY_MISSING_PARENT','high',`Retry recharge ${r.id} references a missing parent attempt.`,{recharge_id:r.id,parent_id:r.retry_of_recharge_id});
  }
  for(const idem of idems.filter(x=>x.scope==='recharge-retry')){
    if(idem.payment_id && !paymentById.has(String(idem.payment_id))) add('RECHARGE_RETRY_ORPHAN_IDEMPOTENCY','high',`Retry idempotency record ${idem.key} references missing payment.`,{key:idem.key});
    if(idem.recharge_id && !rechargeById.has(String(idem.recharge_id))) add('RECHARGE_RETRY_IDEMPOTENCY_MISSING_RECHARGE','high',`Retry idempotency record ${idem.key} references missing recharge.`,{key:idem.key});
    if(idem.application_id && !appById.has(String(idem.application_id))) add('RECHARGE_RETRY_IDEMPOTENCY_MISSING_APPLICATION','high',`Retry idempotency record ${idem.key} references missing application.`,{key:idem.key});
  }
  const referencedProofs=new Set(payments.map(p=>path.basename(String(p.screenshot||''))).filter(Boolean));
  let orphanProofs=[];
  try{
    const cutoff=Date.now()-30*60*1000;
    orphanProofs=fs.readdirSync(UPLOAD_DIR).filter(name=>/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(name)&&!referencedProofs.has(name)).filter(name=>{try{return fs.statSync(path.join(UPLOAD_DIR,name)).mtimeMs<cutoff}catch{return false}});
  }catch{}
  if(orphanProofs.length) add('ORPHAN_PAYMENT_PROOF_FILES','warning',`${orphanProofs.length} unreferenced payment proof file(s) older than recovery grace period found.`,{files:orphanProofs.slice(0,50)});
  return {ok:issues.length===0,issue_count:issues.length,issues:issues.slice(0,300),checked:{retry_recharges:recharges.filter(x=>x.source==='customer-recharge-retry').length,retry_idempotency:idems.filter(x=>x.scope==='recharge-retry').length,orphan_proof_files:orphanProofs.length},checked_at:now()};
}
function cleanupRecoveredOrphanProofs(){
  const audit=rechargeRetryRecoveryAudit();
  const removed=[];
  for(const file of (audit.issues.find(x=>x.type==='ORPHAN_PAYMENT_PROOF_FILES')?.files||[])){
    try{fs.unlinkSync(path.join(UPLOAD_DIR,file));removed.push(file)}catch{}
  }
  return {audit,removed};
}
function rechargeRetryObservability(){
  const recharges=Array.isArray(db.recharge_transactions)?db.recharge_transactions:[];
  const retryRows=recharges.filter(r=>r.source==='customer-recharge-retry');
  const byStatus={Pending:0,Success:0,Failed:0,other:0};
  for(const r of retryRows){const k=['Pending','Success','Failed'].includes(String(r.status))?String(r.status):'other';byStatus[k]++}
  const auditRows=Array.isArray(db.audit)?db.audit:[];
  const sinceMs=Date.now()-24*60*60*1000;
  const recent=auditRows.filter(a=>{const t=Date.parse(String(a.at||''));return Number.isFinite(t)&&t>=sinceMs});
  const count=(action)=>recent.filter(a=>a.action===action).length;
  const idems=(db.payment_idempotency||[]).filter(x=>x.scope==='recharge-retry');
  const incidents=(db.incidents||[]).filter(x=>x.type==='RECHARGE_RETRY_RECOVERY');
  const openIncidents=incidents.filter(x=>x.status==='open').length;
  const webhookAttempts=incidents.reduce((n,x)=>n+(x.alert_result?1:0)+(x.recovery_alert_result?1:0),0);
  const webhookFailures=incidents.reduce((n,x)=>n+(x.alert_result&&!x.alert_result.sent?1:0)+(x.recovery_alert_result&&!x.recovery_alert_result.sent?1:0),0);
  const groups=new Set(retryRows.map(r=>String(r.retry_group_id||r.id)));
  return {window_hours:24,retries_total:retryRows.length,retry_groups:groups.size,status_counts:byStatus,attempts_submitted_24h:count('CUSTOMER_RECHARGE_RETRY_SUBMITTED'),retries_completed_24h:count('RECHARGE_COMPLETED'),retry_receipts_24h:count('RECHARGE_RECEIPT_GENERATED'),payment_rejected_24h:count('PAYMENT_REJECTED'),idempotency_records:idems.length,open_recovery_incidents:openIncidents,incident_webhook_attempts:webhookAttempts,incident_webhook_failures:webhookFailures,checked_at:now()};
}
function monitorSnapshot(){
  const integrity=integrityCheck();
  const storage=storageStatus();
  let backupFiles=[]; try{backupFiles=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x));}catch{}
  let latest=null;
  for(const name of backupFiles){try{const st=fs.statSync(path.join(BACKUP_DIR,name));if(!latest||st.mtimeMs>latest.mtimeMs)latest={name,mtimeMs:st.mtimeMs,created_at:st.mtime.toISOString()};}catch{}}
  const backupAgeMinutes=latest?Math.max(0,(Date.now()-latest.mtimeMs)/60000):null;
  const backupOverdue=!latest || backupAgeMinutes > (SCHEDULED_BACKUP_HOURS*60*BACKUP_OVERDUE_MULTIPLIER);
  const reconciliation=globalPaymentReconciliation();
  const ledger=financialLedgerAudit();
  const token_lifecycle=tokenLifecycleHealthMonitor();
  const recharge_retry_recovery=rechargeRetryRecoveryAudit();
  const recharge_retry_observability=rechargeRetryObservability();
  return {integrity,storage,backup:{configured:SCHEDULED_BACKUP_ENABLED,overdue:backupOverdue,age_minutes:backupAgeMinutes,last_backup:latest?.name||null},offsite:{configured:!!OFFSITE_BACKUP_URL},reconciliation:{ok:reconciliation.ok,issue_count:reconciliation.issue_count,issues:reconciliation.issues.slice(0,50)},financial_ledger:{ok:ledger.ok,issue_count:ledger.issue_count,issues:ledger.issues.slice(0,50),chain_head:ledger.chain_head},token_lifecycle:{ok:token_lifecycle.ok,issue_count:token_lifecycle.issue_count,issues:token_lifecycle.issues.slice(0,50),checked:token_lifecycle.checked},recharge_retry_recovery:{ok:recharge_retry_recovery.ok,issue_count:recharge_retry_recovery.issue_count,issues:recharge_retry_recovery.issues.slice(0,50),checked:recharge_retry_recovery.checked},recharge_retry_observability,checked_at:now()};
}
function incidentKey(type){return 'ANGEL-'+type;}
function activeIncident(type){return db.incidents.find(x=>x.key===incidentKey(type)&&x.status==='open');}
async function sendAlertWebhook(event){
  if(!ALERT_WEBHOOK_URL)return {configured:false,sent:false};
  try{
    const headers={'Content-Type':'application/json'}; if(ALERT_WEBHOOK_TOKEN)headers.Authorization='Bearer '+ALERT_WEBHOOK_TOKEN;
    const r=await fetch(ALERT_WEBHOOK_URL,{method:'POST',headers,body:JSON.stringify({source:'angelstore-csc',event})});
    return {configured:true,sent:r.ok,status:r.status};
  }catch(e){return {configured:true,sent:false,error:String(e.message||e)}}
}
async function reconcileIncidents(source='monitor'){
  const m=monitorSnapshot();
  const checks=[];
  if(!m.integrity.ok)checks.push({type:'DATABASE_INTEGRITY',severity:'critical',message:'Database integrity check failed'});
  if(!m.storage.persistence_configured)checks.push({type:'STORAGE_PERSISTENCE',severity:'critical',message:'Persistent storage is not configured'});
  else if(!m.storage.data_file?.exists || !m.storage.data_file?.writable)checks.push({type:'DATABASE_STORAGE',severity:'critical',message:'Database storage is unavailable'});
  if(SCHEDULED_BACKUP_ENABLED && m.backup.overdue)checks.push({type:'BACKUP_OVERDUE',severity:'warning',message:m.backup.last_backup?`Backup overdue; last backup ${m.backup.last_backup}`:'No backup found'});
  if(SCHEDULED_BACKUP_ENABLED && OFFSITE_BACKUP_URL && !m.offsite.configured)checks.push({type:'OFFSITE_BACKUP_CONFIG',severity:'warning',message:'Off-site backup configuration is incomplete'});
  if(SCHEDULED_BACKUP_ENABLED && OFFSITE_BACKUP_URL && !OFFSITE_BACKUP_ENCRYPTION_KEY)checks.push({type:'OFFSITE_BACKUP_ENCRYPTION',severity:'critical',message:'Off-site backup is enabled but encryption key is missing; uploads are blocked until encryption is configured'});
  if(m.reconciliation.issue_count) { const critical=m.reconciliation.issues.some(x=>x.severity==='critical'); checks.push({type:'GLOBAL_PAYMENT_RECONCILIATION',severity:critical?'critical':'high',message:`Global payment reconciliation found ${m.reconciliation.issue_count} issue(s).`}); }
  if(m.financial_ledger.issue_count) { const critical=m.financial_ledger.issues.some(x=>x.severity==='critical'); checks.push({type:'FINANCIAL_LEDGER_INTEGRITY',severity:critical?'critical':'high',message:`Financial ledger audit found ${m.financial_ledger.issue_count} issue(s).`}); }
  if(m.token_lifecycle.issue_count) { const critical=m.token_lifecycle.issues.some(x=>x.severity==='critical'); checks.push({type:'TOKEN_LIFECYCLE_HEALTH',severity:critical?'critical':'high',message:`Token lifecycle monitor found ${m.token_lifecycle.issue_count} issue(s).`}); }
  if(m.recharge_retry_recovery.issue_count) { const critical=m.recharge_retry_recovery.issues.some(x=>x.severity==='critical'); checks.push({type:'RECHARGE_RETRY_RECOVERY',severity:critical?'critical':'high',message:`Recharge retry recovery audit found ${m.recharge_retry_recovery.issue_count} issue(s).`}); }
  const wanted=new Set(checks.map(x=>x.type));
  for(const c of checks){
    let inc=activeIncident(c.type);
    if(!inc){
      inc={id:newId(),key:incidentKey(c.type),type:c.type,severity:c.severity,status:'open',message:c.message,opened_at:now(),last_seen_at:now(),source,alert_sent:false};
      db.incidents.unshift(inc); db.notifications=db.notifications||[]; db.notifications.unshift({id:newId(),type:'incident',severity:c.severity,title:c.type,message:c.message,read:false,created_at:now()});
      const alert=await sendAlertWebhook({action:'incident_opened',incident:inc}); inc.alert_sent=!!alert.sent; inc.alert_result=alert;
    }else{inc.last_seen_at=now();inc.message=c.message;inc.severity=c.severity;}
  }
  for(const inc of db.incidents.filter(x=>x.status==='open')){
    if(!wanted.has(inc.type)){
      inc.status='resolved';inc.resolved_at=now();inc.resolution_source=source;
      const alert=await sendAlertWebhook({action:'incident_resolved',incident:inc});inc.recovery_alert_sent=!!alert.sent;inc.recovery_alert_result=alert;
    }
  }
  save();
  return {monitor:m,open:db.incidents.filter(x=>x.status==='open'),resolved_at:now()};
}
async function startMonitoring(){
  // Recover crash-left payment proofs only when they are unreferenced and older than a grace period.
  // This avoids deleting legitimate newly uploaded files while cleaning artifacts from a killed request.
  try { const recovery=cleanupRecoveredOrphanProofs(); if(recovery.removed.length) console.warn(`Recovered ${recovery.removed.length} orphan payment proof file(s) after restart.`); } catch(e) { console.error('Payment proof recovery cleanup failed',e.message); }
  // Complete the initial persistence/reconciliation pass before accepting requests.
  // Otherwise the first login/write can race the startup save and trip the revision guard.
  try { await reconcileIncidents('startup'); }
  catch(e){ console.error('Initial monitoring failed',e.message); }
  const ms=MONITOR_INTERVAL_MINUTES*60*1000;
  setInterval(()=>reconcileIncidents('scheduled').catch(e=>console.error('Scheduled monitoring failed',e.message)),ms).unref?.();
}
function integrityCheck(){
  db.custom_services??=[];
  const required=['tokens','payments','customers','applications','documents','appointments','staff','staff_sessions','admin_sessions','service_sops','service_quality','home_services','deliveries','commissions','settlements','expenses','complaints','audit'];
  const missing=required.filter(k=>!Array.isArray(db[k]));
  const duplicateIds={};
  for(const key of required){
    if(!Array.isArray(db[key])) continue;
    const seen=new Set(); let dup=0;
    for(const row of db[key]){const id=row&&row.id;if(id===undefined||id===null)continue;const k=String(id);if(seen.has(k))dup++;else seen.add(k)}
    if(dup)duplicateIds[key]=dup;
  }
  const brokenPayments=db.payments.filter(x=>x.token_id&&!db.tokens.some(t=>Number(t.id)===Number(x.token_id))).length;
  const brokenTokens=db.tokens.filter(x=>x.payment_id&&!db.payments.some(p=>Number(p.id)===Number(x.payment_id))).length;
  const orphanSessions=db.customer_sessions.filter(x=>x.customer_id&&!db.customers.some(c=>c.customer_id===x.customer_id)).length;
  let missingPaymentProofs=0, mismatchedPaymentProofs=0, missingDocuments=0, mismatchedDocuments=0;
  for(const pay of db.payments){
    if(!pay.screenshot) continue;
    const fp=path.join(UPLOAD_DIR,path.basename(String(pay.screenshot)));
    if(!fs.existsSync(fp)){missingPaymentProofs++;continue;}
    const expectedProofHash=String(pay.proof_sha256||pay.screenshot_sha256||'').toLowerCase();
    if(expectedProofHash){try{const actual=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');if(actual!==expectedProofHash)mismatchedPaymentProofs++;}catch{mismatchedPaymentProofs++;}}
  }
  for(const doc of db.documents){
    if(!doc.path) continue;
    const fp=path.join(DOCUMENT_UPLOAD_DIR,path.basename(String(doc.path)));
    if(!fs.existsSync(fp)){missingDocuments++;continue;}
    if(doc.sha256){try{const actual=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');if(actual!==String(doc.sha256).toLowerCase())mismatchedDocuments++;}catch{mismatchedDocuments++;}}
  }
  return {ok:missing.length===0&&Object.keys(duplicateIds).length===0&&brokenPayments===0&&brokenTokens===0&&orphanSessions===0&&missingPaymentProofs===0&&mismatchedPaymentProofs===0&&missingDocuments===0&&mismatchedDocuments===0,missing,duplicate_ids:duplicateIds,broken_payment_token_links:brokenPayments,broken_token_payment_links:brokenTokens,orphan_customer_sessions:orphanSessions,missing_payment_proofs:missingPaymentProofs,mismatched_payment_proofs:mismatchedPaymentProofs,missing_documents:missingDocuments,mismatched_documents:mismatchedDocuments,counts:Object.fromEntries(required.map(k=>[k,Array.isArray(db[k])?db[k].length:0])),schema_version:db.meta?.schema_version||null,checked_at:now()};
}
function now(){return new Date().toISOString()}
function today(){return now().slice(0,10)}
let idSequence=0;
function allBusinessIds(){
  const keys=['tokens','payments','customers','applications','documents','notifications','audit','offers','service_charges','customer_sessions','customer_qr','admin_sessions','admin_credentials','staff_sessions','staff','staff_roles','appointments','service_orders','home_services','deliveries','commissions','settlements','expenses','complaints','staff_attendance','service_sops','service_checklists','service_quality','service_configs','incidents'];
  const out=new Set();
  for(const key of keys){for(const row of (db[key]||[])){if(row&&row.id!==undefined)out.add(Number(row.id));}}
  return out;
}
function newId(){
  // Keep legacy numeric IDs compatible while staying below Number.MAX_SAFE_INTEGER.
  const used=allBusinessIds();
  for(let attempt=0;attempt<20;attempt++){
    const base=Date.now()*1000;
    const candidate=base+((idSequence=(idSequence+1)%1000)+crypto.randomInt(0,1000))%1000;
    if(Number.isSafeInteger(candidate) && !used.has(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a unique numeric ID');
}
function json(res,status,obj,extra={}){
  const b=Buffer.from(JSON.stringify(obj));
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'Access-Control-Allow-Origin':(res._corsOrigin!==undefined?res._corsOrigin:''),'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Customer-Session, X-Staff-Session, X-CSRF-Token','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'",...(IS_PRODUCTION?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{}),...extra,...(res._setCookies?{'Set-Cookie':res._setCookies}:{}),'Content-Length':b.length
  });res.end(b)
}
const MAX_JSON_BODY_BYTES=15*1024*1024;
function body(req){return new Promise((resolve,reject)=>{const chunks=[];let total=0,settled=false;const fail=(err,close=false)=>{if(settled)return;settled=true;reject(err);if(close)req.destroy()};req.on('data',c=>{if(settled)return;const chunk=Buffer.isBuffer(c)?c:Buffer.from(c);total+=chunk.length;if(total>MAX_JSON_BODY_BYTES)return fail(new Error('Payload too large'),true);chunks.push(chunk)});req.on('end',()=>{if(settled)return;try{const s=Buffer.concat(chunks).toString('utf8');settled=true;resolve(s?JSON.parse(s):{})}catch{fail(new Error('Invalid JSON'))}});req.on('error',fail)})}
function b64u(v){return Buffer.from(v).toString('base64url')}
function sign(payload){const p=b64u(JSON.stringify(payload));const s=crypto.createHmac('sha256',AUTH_SECRET).update(p).digest('base64url');return p+'.'+s}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out}
function cookieFlags(req,httpOnly=true){return `Path=/; ${IS_PRODUCTION?'Secure; ':''}${IS_PRODUCTION?'SameSite=None':'SameSite=Lax'}${httpOnly?'; HttpOnly':''}`}
function setAuthCookies(res,req,{adminToken=null,staffToken=null,customerToken=null,clear=false}={}){const csrf=clear?'':crypto.randomBytes(24).toString('base64url');const max=clear?0:60*60*24*30;const cookies=[];for(const [name,val] of [['angel_admin',adminToken],['angel_staff',staffToken],['angel_customer',customerToken]]){if(val||clear)cookies.push(`${name}=${val||''}; Max-Age=${clear?0:max}; ${cookieFlags(req,true)}`)}cookies.push(`angel_csrf=${encodeURIComponent(csrf)}; Max-Age=${clear?0:max}; ${cookieFlags(req,false)}`);res._setCookies=(res._setCookies||[]).concat(cookies)}
function csrfOk(req){const method=String(req.method||'GET').toUpperCase();if(!['POST','PUT','PATCH','DELETE'].includes(method))return true;const c=parseCookies(req);if(!(c.angel_admin||c.angel_staff||c.angel_customer))return true;return !!c.angel_csrf&&String(req.headers['x-csrf-token']||'')===c.angel_csrf}
function verify(token,kind){try{const [p,s]=String(token||'').split('.');if(!p||!s)return null;const expected=crypto.createHmac('sha256',AUTH_SECRET).update(p).digest('base64url');const a=Buffer.from(s),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;const x=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));if(Number(x.exp)<=Date.now()||x.kind!==kind)return null;return x}catch{return null}}
function admin(req){const c=parseCookies(req);const h=req.headers.authorization||'';const raw=c.angel_admin||((h.startsWith('Bearer '))?h.slice(7):'');const x=verify(raw,'admin');if(!x)return null;if(x.sid){const active=db.admin_sessions.find(s=>s.sid===x.sid&&!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now());if(!active)return null}return x}
function customer(req){const c=parseCookies(req);const h=String(req.headers['x-customer-session']||'');const a=String(req.headers.authorization||'');const raw=c.angel_customer||h||(a.startsWith('Bearer ')?a.slice(7):'');const x=verify(raw,'customer');if(!x)return null;if(x.sid){const active=db.customer_sessions.find(s=>s.sid===x.sid&&s.customer_id===x.customer_id&&!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now());if(!active)return null}return x}
function customerSession(req){const x=customer(req);return x&&x.sid?x:null}
function guestApplication(req){const h=String(req.headers['x-customer-session']||'');const a=String(req.headers.authorization||'');const raw=h||(a.startsWith('Bearer ')?a.slice(7):'');const x=verify(raw,'customer');if(!x||x.sid||!x.application_id||!validMobile(x.mobile))return null;const app=applicationFor(x.application_id);if(!app||app.mobile!==x.mobile)return null;return x}
function customerAccess(req){return customerSession(req)||guestApplication(req)}
function validMobile(m){return /^\d{10}$/.test(String(m||''))}
function validUtr(u){return /^[A-Za-z0-9._\-/]{6,50}$/.test(String(u||''))}
function extractOcrFields(text){
  const raw=String(text||'').replace(/\r/g,' ').replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
  const compact=raw.replace(/[^A-Za-z0-9]/g,'');
  const aadhaar=(raw.match(/\b(?:\d{4}[ -]?){2}\d{4}\b/)||[])[0]?.replace(/[ -]/g,'')||null;
  const pan=(raw.toUpperCase().match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/)||[])[0]||null;
  const mobile=(raw.match(/(?:\+91[- ]?)?[6-9]\d{9}\b/)||[])[0]?.replace(/\D/g,'').slice(-10)||null;
  const email=(raw.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)||[])[0]||null;
  const dob=(raw.match(/\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/)||[])[0]||null;
  const percentage=(raw.match(/\b(?:percentage|percent|प्रतिशत|marks?)\D{0,12}(\d{1,3}(?:\.\d+)?)\s*%?/i)||[])[1]||null;
  const total=(raw.match(/\b(?:total|कुल)\D{0,12}(\d+(?:\.\d+)?)\b/i)||[])[1]||null;
  const obtained=(raw.match(/\b(?:obtained|secured|प्राप्त)\D{0,12}(\d+(?:\.\d+)?)\b/i)||[])[1]||null;
  const upper=raw.toUpperCase();
  let detected_type='Unknown';
  if(pan||/\bPAN\b|INCOME TAX/i.test(upper))detected_type='PAN';
  else if(aadhaar||/AADHAAR|UIDAI|\bUID\b/i.test(upper))detected_type='Aadhaar';
  else if(/MARKSHEET|MARK SHEET|BOARD|ROLL NO|PERCENTAGE|प्रतिशत/i.test(raw))detected_type='Marksheet/Certificate';
  else if(/CERTIFICATE|प्रमाण पत्र/i.test(raw))detected_type='Certificate';
  return {detected_type,aadhaar:aadhaar&&/^\d{12}$/.test(aadhaar)?aadhaar:null,pan,mobile,email,dob,percentage,total,obtained};
}
function serviceParts(service){const a=String(service||'').split(' — ');return {category:a.shift()||'',service:a.join(' — ')} }
function customServiceRow(category,service){return (db.custom_services||[]).find(x=>x.category===category&&x.name===service)||null}
function serviceRow(category,service){return db.service_charges.find(x=>x.category===category&&x.service===service)||null}
function chargeFor(service){const p=serviceParts(service),saved=serviceRow(p.category,p.service);if(saved)return Number(saved.total||0);const custom=customServiceRow(p.category,p.service);if(custom)return custom.published===false?null:Number(custom.fee||0);const info=SERVICE_INFO[p.category],sub=info?.services?.find(x=>x.name===p.service);if(!sub)return null;const govt=Number(String(sub.govt||'').replace(/,/g,'').match(/₹\s*([0-9]+(?:\.[0-9]+)?)/)?.[1]||0);return Number((govt+Number(sub.csc||0)).toFixed(2))}
function serviceExists(service){return chargeFor(service)!==null}function activeOfferById(id){
  const offer=db.offers.find(o=>Number(o.id)===Number(id));
  if(!offer||offer.published===false||offer.type!=='OFFER')return null;
  const n=new Date();
  if(offer.starts_at&&new Date(offer.starts_at)>n)return null;
  if(offer.expires_at&&new Date(offer.expires_at)<=n)return null;
  const price=Number(offer.offer_price);
  if(!Number.isFinite(price)||price<=0)return null;
  return offer;
}
function payableAmountFor(service, offerId){
  if(offerId){
    const o=activeOfferById(offerId);
    if(!o||String(o.service||'')!==String(service))return null;
    return Number(Number(o.offer_price).toFixed(2));
  }
  return chargeFor(service);
}
function appointmentForCustomer(service,mobile){
  return db.appointments.filter(a=>a.mobile===mobile&&a.service===service&&['स्वीकृत','पुष्टि','अनुरोध'].includes(a.status)).sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
}

function serviceConfigDefaults(category, service){
  const raw=(String(category)+' '+String(service)).toLowerCase();
  const noToken=/(recharge|bill payment|shopping|affiliate|electronic|property|real estate|local service|delivery|pickup|transport|tractor|rotavator|farm labour|agriculture|dairy|milk collection|shuttering|repair|cleaning|ac service|cooler|ro|water purifier|furniture|solar|product)/i.test(raw);
  const paymentRequired=chargeFor(String(category)+' — '+String(service))!==null && Number(chargeFor(String(category)+' — '+String(service)))>0;
  const custom=customServiceRow(String(category).trim(),String(service).trim());
  const appointmentRequired=custom?custom.appointment===true:/appointment|home visit|home service/i.test(raw);
  return {paymentRequired,manualVerification:paymentRequired,tokenRequired:!noToken,appointmentRequired,documentsRequired:!!(sopFor && sopFor(String(category)+' — '+String(service)).documents?.length),qualityReview:!noToken,receiptRequired:paymentRequired,notifications:true,applicationTracking:!noToken,staffAssignment:!noToken};
}
function getServiceConfig(category, service){
  const key=String(category||'').trim()+' — '+String(service||'').trim();
  const row=(db.service_configs||[]).find(x=>x.key===key || (x.category===String(category||'').trim()&&x.service===String(service||'').trim()));
  const d=serviceConfigDefaults(category,service);
  return {...d,...(row||{}),category:String(category||'').trim(),service:String(service||'').trim(),key};
}
function publicService(category, sub){
  const c=getServiceConfig(category,sub.name);
  return {...sub, workflow:{paymentRequired:!!c.paymentRequired,manualVerification:!!c.manualVerification,tokenRequired:!!c.tokenRequired,appointmentRequired:!!c.appointmentRequired,documentsRequired:!!c.documentsRequired,qualityReview:!!c.qualityReview,receiptRequired:!!c.receiptRequired,notifications:!!c.notifications,applicationTracking:!!c.applicationTracking,staffAssignment:!!c.staffAssignment}};
}
function publicCustomService(x){const cfg=getServiceConfig(x.category,x.name);return publicService(x.category,{name:x.name,csc:Number(x.fee||0),govt:x.govt||'Portal/department अनुसार',documents:x.documents||[],process:x.process||[],description:x.description||'',time:Number(x.time||0),appointment:!!x.appointment,priority:!!x.priority,source:'admin',custom:true,id:x.id,published:x.published!==false});}

function sopFor(service){
  const p=serviceParts(service), info=SERVICE_INFO[p.category], sub=info?.services?.find(x=>x.name===p.service);
  const saved=db.service_sops.find(x=>x.service===service);
  const docs=(saved?.documents||sub?.docs||[]).map(String).filter(Boolean);
  const steps=(saved?.steps||sub?.process||info?.process||[]).map(String).filter(Boolean);
  const checks=(saved?.checks||[]).map(x=>({id:String(x.id||''),label:String(x.label||''),required:x.required!==false})).filter(x=>x.id&&x.label);
  const defaultChecks=checks.length?checks:[
    {id:'identity',label:'Customer identity/details verified',required:true},
    {id:'documents',label:'All required documents received and readable',required:true},
    {id:'data',label:'Entered data cross-checked with documents',required:true},
    {id:'fee',label:'Applicable fee/charges confirmed',required:true},
    {id:'submission',label:'Submission/acknowledgement/reference captured',required:true}
  ];
  return {service,category:p.category,documents:docs,steps,checks:defaultChecks,note:String(saved?.note||sub?.note||info?.note||'').trim()};
}
function qualityForToken(t){return db.service_quality.find(x=>Number(x.token_id)===Number(t.id))||null}
function normalizeDocLabel(v){return String(v||'').toLowerCase().replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[^a-z0-9\u0900-\u097f]+/g,' ').replace(/\s+/g,' ').trim()}
function documentGate(application,requiredDocs){
  const docs=application?db.documents.filter(d=>Number(d.application_id)===Number(application.id)):[];
  const verified=docs.filter(d=>['verified','approved','accepted','not_required'].includes(String(d.status||'').toLowerCase()));
  const required=(requiredDocs||[]).map(String).filter(Boolean);
  const missing=required.filter(requiredName=>{const need=normalizeDocLabel(requiredName);return !verified.some(d=>{const type=normalizeDocLabel(d.document_type||d.name||d.original_name);return type===need||type.includes(need)||need.includes(type)})});
  return {docs,verified,required,missing,ok:required.length===0||missing.length===0};
}
const TOKEN_TRANSITIONS={
  'लंबित':new Set(['बुलाया','स्किप','रद्द']),
  'बुलाया':new Set(['प्रगति','होल्ड','स्किप','रद्द']),
  'प्रगति':new Set(['होल्ड','पूर्ण','रद्द']),
  'होल्ड':new Set(['बुलाया','प्रगति','स्किप','रद्द']),
  // A skipped token remains recoverable by admin; recall returns it to the called state.
  'स्किप':new Set(['बुलाया','रद्द']),
  'पूर्ण':new Set([]),
  'रद्द':new Set([])
};
function notifyCustomer(mobile,type,severity,title,message,extra={}){ if(!mobile)return null; db.notifications=db.notifications||[]; const eventKey=String(extra.event_key||[type,extra.application_id||'',extra.payment_id||'',extra.token_id||'',extra.document_id||'',title].join(':')); const existing=db.notifications.find(n=>n.mobile===mobile&&n.event_key===eventKey); if(existing)return existing; const tokenId=extra.token_id?Number(extra.token_id):0; const tok=tokenId?db.tokens.find(z=>Number(z.id)===tokenId):null; const n={id:newId(),type,severity,title,message,mobile,read:false,created_at:now(),event_key:eventKey,state_revision:extra.state_revision??(tok?.state_revision??null),...extra}; db.notifications.unshift(n); return n; }
function tokenAuditSnapshot(t){ if(!t)return null; return {id:t.id,token:t.token,status:t.status,state_revision:Number(t.state_revision||0),staff_id:t.staff_id||null,staff_name:db.staff.find(s=>s.staff_id===t.staff_id)?.name||null,priority:Number(t.priority||0),hold_reason:t.hold_reason||null,skip_reason:t.skip_reason||null,cancel_reason:t.cancel_reason||null,recall_count:Number(t.recall_count||0),last_action_at:t.last_action_at||null}; }

function tokenTransitionAllowed(from,to){return TOKEN_TRANSITIONS[from]?.has(to)===true}
function tokenLifecycleReconcile(t,ctx=null){
  const issues=[]; const warnings=[];
  if(!t){issues.push('Token नहीं मिला');return {ok:false,issues,warnings};}
  const validStatuses=new Set(['लंबित','बुलाया','प्रगति','होल्ड','स्किप','पूर्ण','रद्द']);
  if(!validStatuses.has(t.status))issues.push('Invalid token status');
  const cfg=(()=>{try{const sp=serviceParts(t.service||'');return getServiceConfig(sp.category,sp.service)}catch{return null}})();
  const pay=t.payment_id?db.payments.find(x=>Number(x.id)===Number(t.payment_id)):null;
  const app=t.application_id?applicationFor(t.application_id):null;
  const audit=ctx?.auditByToken?.get(Number(t.id))||((db.audit||[]).filter(x=>Number(x.token_id)===Number(t.id)));
  const notes=ctx?.notesByToken?.get(Number(t.id))||((db.notifications||[]).filter(x=>Number(x.token_id)===Number(t.id)));
  const hasAction=a=>audit.some(x=>x.action===a);
  if(!hasAction('TOKEN_GENERATED'))warnings.push('TOKEN_GENERATED audit event नहीं मिला');
  if(t.payment_id&&!pay)issues.push('Linked payment record missing');
  if(cfg?.paymentRequired&&!t.payment_id)issues.push('Payment-required service token has no payment_id');
  if(t.status==='पूर्ण'){
    if(t.quality_status!=='passed')issues.push('Completed token quality gate is not passed');
    if(!t.completed_at)issues.push('Completed token has no completed_at');
    if(cfg?.paymentRequired&&(!pay||pay.status!=='Verified'))issues.push('Completed paid token payment is not Verified');
    if(cfg?.receiptRequired&&(!pay||!pay.receipt_no))issues.push('Completed token has no receipt');
    if(app&&app.status!=='Completed')issues.push('Application status is not Completed');
  }
  if(['प्रगति','होल्ड'].includes(t.status)&&app&&app.status!=='Processing')warnings.push('Active token application status is not Processing');
  if(t.status==='लंबित'&&t.started_at)warnings.push('Pending token already has started_at');
  if(['लंबित','बुलाया','प्रगति','होल्ड'].includes(t.status)&&t.completed_at)issues.push('Non-completed token has completed_at');
  if(Number(t.state_revision||0)<0)issues.push('Invalid state_revision');
  const relevantNotes=notes.filter(n=>n.event_key||n.state_revision!==null&&n.state_revision!==undefined);
  const latestNoteRevision=relevantNotes.reduce((m,n)=>Math.max(m,Number(n.state_revision||0)),0);
  if(latestNoteRevision>Number(t.state_revision||0))issues.push('Notification revision is ahead of token revision');
  const timeline=[...audit.map(x=>({kind:'AUDIT',at:x.at||'',action:x.action,state_revision:x.state_revision??x.after?.state_revision??null})),...notes.map(x=>({kind:'CUSTOMER',at:x.created_at||'',action:x.title,state_revision:x.state_revision??null}))].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  return {ok:issues.length===0,issues,warnings,token_id:t.id,status:t.status,state_revision:Number(t.state_revision||0),payment_id:t.payment_id||null,application_id:t.application_id||null,payment_status:pay?.status||null,receipt_no:pay?.receipt_no||null,application_status:app?.status||null,quality_status:t.quality_status||'needs_review',audit_count:audit.length,notification_count:notes.length,timeline};
}
function activeQueueToken(service=null, date=today()){
  const active=db.tokens.filter(z=>['बुलाया','प्रगति'].includes(z.status)&&(!date||z.date===date)&&(!service||z.service===service));
  active.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id||0)-Number(b.id||0));
  return active[0]||null;
}
function nextQueueToken(service=null, date=today()){
  return db.tokens.filter(z=>z.status==='लंबित'&&(!date||z.date===date)&&(!service||z.service===service))
    .sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id||0)-Number(b.id||0))[0]||null;
}
function tokenCanComplete(t){const q=qualityForToken(t);return t.status==='प्रगति'&&q&&q.status==='passed'}
function nextCode(collection, field, prefix, width){
  let max=0;
  for(const row of (db[collection]||[])){
    const m=String(row?.[field]||'').match(new RegExp('^'+prefix+'-(\\d+)$'));
    if(m) max=Math.max(max,Number(m[1]));
  }
  return prefix+'-'+String(max+1).padStart(width,'0');
}
function tokenNo(service){
  const prefix=String(service||'S').split(' — ').pop().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'SV';
  const used=new Set(db.tokens.filter(x=>x.date===today()).map(x=>String(x.token||'')));
  let n=1;
  while(used.has(prefix+'-'+String(n).padStart(3,'0'))) n++;
  return prefix+'-'+String(n).padStart(3,'0');
}
function applicationFor(id){return id?db.applications.find(a=>Number(a.id)===Number(id)||a.application_id===String(id)):null}
function documentAccess(d,{aa=null,sa=null,cs=null}={}){
  if(!d)return {ok:false,status:404,error:'Document नहीं मिला'};
  const app=applicationFor(d.application_id);
  const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id)&&!['रद्द','स्किप'].includes(x.status));
  if(aa)return {ok:true,app,t};
  if(sa){
    if(!staffHasPermission(sa.record,'view_assigned'))return {ok:false,status:403,error:'इस staff role को document देखने की अनुमति नहीं है'};
    if(!t||String(t.staff_id)!==String(sa.staff_id))return {ok:false,status:403,error:'यह document आपके assigned task में नहीं है'};
    return {ok:true,app,t};
  }
  if(cs){
    const owns=!!app&&((app.customer_id!=null&&Number(app.customer_id)===Number(cs.customer_id))||String(app.mobile)===String(cs.mobile));
    if(!owns)return {ok:false,status:403,error:'यह document आपके account का नहीं है'};
    return {ok:true,app,t};
  }
  return {ok:false,status:401,error:'Authentication required'};
}
function customerTokenFor(name,mobile,applicationId){return sign({kind:'customer',name:String(name),mobile:String(mobile),application_id:applicationId||null,exp:Date.now()+30*24*60*60*1000})}
function safeImageToDir(data,targetDir){
  const s=String(data||'');const m=s.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('Valid PNG/JPEG/WEBP image जरूरी है');
  const buf=Buffer.from(m[2],'base64');if(buf.length<32||buf.length>5*1024*1024)throw new Error('Image 5 MB से बड़ा नहीं हो सकता');
  const ok=(m[1]==='image/png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(m[1]==='image/jpeg'&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))||(m[1]==='image/webp'&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP');
  if(!ok)throw new Error('Image file content invalid है');
  const ext=m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg',name=crypto.randomUUID()+'.'+ext,sha256=crypto.createHash('sha256').update(buf).digest('hex');fs.writeFileSync(path.join(targetDir,name),buf,{flag:'wx'});return {url:'/api/staff/proof/'+name,filename:name,sha256,size:buf.length,mime:m[1]};
}
function safeHomepageHeroImage(data){
  const s=String(data||'');
  const m=s.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m)throw new Error('Valid PNG/JPEG/WEBP homepage image जरूरी है');
  const buf=Buffer.from(m[2],'base64');
  if(buf.length<32||buf.length>5*1024*1024)throw new Error('Homepage image 5 MB से बड़ी नहीं हो सकती');
  const ok=(m[1]==='image/png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
    (m[1]==='image/jpeg'&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))||
    (m[1]==='image/webp'&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP');
  if(!ok)throw new Error('Homepage image file content invalid है');
  const ext=m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg';
  const name=crypto.randomUUID()+'.'+ext;
  const sha256=crypto.createHash('sha256').update(buf).digest('hex');
  fs.writeFileSync(path.join(HOME_HERO_UPLOAD_DIR,name),buf,{flag:'wx'});
  return {url:'/api/public/homepage-hero/'+name,filename:name,sha256,mime:m[1],size:buf.length};
}
function safeImage(data){
  const s=String(data||'');const m=s.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('Valid PDF/JPG/JPEG/PNG payment proof जरूरी है');
  const buf=Buffer.from(m[2],'base64');if(buf.length<32||buf.length>5*1024*1024)throw new Error('Payment proof 5 MB से बड़ा नहीं हो सकता');
  const ok=(m[1]==='application/pdf'&&buf.subarray(0,5).toString('ascii')==='%PDF-')||(m[1]==='image/png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(m[1]==='image/jpeg'&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))||(m[1]==='image/webp'&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP');
  if(!ok)throw new Error('Payment proof file content invalid है');
  const ext=m[1]==='application/pdf'?'pdf':m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg',name=crypto.randomUUID()+'.'+ext,sha256=crypto.createHash('sha256').update(buf).digest('hex');fs.writeFileSync(path.join(UPLOAD_DIR,name),buf,{flag:'wx'});return {url:'/api/payments/proof/'+name,filename:name,sha256}
}
function safeOfficialReceipt(data){
  const s=String(data||'');
  const m=s.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m)throw new Error('Valid PDF/JPG/JPEG/PNG receipt जरूरी है');
  const buf=Buffer.from(m[2],'base64');
  if(buf.length<32||buf.length>5*1024*1024)throw new Error('Official receipt 5 MB से बड़ी नहीं हो सकती');
  const ok=(m[1]==='application/pdf'&&buf.subarray(0,5).toString('ascii')==='%PDF-')||
    (m[1]==='image/png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
    (m[1]==='image/jpeg'&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))||
    (m[1]==='image/webp'&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP');
  if(!ok)throw new Error('Official receipt file content invalid है');
  const ext=m[1]==='application/pdf'?'pdf':m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg';
  const name=crypto.randomUUID()+'.'+ext;
  const sha256=crypto.createHash('sha256').update(buf).digest('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR,name),buf,{flag:'wx'});
  return {url:'/api/admin/uppcl/official-receipt/'+name,filename:name,sha256,mime:m[1],size:buf.length};
}
function tokenQueueContext(rows=db.tokens){
  const groups=new Map();
  for(const x of rows){
    const key=String(x.date||'')+'\u0000'+String(x.service||'');
    let g=groups.get(key);
    if(!g){g={ordered:[],completed:[],waitingCount:0,avg:15};groups.set(key,g)}
    if(!['पूर्ण','रद्द','स्किप'].includes(x.status)) g.ordered.push(x);
    if(x.status==='पूर्ण') g.completed.push(x);
    if(x.status==='लंबित') g.waitingCount++;
  }
  for(const g of groups.values()){
    g.ordered.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id||0)-Number(b.id||0));
    const completed=g.completed;
    const durations=completed.map(x=>{if(!x.started_at||!x.completed_at)return 0;return Math.max(0,new Date(x.completed_at).getTime()-new Date(x.started_at).getTime()-Number(x.total_hold_ms||0))}).filter(x=>x>0);
    g.avg=durations.length?Math.max(1,Math.round(durations.reduce((a,b)=>a+b,0)/durations.length/60000)):15;
  }
  return groups;
}
function tokenQueueMeta(t,ctx=null){
  const key=String(t.date||'')+'\u0000'+String(t.service||'');
  const g=ctx?.get(key);
  if(g){
    const pos=Math.max(1,g.ordered.findIndex(x=>Number(x.id)===Number(t.id))+1);
    const ahead=g.ordered.slice(0,pos-1);
    const aheadCount=ahead.filter(x=>x.status==='लंबित').length;
    const active=ahead.find(x=>x.status==='बुलाया'||x.status==='प्रगति'||x.status==='होल्ड')||null;
    const activeElapsed=active?.started_at?Math.max(0,(active.completed_at?new Date(active.completed_at):new Date()).getTime()-new Date(active.started_at).getTime()-Number(active.total_hold_ms||0)):0;
    const activeExpected=Number(active?.expected_duration_minutes||g.avg)*60000;
    const activeHoldRemaining=active?.status==='होल्ड'&&active?.hold_started_at&&Number(active?.hold_delay_minutes||0)>0?Math.max(0,Math.ceil((new Date(active.hold_started_at).getTime()+Number(active.hold_delay_minutes)*60000-Date.now())/60000)):0;
    const activeRemaining=Math.max(0,Math.ceil((activeExpected-activeElapsed)/60000))+activeHoldRemaining;
    const startWait=Math.max(0,(ahead.filter(x=>x.status==='लंबित').length*g.avg)+activeRemaining);
    let completionWait=startWait+Number(t.expected_duration_minutes||g.avg);
    if(t.status==='बुलाया'||t.status==='प्रगति'||t.status==='होल्ड'){
      const ownElapsed=t.started_at?Math.max(0,(t.completed_at?new Date(t.completed_at):new Date()).getTime()-new Date(t.started_at).getTime()-Number(t.total_hold_ms||0)):0;
      const ownExpected=Number(t.expected_duration_minutes||g.avg)*60000;
      const ownHoldRemaining=t.status==='होल्ड'&&t.hold_started_at&&Number(t.hold_delay_minutes||0)>0?Math.max(0,Math.ceil((new Date(t.hold_started_at).getTime()+Number(t.hold_delay_minutes)*60000-Date.now())/60000)):0;
      completionWait=Math.max(0,Math.ceil((ownExpected-ownElapsed)/60000))+ownHoldRemaining;
    }
    const now=Date.now();
    return {queue_position:pos,waiting_count:g.waitingCount,ahead_count:aheadCount,estimated_wait_minutes:startWait,service_average_minutes:g.avg,start_wait_minutes:startWait,completion_wait_minutes:completionWait,estimated_start_at:new Date(now+startWait*60000).toISOString(),estimated_completion_at:new Date(now+completionWait*60000).toISOString()};
  }
  const activeStatuses=new Set(['पूर्ण','रद्द','स्किप']);
  const waiting=db.tokens.filter(x=>!activeStatuses.has(x.status)&&x.date===t.date&&x.service===t.service);
  const ordered=waiting.slice().sort((a,b)=>{const ap=Number(a.priority||0),bp=Number(b.priority||0);if(ap!==bp)return bp-ap;return Number(a.id||0)-Number(b.id||0)});
  const pos=Math.max(1,ordered.findIndex(x=>Number(x.id)===Number(t.id))+1);
  const ahead=ordered.slice(0,pos-1);
  const completed=db.tokens.filter(x=>x.service===t.service&&x.status==='पूर्ण'&&x.date===t.date);
  const durations=completed.map(x=>{if(!x.started_at||!x.completed_at)return 0;return Math.max(0,new Date(x.completed_at).getTime()-new Date(x.started_at).getTime()-Number(x.total_hold_ms||0))}).filter(x=>x>0);
  const avg=durations.length?Math.max(1,Math.round(durations.reduce((a,b)=>a+b,0)/durations.length/60000)):15;
  const aheadPending=ahead.filter(x=>x.status==='लंबित').length;
  const active=ahead.find(x=>x.status==='बुलाया'||x.status==='प्रगति'||x.status==='होल्ड')||null;
  const activeElapsed=active?.started_at?Math.max(0,(active.completed_at?new Date(active.completed_at):new Date()).getTime()-new Date(active.started_at).getTime()-Number(active.total_hold_ms||0)):0;
  const activeExpected=Number(active?.expected_duration_minutes||avg)*60000;
  const activeHoldRemaining=active?.status==='होल्ड'&&active?.hold_started_at&&Number(active?.hold_delay_minutes||0)>0?Math.max(0,Math.ceil((new Date(active.hold_started_at).getTime()+Number(active.hold_delay_minutes)*60000-Date.now())/60000)):0;
  const activeRemaining=Math.max(0,Math.ceil((activeExpected-activeElapsed)/60000))+activeHoldRemaining;
  const startWait=Math.max(0,aheadPending*avg+activeRemaining);
  let completionWait=startWait+Number(t.expected_duration_minutes||avg);
  if(t.status==='बुलाया'||t.status==='प्रगति'||t.status==='होल्ड'){
    const ownElapsed=t.started_at?Math.max(0,(t.completed_at?new Date(t.completed_at):new Date()).getTime()-new Date(t.started_at).getTime()-Number(t.total_hold_ms||0)):0;
    const ownExpected=Number(t.expected_duration_minutes||avg)*60000;
    const ownHoldRemaining=t.status==='होल्ड'&&t.hold_started_at&&Number(t.hold_delay_minutes||0)>0?Math.max(0,Math.ceil((new Date(t.hold_started_at).getTime()+Number(t.hold_delay_minutes)*60000-Date.now())/60000)):0;
    completionWait=Math.max(0,Math.ceil((ownExpected-ownElapsed)/60000))+ownHoldRemaining;
  }
  const now=Date.now();
  return {queue_position:pos,waiting_count:waiting.filter(x=>x.status==='लंबित').length,ahead_count:aheadPending,estimated_wait_minutes:startWait,service_average_minutes:avg,start_wait_minutes:startWait,completion_wait_minutes:completionWait,estimated_start_at:new Date(now+startWait*60000).toISOString(),estimated_completion_at:new Date(now+completionWait*60000).toISOString()};
}
function publicToken(t,ctx=null){
  const holdStarted=t.hold_started_at?new Date(t.hold_started_at).getTime():null;
  const delayMinutes=Math.max(0,Number(t.hold_delay_minutes||0));
  const deadline=holdStarted&&delayMinutes?holdStarted+delayMinutes*60000:null;
  const remaining=deadline?Math.ceil((deadline-Date.now())/60000):null;
  const history=Array.isArray(t.hold_history)?t.hold_history:[];
  const totalHoldMs=history.reduce((n,h)=>n+Math.max(0,Number(h.duration_ms||0)),0)+(t.status==='होल्ड'&&holdStarted?Math.max(0,Date.now()-holdStarted):0);
  const workflow=t.workflow||{};
  // Array.prototype.map passes (value, index, array) to callbacks. Guard the
  // optional queue context so publicToken can safely be used directly as a map callback.
  const qm=tokenQueueMeta(t,ctx instanceof Map?ctx:null);
  const staff=t.staff_id?db.staff.find(x=>x.staff_id===t.staff_id):null;
  const elapsedMs=t.started_at?Math.max(0,(t.completed_at?new Date(t.completed_at):new Date()).getTime()-new Date(t.started_at).getTime()-totalHoldMs):0;
  const expectedMs=Number(t.expected_duration_minutes||qm.service_average_minutes)*60000;
  return {id:t.id,token:t.token,name:t.name||'',mobile:t.mobile||'',service:t.service,status:t.status,created_at:t.created_at,date:t.date,application_id:t.application_id||null,payment_id:t.payment_id||null,
    priority:Number(t.priority||0),priority_reason:t.priority_reason||null,queue_position:qm.queue_position,waiting_count:qm.waiting_count,ahead_count:qm.ahead_count,estimated_wait_minutes:qm.estimated_wait_minutes,service_average_minutes:qm.service_average_minutes,start_wait_minutes:qm.start_wait_minutes,completion_wait_minutes:qm.completion_wait_minutes,estimated_start_at:qm.estimated_start_at,estimated_completion_at:qm.estimated_completion_at,
    staff_id:t.staff_id||null,staff_name:staff?.name||null,assigned_at:t.assigned_at||null,
    started_at:t.started_at||null,completed_at:t.completed_at||null,elapsed_minutes:Math.floor(elapsedMs/60000),expected_duration_minutes:Number(t.expected_duration_minutes||qm.service_average_minutes),delay_minutes:Math.max(0,Math.floor((elapsedMs-expectedMs)/60000)),
    hold_reason:t.hold_reason||null,hold_owner:t.hold_owner||null,hold_delay_minutes:delayMinutes||null,hold_started_at:t.hold_started_at||null,hold_deadline:deadline?new Date(deadline).toISOString():null,
    hold_remaining_minutes:remaining,hold_overdue:!!(deadline&&remaining<0),hold_extensions:Number(t.hold_extensions||0),hold_history_count:history.length,total_hold_minutes:Math.floor(totalHoldMs/60000),
    skip_reason:t.skip_reason||null,recall_count:Number(t.recall_count||0),last_action_at:t.last_action_at||null,quality_status:t.quality_status||'needs_review',state_revision:Number(t.state_revision||0),
    work_summary:{photo:workflow.photo||'pending',signature:workflow.signature||'pending',documents:workflow.documents||'pending',uploads:workflow.uploads||'pending',data:workflow.data||'pending',submission:workflow.submission||'pending',reference_no:workflow.reference_no||'',notes:workflow.notes||'',updated_at:workflow.updated_at||null}};
}
function customerCurrentToken(t,ctx=null){
  if(!t)return null;
  const q=tokenQueueMeta(t,ctx);
  return {id:t.id,token:t.token,service:t.service,status:t.status,created_at:t.created_at,date:t.date,application_id:t.application_id||null,payment_id:t.payment_id||null,
    priority:Number(t.priority||0),queue_position:q.queue_position,waiting_count:q.waiting_count,ahead_count:q.ahead_count,
    estimated_wait_minutes:q.estimated_wait_minutes,service_average_minutes:q.service_average_minutes,start_wait_minutes:q.start_wait_minutes,completion_wait_minutes:q.completion_wait_minutes,estimated_start_at:q.estimated_start_at,estimated_completion_at:q.estimated_completion_at,
    started_at:t.started_at||null,completed_at:t.completed_at||null,staff_id:t.staff_id||null,staff_name:(t.staff_id?db.staff.find(x=>x.staff_id===t.staff_id)?.name:null)||null,
    quality_status:t.quality_status||'needs_review',state_revision:Number(t.state_revision||0),last_action_at:t.last_action_at||null};
}

function pdfEscape(v){return String(v??'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function receiptPdf(pay,tok,app){
  const lines=[
    'ANGELSTORE CSC',
    'SERVICE COMPLETION RECEIPT',
    '----------------------------------------',
    `Receipt No: ${pay.receipt_no||'—'}`,
    `Application ID: ${app?.application_id||tok?.application_id||'—'}`,
    `Token: ${tok?.token||'—'}`,
    `Customer: ${pay.name||tok?.name||'—'}`,
    `Mobile: ${pay.mobile||tok?.mobile||'—'}`,
    `Service: ${pay.service||tok?.service||'—'}`,
    `Amount: Rs. ${Number(pay.amount||0).toFixed(2)}`,
    `Payment Status: ${pay.status||'Verified'}`,
    `Payment Method: ${pay.method||'—'}`,
    `UTR / Reference: ${pay.utr||'—'}`,
    `Completed At: ${pay.completed_at||tok?.completed_at||'—'}`,
    `Completed By: ${String(pay.service||'').toLowerCase().includes('recharge')?'Admin':(pay.completed_by||tok?.staff_id||'—')}`,
    'Service Status: Completed'
  ];
  const content=['BT','/F1 12 Tf','50 760 Td'];
  lines.forEach((line,i)=>{if(i)content.push('0 -24 Td');content.push(`(${pdfEscape(line)}) Tj`)});
  content.push('ET');
  const stream=content.join('\n');
  const objs=[];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push(`<< /Length ${Buffer.byteLength(stream,'utf8')} >>\nstream\n${stream}\nendstream`);
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(pdf,'utf8'));pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf,'utf8');pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objs.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,'utf8');
}
function textPdf(title, lines){
  const safeLines=[String(title||'ANGELSTORE').slice(0,90),...lines.map(x=>String(x??'').slice(0,110))];
  const content=['BT','/F1 11 Tf','50 790 Td'];
  safeLines.forEach((line,i)=>{if(i)content.push('0 -18 Td');content.push(`(${pdfEscape(line)}) Tj`)});
  content.push('ET');
  const stream=content.join('\n');
  const objs=[];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push(`<< /Length ${Buffer.byteLength(stream,'utf8')} >>\nstream\n${stream}\nendstream`);
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(pdf,'utf8'));pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf,'utf8');pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objs.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,'utf8');
}
function financialReportPdf(report){
  const s=report.summary||{};
  const lines=[
    `Period: ${report.from||'All'} to ${report.to||'All'}`,
    `Generated: ${report.generated_at||now()}`,
    `Verified Collection: Rs. ${Number(s.verified_collection||0).toFixed(2)}`,
    `Ledger Collection: Rs. ${Number(s.ledger_verified_collection||0).toFixed(2)}`,
    `Transactions: ${s.transactions||0}`,
    `Official Fees: Rs. ${Number(s.official_fees||0).toFixed(2)}`,
    `Staff Commission: Rs. ${Number(s.staff_commission||0).toFixed(2)}`,
    `Payment Charges: Rs. ${Number(s.payment_charges||0).toFixed(2)}`,
    `Operating Expenses: Rs. ${Number(s.operating_expenses||0).toFixed(2)}`,
    `Net After Direct Costs: Rs. ${Number(s.net_after_direct_costs||0).toFixed(2)}`,
    `Reconciliation Issues: ${(report.issues||[]).length}`,
    '--- Daily Collection ---',
    ...(report.daily||[]).slice(0,25).map(x=>`${x.date}: Txns ${x.transactions}, Collection ${x.collection}, Official ${x.official_fee}, Commission ${x.staff_commission}`),
    '--- Service-wise ---',
    ...(report.service||[]).slice(0,25).map(x=>`${x.service}: Txns ${x.transactions}, Collection ${x.collection}, Official ${x.official_fee}, Commission ${x.staff_commission}`)
  ];
  return textPdf('ANGELSTORE FINANCIAL REPORT',lines);
}
function settlementPdf(row){
  return textPdf('ANGELSTORE STAFF SETTLEMENT STATEMENT',[
    `Settlement: ${row.settlement_id||row.id||'—'}`,
    `Staff: ${row.staff_id||'—'}`,
    `Period: ${row.from||'—'} to ${row.to||'—'}`,
    `Base Salary: Rs. ${Number(row.base_salary||0).toFixed(2)}`,
    `Commission: Rs. ${Number(row.commission||0).toFixed(2)}`,
    `Home Allowance: Rs. ${Number(row.home_allowance||0).toFixed(2)}`,
    `Delivery Allowance: Rs. ${Number(row.delivery_allowance||0).toFixed(2)}`,
    `Advances: Rs. ${Number(row.advances||0).toFixed(2)}`,
    `Net Payable: Rs. ${Number(row.net_payable||0).toFixed(2)}`,
    `Status: ${row.status||'pending'}`,
    `Generated: ${now()}`
  ]);
}

function generateReceiptForCompletion(t, actor){
  if(!t)return null;
  const pay=t.payment_id?db.payments.find(z=>Number(z.id)===Number(t.payment_id)):null;
  if(!pay)return null;
  if(pay.status!=='Verified')return {payment:pay,generated:false,reason:'Payment not verified'};
  pay.receipt_no=pay.receipt_no||'RCP-'+String(pay.id).slice(-8);
  pay.completed_at=t.completed_at||now();
  pay.receipt_generated_at=pay.receipt_generated_at||pay.completed_at;
  pay.completed_by=pay.completed_by||actor||'system';
  if(!pay.receipt_generated_at_notified){
    pay.receipt_generated_at_notified=pay.receipt_generated_at;
    db.audit.unshift({id:newId(),action:'RECEIPT_AUTO_GENERATED',payment_id:pay.id,token_id:t.id,receipt_no:pay.receipt_no,by:actor||'system',at:pay.receipt_generated_at});
    notifyCustomer(t.mobile,'receipt','success','Receipt Generated',`आपकी receipt ${pay.receipt_no} generate हो गई है।`,{payment_id:pay.id,token_id:t.id,application_id:t.application_id||pay.application_id,receipt_no:pay.receipt_no});
  }
  return {payment:pay,generated:true};
}
function applicationWorkflowState(app){
  if(!app)return 'Unknown';
  const payment=db.payments.find(p=>Number(p.application_id)===Number(app.id));
  const token=db.tokens.find(t=>Number(t.application_id)===Number(app.id));
  const docs=db.documents.filter(d=>Number(d.application_id)===Number(app.id));
  const cfg=getServiceConfig(app.category,app.service);
  const requiredDocs=sopFor(app.service).documents||[];
  const documentsRequired=!!cfg.documentsRequired || requiredDocs.length>0;
  if(String(app.status||'').toLowerCase()==='completed' || token?.status==='पूर्ण')return 'Completed';
  if(docs.some(d=>String(d.status||'').toLowerCase()==='rejected'))return 'Correction Required';
  if(cfg.paymentRequired && payment?.status!=='Verified')return payment?.status==='Pending Verification'?'Payment Verification Pending':'Payment Pending';
  if(cfg.tokenRequired && !token)return 'Token Pending';
  if(documentsRequired && documentGate(app,requiredDocs).ok===false)return 'Documents Pending';
  if(documentsRequired && documentGate(app,requiredDocs).ok)return 'Documents Verified';
  if(token?.started_at || ['प्रगति','होल्ड'].includes(token?.status))return 'Processing';
  return token?'Token Generated':'Application Submitted';
}
function syncApplicationStatusForDocuments(app){
  if(!app)return;
  const state=applicationWorkflowState(app);
  if(state==='Correction Required')app.status='Correction Required';
  else if(state==='Documents Verified' && !['Completed','Processing'].includes(String(app.status||'')))app.status='Documents Verified';
}
function receiptEligibility(pay){
  if(!pay||pay.status!=='Verified'||!pay.receipt_no)return false;
  const tok=db.tokens.find(t=>Number(t.payment_id)===Number(pay.id)&&t.status==='पूर्ण');
  if(tok)return true;
  if(pay.service==='UPPCL Bill Payment'&&pay.uppcl_processing_status==='Completed')return true;
  const recharge=(db.recharge_transactions||[]).find(r=>Number(r.payment_id)===Number(pay.id));
  if(recharge&&recharge.status==='Success')return true;
  const app=pay.application_id?applicationFor(pay.application_id):null;
  const cfg=app?getServiceConfig(app.category,app.service):null;
  if(app&&app.status==='Completed'&&cfg?.receiptRequired)return true;
  return false;
}
function findCompletedReceipt(id){
  const pay=db.payments.find(x=>Number(x.id)===Number(id));
  if(!receiptEligibility(pay))return null;
  const tok=db.tokens.find(t=>Number(t.payment_id)===Number(pay.id)&&t.status==='पूर्ण');
  return {pay,tok,app:applicationFor(tok?.application_id||pay.application_id)};
}

function customerPayment(p){return {id:p.id,txn_id:p.txn_id,name:p.name,mobile:p.mobile,service:p.service,amount:p.amount,method:p.method,utr:p.utr,status:p.status,created_at:p.created_at,receipt_no:p.receipt_no,completed_at:p.completed_at||null,receipt_generated_at:p.receipt_generated_at||null,token_id:p.token_id||null,application_id:p.application_id||null,offer_id:p.offer_id||null,offer_title:p.offer_title||null,payable_amount_snapshot:p.payable_amount_snapshot!=null?money(p.payable_amount_snapshot):null,reject_reason:p.reject_reason||null,verified_at:p.verified_at||null,proof_available:!!p.screenshot,proof_viewed_at:p.proof_viewed_at||null,official_fee:money(p.official_fee),staff_commission:money(p.staff_commission),payment_charge:money(p.payment_charge),uppcl_account:p.uppcl_account||'',uppcl_district:p.uppcl_district||'',uppcl_discom:p.uppcl_discom||'',uppcl_bill_month:p.uppcl_bill_month||'',uppcl_due_date:p.uppcl_due_date||'',uppcl_consumer_name:p.uppcl_consumer_name||'',uppcl_current_bill:p.uppcl_current_bill!=null?money(p.uppcl_current_bill):null,uppcl_arrear:p.uppcl_arrear!=null?money(p.uppcl_arrear):null,uppcl_late_fee:p.uppcl_late_fee!=null?money(p.uppcl_late_fee):null,uppcl_processing_status:p.uppcl_processing_status||null,uppcl_provider_ref:p.uppcl_provider_ref||'',uppcl_process_note:p.uppcl_process_note||null,official_receipt_available:!!p.official_receipt,official_receipt_name:p.official_receipt_name||null,official_receipt_uploaded_at:p.official_receipt_uploaded_at||null}}
function customerRecharge(r){const pay=r.payment_id?db.payments.find(x=>Number(x.id)===Number(r.payment_id)):null;const history=Array.isArray(r.status_history)?r.status_history.map(x=>({status:x.status,at:x.at,reason:x.reason||''})):[];return {id:r.id,mobile:r.mobile,operator:r.operator,type:r.type,circle:r.circle,amount:r.amount,plan_id:r.plan_id||'',plan_name:r.plan_name||'',provider_ref:r.provider_ref||'',status:r.status,source:r.source||'',payment_id:r.payment_id||null,application_id:r.application_id||null,notes:r.notes||'',failure_reason:r.failure_reason||'',created_at:r.created_at,updated_at:r.updated_at||r.created_at,payment_status:pay?.status||null,payment_verified_at:pay?.verified_at||null,payment_rejected_at:pay?.verified_at&&pay?.status==='Rejected'?pay.verified_at:null,completed_at:r.completed_at||null,failed_at:r.failed_at||null,completed_by:pay?.completed_by||null,utr:pay?.utr||'',receipt_no:pay?.receipt_no||null,status_history:history,state_revision:Number(r.state_revision||0),retry_of_recharge_id:r.retry_of_recharge_id||null,retry_group_id:r.retry_group_id||r.id,attempt_no:Number(r.attempt_no||1),retryable:r.status==='Failed'}}
function customerProgressFor(mobile, applicationId){
  const apps=db.applications.filter(a=>a.mobile===mobile);
  const requested=applicationId?apps.find(a=>Number(a.id)===Number(applicationId)):null;
  // Live Status must not resurrect completed/cancelled history. Without an explicit
  // application_id, select only the newest non-terminal customer application.
  const terminalStatuses=new Set(['completed','cancelled','cancelled by customer','रद्द','पूर्ण','स्किप']);
  const activeApps=apps.filter(a=>{
    const token=db.tokens.find(t=>Number(t.application_id)===Number(a.id));
    const appStatus=String(a.status||'').trim().toLowerCase();
    const tokenStatus=String(token?.status||'').trim();
    return !terminalStatuses.has(appStatus) && !['पूर्ण','रद्द','स्किप'].includes(tokenStatus);
  });
  const app=requested||activeApps.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
  const tokenRows=app?db.tokens.filter(t=>Number(t.application_id)===Number(app.id)):db.tokens.filter(t=>t.mobile===mobile&&['बुलाया','प्रगति','होल्ड','लंबित'].includes(String(t.status||'')));
  const token=tokenRows.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
  const aid=token?.application_id||app?.id||null;
  const application=aid?applicationFor(aid):app;
  const payment=(application?db.payments.filter(p=>Number(p.application_id)===Number(application.id)):db.payments.filter(p=>p.mobile===mobile)).slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
  const docs=application?db.documents.filter(d=>Number(d.application_id)===Number(application.id)):[];
  const requiredDocs=application?sopFor(application.service).documents:[];
  const docGate=documentGate(application,requiredDocs);
  const workflow=token?.workflow||{};
  const quality=token?qualityForToken(token):null;
  const done=v=>['received','verified','not_required'].includes(String(v||''));
  const docRatio=requiredDocs.length?Math.min(1,docGate.verified.filter(d=>{const matchedRequired=requiredDocs.find(r=>{const need=normalizeDocLabel(r);const type=normalizeDocLabel(d.document_type||d.name||d.original_name);return type===need||type.includes(need)||need.includes(type)});return !!matchedRequired}).length/requiredDocs.length):1;
  const wfState=applicationWorkflowState(application);
  const cfg=getServiceConfig(application?.category,application?.service);
  const documentsRequired=!!cfg.documentsRequired || requiredDocs.length>0;
  const paymentDone=!cfg.paymentRequired||payment?.status==='Verified';
  const documentsDone=!documentsRequired||docGate.ok;
  const tokenDone=!cfg.tokenRequired||!!token;
  // Later workflow stages must never appear complete while a required prerequisite is pending.
  const processingRaw=!!token?.started_at||token?.status==='प्रगति'||token?.status==='होल्ड'||token?.status==='पूर्ण';
  const processingDone=processingRaw && paymentDone && documentsDone && tokenDone;
  const completedDone=(token?.status==='पूर्ण'||String(application?.status||'').toLowerCase()==='completed') && paymentDone && documentsDone && tokenDone;
  const items=[
    {id:'payment',label:'Payment Verified',weight:15,done:paymentDone,detail:payment?.status||'Not required'},
    {id:'token',label:'Live Token Generated',weight:15,done:tokenDone,detail:token?.token||'Pending'},
    {id:'documents',label:'Documents Verified',weight:25,done:documentsDone,detail:requiredDocs.length?`${docGate.verified.length}/${requiredDocs.length} verified`:'Not required'},
    {id:'processing',label:'Service Processing',weight:25,done:processingDone,detail:processingDone?(token?.status||wfState):wfState},
    {id:'completed',label:'Completed',weight:20,done:completedDone,detail:completedDone?'Completed':(application?.status||wfState||'Pending')}
  ];
  let percent=0;
  for(const item of items){if(item.id==='documents')percent+=Math.round(item.weight*docRatio);else if(item.done)percent+=item.weight}
  if(!application&&!token)return {percent:0,application:null,token:null,payment:null,documents:[],required_documents:[],items};
  return {percent:Math.min(100,percent),application:application?{id:application.id,application_id:application.application_id,service:application.service,status:application.status,created_at:application.created_at}:null,token:token?publicToken(token):null,payment:payment?customerPayment(payment):null,documents:docs.map(d=>({id:d.id,name:d.name,status:d.status,ocr_status:d.ocr_status||'not_run',created_at:d.created_at,size:d.size})),required_documents:requiredDocs,items};
}

function safeStaticPath(urlPath){
  let u;try{u=decodeURIComponent(urlPath)}catch{return null}
  if(u==='/'||u==='/index.html')u='/index.html';
  const blocked=u==='/data.json'||u.startsWith('/uploads/')||u==='/.env'||u==='/.env.example'||u==='/server.js'||u==='/storage.js'||u==='/service-catalog.js.bak'||u.endsWith('.bat')||u.endsWith('.md')||u.endsWith('.txt')||/\.(tmp|bak|log|sql)$/i.test(u)||/^\/(node_modules|backups|\.git)\b/i.test(u)||/^\/(E2E-TEST|FINAL-RELEASE-AUDIT|PERFORMANCE-LOAD-TEST|PHASE-32-WRITE-STRESS-TEST|PHASE-33-BACKUP-RESTORE-CONCURRENCY-TEST|PHASE-34-SECURITY-ABUSE-AUDIT|PRODUCTION-DEPLOYMENT-VERIFY|PRODUCTION-OPS-AUDIT|PRODUCTION-PREFLIGHT|RESET-ADMIN-PASSWORD|SMOKE-TEST)\.js$/i.test(u);
  if(blocked)return null;
  // Only allow known public asset extensions + root HTML/JS/CSS
  const ext=path.extname(u).toLowerCase();
  const allowed=new Set(['','.html','.js','.css','.png','.jpg','.jpeg','.webp','.svg','.ico','.woff','.woff2']);
  if(!allowed.has(ext))return null;
  const p=path.normalize(path.join(ROOT,u));
  return p.startsWith(ROOT+path.sep)?p:null;
}
function serveStatic(req,res){const p=safeStaticPath(new URL(req.url,'http://localhost').pathname);if(!p)return json(res,403,{error:'Forbidden'});fs.readFile(p,(e,b)=>{if(e)return json(res,404,{error:'Not found'});const ext=path.extname(p).toLowerCase();const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'",...(IS_PRODUCTION?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{})});res.end(b)})}

let customerLoginAttempts=new Map();
let guestApplicationAttempts=new Map();
let rechargeRetryAttempts=new Map();
function pinHash(pin,salt=crypto.randomBytes(16).toString('hex')){const hash=crypto.scryptSync(String(pin),salt,64,{N:16384,r:8,p:1}).toString('hex');return {salt,hash}}
function pinVerify(pin,salt,hash){try{const actual=crypto.scryptSync(String(pin),String(salt),64,{N:16384,r:8,p:1});const expected=Buffer.from(String(hash),'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}catch{return false}}
function adminPasswordHash(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1}).toString('hex');return {salt,hash}}
function adminPasswordVerify(password,salt,hash){try{const actual=crypto.scryptSync(String(password),String(salt),64,{N:16384,r:8,p:1});const expected=Buffer.from(String(hash),'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}catch{return false}}
function adminCredential(){const c=Array.isArray(db.admin_credentials)?db.admin_credentials[0]:null;return c&&c.username&&c.salt&&c.hash?c:null}
let DUMMY_PIN_CREDENTIAL=null,DUMMY_ADMIN_CREDENTIAL=null;
function dummyPinCredential(){if(!DUMMY_PIN_CREDENTIAL)DUMMY_PIN_CREDENTIAL=pinHash('000000');return DUMMY_PIN_CREDENTIAL}
function dummyAdminCredential(){if(!DUMMY_ADMIN_CREDENTIAL)DUMMY_ADMIN_CREDENTIAL=adminPasswordHash('invalid-dummy-password');return DUMMY_ADMIN_CREDENTIAL}
function adminCredentialsValid(username,password){const c=adminCredential();if(c){const passwordOk=adminPasswordVerify(password,c.salt,c.hash);return String(username)===String(c.username)&&passwordOk}const passwordOk=adminPasswordVerify(password,dummyAdminCredential().salt,dummyAdminCredential().hash);return String(username)===String(ADMIN_USER)&&passwordOk}
function ensureAdminCredential(){
  if(adminCredential())return false;
  if(!ADMIN_USER)return false;
  if(!IS_PRODUCTION && !process.env.ANGELSTORE_ADMIN_PASS){
    db.admin_credentials=[{username:ADMIN_USER,salt:LOCAL_ADMIN_SALT,hash:LOCAL_ADMIN_HASH,created_at:now(),updated_at:now(),source:'local-development-fallback'}];
    return true;
  }
  if(!ADMIN_PASS)return false;
  const c=adminPasswordHash(ADMIN_PASS);
  db.admin_credentials=[{username:ADMIN_USER,salt:c.salt,hash:c.hash,created_at:now(),updated_at:now(),source:'environment-bootstrap'}];
  return true;
}

function validPin(pin){return /^[0-9]{4,6}$/.test(String(pin||''))}
function customerRecordByIdentifier(identifier){const key=String(identifier||'').trim();return db.customers.find(x=>x.customer_id===key||x.mobile===key)||null}
function customerSessionFor(c,sid){return sign({kind:'customer',sid,customer_id:c.customer_id,mobile:c.mobile,name:c.name,exp:Date.now()+30*24*60*60*1000})}
function customerPublic(c){return {customer_id:c.customer_id,name:c.name,mobile:c.mobile,status:c.status||'active',pin_set:Boolean(c.pin_hash),created_at:c.created_at,updated_at:c.updated_at}}
function qrPayloadFor(c){return `ANGELSTORE|CUSTOMER|${c.customer_id}`}
function attemptRow(collection,ip){const rows=db[collection]||[];let x=rows.find(r=>r.ip===ip);if(!x){x={ip,n:0,at:0};rows.push(x);db[collection]=rows}return x}
function loginAllowed(ip){const x=attemptRow('login_attempts',ip);if(Date.now()-Number(x.at||0)>15*60*1000){x.n=0;x.at=Date.now();save()}return Number(x.n||0)<10}
function failLogin(ip){const x=attemptRow('login_attempts',ip);x.n=Number(x.n||0)+1;x.at=Date.now();save()}
function clearLoginAttempts(collection,ip){const rows=db[collection]||[];const idx=rows.findIndex(r=>r.ip===ip);if(idx>=0){rows.splice(idx,1);save()}}
function staffLoginAllowed(ip){const x=attemptRow('staff_login_attempts',ip);if(Date.now()-Number(x.at||0)>15*60*1000){x.n=0;x.at=Date.now();save()}return Number(x.n||0)<8}
function failStaffLogin(ip){const x=attemptRow('staff_login_attempts',ip);x.n=Number(x.n||0)+1;x.at=Date.now();save()}
function atomicWriteFile(fp,text){const tmp=fp+'.tmp';const fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,fp);try{const dfd=fs.openSync(path.dirname(fp),'r');fs.fsyncSync(dfd);fs.closeSync(dfd)}catch{}}
function backupDatabaseSnapshot(){
  const snapshot=JSON.parse(JSON.stringify(db));
  snapshot.admin_sessions=[];
  snapshot.staff_sessions=[];
  snapshot.customer_sessions=[];
  snapshot.meta={...(snapshot.meta||{}),backup_sanitized:true,backup_sanitized_at:now()};
  return snapshot;
}
function backupFile(){
  const name='angelstore-'+now().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.json';
  const fp=path.join(BACKUP_DIR,name);
  const snapshotDir=path.join(BACKUP_DIR,name+'.uploads');
  const paymentDir=path.join(snapshotDir,'payments'), documentDir=path.join(snapshotDir,'documents');
  fs.mkdirSync(paymentDir,{recursive:true});fs.mkdirSync(documentDir,{recursive:true});
  atomicWriteFile(fp,JSON.stringify(backupDatabaseSnapshot(),null,2));
  const payments=[],documents=[];
  try{
    for(const file of fs.readdirSync(UPLOAD_DIR)){
      if(!PAYMENT_PROOF_FILE_RE.test(file)) continue;
      const src=path.join(UPLOAD_DIR,file),dest=path.join(paymentDir,file);fs.copyFileSync(src,dest);
      payments.push({name:file,size:fs.statSync(dest).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')});
    }
    for(const file of fs.readdirSync(DOCUMENT_UPLOAD_DIR)){
      if(!/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|png|webp)$/i.test(file)) continue;
      const src=path.join(DOCUMENT_UPLOAD_DIR,file),dest=path.join(documentDir,file);fs.copyFileSync(src,dest);
      documents.push({name:file,size:fs.statSync(dest).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')});
    }
  }catch(e){try{fs.rmSync(snapshotDir,{recursive:true,force:true})}catch{};throw new Error('Upload backup failed');}
  const databaseSha256=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
  atomicWriteFile(path.join(snapshotDir,'manifest.json'),JSON.stringify({version:3,database_sha256:databaseSha256,payment_proofs:payments,documents},null,2));
  return {name,path:fp,created_at:now(),upload_snapshot:snapshotDir,proof_files:payments.length,document_files:documents.length,database_sha256:databaseSha256};
}
function verifyManagedBackup(name){
  if(!/^angelstore-[\w.-]+\.json$/.test(name))throw new Error('Invalid backup name');
  const fp=path.join(BACKUP_DIR,name),snapshotDir=path.join(BACKUP_DIR,name+'.uploads'),manifestPath=path.join(snapshotDir,'manifest.json');
  if(!fs.existsSync(fp))throw new Error('Backup नहीं मिला');
  let database,manifest;
  try{database=fs.readFileSync(fp);JSON.parse(database);manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch(e){throw new Error('Backup JSON/manifest invalid है')}
  const databaseSha256=crypto.createHash('sha256').update(database).digest('hex');
  if(manifest.database_sha256&&String(manifest.database_sha256).toLowerCase()!==databaseSha256)throw new Error('Database checksum mismatch');
  const paymentItems=manifest.version>=2?(Array.isArray(manifest.payment_proofs)?manifest.payment_proofs:[]):(Array.isArray(manifest.files)?manifest.files:[]);
  const documentItems=manifest.version>=2?(Array.isArray(manifest.documents)?manifest.documents:[]):[];
  const verifyItems=(items,subdir,pattern,label)=>{let count=0;for(const item of items){if(!item||typeof item.name!=='string'||!pattern.test(item.name))throw new Error('Invalid '+label+' filename');const src=path.join(snapshotDir,subdir,path.basename(item.name));if(!fs.existsSync(src))throw new Error('Missing '+label+': '+item.name);const bytes=fs.readFileSync(src),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(String(item.sha256).toLowerCase()!==hash)throw new Error(label+' checksum mismatch: '+item.name);if(Number.isFinite(Number(item.size))&&Number(item.size)!==bytes.length)throw new Error(label+' size mismatch: '+item.name);count++}return count};
  const proofFiles=verifyItems(paymentItems,manifest.version>=2?'payments':'',PAYMENT_PROOF_FILE_RE,'payment proof');
  const documentFiles=verifyItems(documentItems,'documents',/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|png|webp)$/i,'document');
  return {ok:true,name,database_sha256:databaseSha256,manifest_version:manifest.version||1,payment_proofs:proofFiles,documents:documentFiles,verified_at:now()};
}
function backupBundlePayload(backup){
  const fp=path.join(BACKUP_DIR,backup.name), snapshotDir=path.join(BACKUP_DIR,backup.name+'.uploads');
  const manifestPath=path.join(snapshotDir,'manifest.json');let manifest={version:2,payment_proofs:[],documents:[]};try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{}
  const collect=(items,subdir)=>items.map(item=>{const f=path.join(snapshotDir,subdir,path.basename(item.name));if(!fs.existsSync(f))throw new Error('Backup upload file missing: '+item.name);return {...item,data:fs.readFileSync(f).toString('base64')}});
  const payment_proofs=Array.isArray(manifest.payment_proofs)?manifest.payment_proofs:(Array.isArray(manifest.files)?manifest.files:[]);
  return {name:backup.name,created_at:backup.created_at,database:JSON.parse(fs.readFileSync(fp,'utf8')),manifest:{version:2,payment_proofs:collect(payment_proofs,manifest.version===2?'payments':''),documents:collect(Array.isArray(manifest.documents)?manifest.documents:[],'documents')}};
}
async function uploadOffsiteBackup(backup){
  if(!OFFSITE_BACKUP_URL) return {configured:false,uploaded:false};
  if(!OFFSITE_BACKUP_ENCRYPTION_KEY) throw new Error('Off-site backup encryption key is required when off-site backup is enabled');
  const rawPayload=JSON.stringify(backupBundlePayload(backup));
  const encrypted=encryptOffsitePayload(rawPayload);
  if(!encrypted) throw new Error('Unable to encrypt off-site backup payload');
  const payload=JSON.stringify(encrypted);
  const headers={'Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),'X-Angelstore-Backup':backup.name,'X-Angelstore-Backup-Encrypted':encrypted?'1':'0'};
  if(OFFSITE_BACKUP_TOKEN) headers.Authorization='Bearer '+OFFSITE_BACKUP_TOKEN;
  const r=await fetch(OFFSITE_BACKUP_URL,{method:'POST',headers,body:payload});
  if(!r.ok) throw new Error('Off-site backup upload failed: HTTP '+r.status);
  return {configured:true,uploaded:true,encrypted:!!encrypted,status:r.status,bytes:Buffer.byteLength(payload)};
}
function pruneLocalBackups(){
  const names=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x)).map(name=>({name,mtime:fs.statSync(path.join(BACKUP_DIR,name)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime);
  for(const x of names.slice(BACKUP_RETENTION)){
    try{fs.rmSync(path.join(BACKUP_DIR,x.name),{force:true});fs.rmSync(path.join(BACKUP_DIR,x.name+'.uploads'),{recursive:true,force:true})}catch(e){console.error('Backup prune failed',x.name,e.message)}
  }
  return Math.max(0,names.length-BACKUP_RETENTION);
}
async function createManagedBackup(reason='manual'){
  const b=backupFile(); let offsite={configured:!!OFFSITE_BACKUP_URL,uploaded:false};
  if(OFFSITE_BACKUP_URL) offsite=await uploadOffsiteBackup(b);
  const pruned=pruneLocalBackups();
  db.audit.unshift({id:newId(),action:'BACKUP_CREATED',file:b.name,reason,offsite_uploaded:!!offsite.uploaded,by:'system',at:b.created_at});
  save();
  return {...b,reason,offsite,pruned_local:pruned};
}
function scheduleBackups(){
  if(!SCHEDULED_BACKUP_ENABLED)return null;
  const interval=SCHEDULED_BACKUP_HOURS*60*60*1000;
  const run=async()=>{try{const b=await createManagedBackup('scheduled');console.log('[backup] scheduled backup created',b.name,b.offsite?.uploaded?'offsite=ok':'offsite=not-configured')}catch(e){console.error('[backup] scheduled backup failed',e.message)}};
  const timer=setInterval(run,interval);timer.unref?.();return timer;
}
function storageStatus(){
  const stat=(p)=>{try{const s=fs.statSync(p);return {exists:true,writable:!!(s.mode&0o200),bytes:s.isFile()?s.size:0}}catch{return {exists:false,writable:false,bytes:0}}};
  let uploads=0,backups=0; try{uploads=fs.readdirSync(UPLOAD_DIR).filter(x=>/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(png|jpg|webp)$/i.test(x)).length}catch{} try{backups=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x)).length}catch{}
  return {storage_root:STORAGE_ROOT,data_file:stat(DATA),upload_dir:stat(UPLOAD_DIR),backup_dir:stat(BACKUP_DIR),payment_proof_files:uploads,backup_files:backups,persistence_configured:!!process.env.ANGELSTORE_STORAGE_DIR,checked_at:now()};
}

function staffByIdentifier(identifier){const key=String(identifier||'').trim();return db.staff.find(x=>x.employee_id===key||x.mobile===key)||null}
function staffSessionFor(st,sid){return sign({kind:'staff',sid,staff_id:st.staff_id,employee_id:st.employee_id,role:st.role||'staff',name:st.name,exp:Date.now()+12*60*60*1000})}
function staffAuth(req){const c=parseCookies(req);const raw=c.angel_staff||String(req.headers['x-staff-session']||'');const x=verify(raw,'staff');if(!x)return null;const active=db.staff_sessions?.find(z=>z.sid===x.sid&&z.staff_id===x.staff_id&&!z.revoked_at&&new Date(z.expires_at).getTime()>Date.now());if(!active)return null;const st=db.staff.find(z=>z.staff_id===x.staff_id&&z.status!=='inactive');return st?{...x,record:st}:null}
const STAFF_ROLE_PERMISSIONS={
  viewer:['dashboard','view_assigned','quality_view'],
  staff:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process'],
  senior_staff:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process'],
  supervisor:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','staff_view','queue_manage','recharge_process'],
  manager:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','staff_view','queue_manage','reports_view','recharge_process'],
  // Legacy role aliases retained so existing staff records do not lose access during migration.
  mistri:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process'],
  operator:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process'],
  home_agent:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process'],
  delivery_agent:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','recharge_process']
};
function staffRoleName(st){const role=String(st?.role||'staff').trim().toLowerCase();return STAFF_ROLE_PERMISSIONS[role]?role:'staff'}
function staffHasPermission(st,permission){return Boolean(STAFF_ROLE_PERMISSIONS[staffRoleName(st)]?.includes(permission))}
function staffAvailabilityToday(st){const row=(db.staff_attendance||[]).find(x=>x.staff_id===st.staff_id&&x.date===today());const status=row?.status||null;const unavailable=['absent','leave','holiday'].includes(status)||String(st.status||'active')!=='active';return {available:!unavailable,status:status||'available',label:status==='holiday'?'Holiday':status==='leave'?'On Leave':status==='absent'?'Absent':status==='half_day'?'Half Day':'Available'};}
function staffPublic(st){const role=staffRoleName(st);const availability=staffAvailabilityToday(st);return {staff_id:st.staff_id,employee_id:st.employee_id,name:st.name,mobile:st.mobile,role,status:st.status||'active',permissions:[...STAFF_ROLE_PERMISSIONS[role]],daily_rate:Number(st.daily_rate||0),created_at:st.created_at,available_today:availability.available,availability_status:availability.status,availability_label:availability.label}}
function staffTask(t){return {id:t.id,token:t.token,name:t.name,mobile:t.mobile,service:t.service,status:t.status,created_at:t.created_at,date:t.date,staff_id:t.staff_id||null,assigned_at:t.assigned_at||null,started_at:t.started_at||null,resumed_at:t.resumed_at||null,completed_at:t.completed_at||null,last_action_at:t.last_action_at||null,hold_reason:t.hold_reason||null,hold_owner:t.hold_owner||null,hold_delay_minutes:Number(t.hold_delay_minutes||0)||null,hold_started_at:t.hold_started_at||null,hold_deadline:t.hold_deadline||null,total_hold_minutes:Number(t.total_hold_minutes||0),quality_status:t.quality_status||'needs_review',quality_reviewed_at:t.quality_reviewed_at||null,state_revision:Number(t.state_revision||0)}}


function money(v){const n=Number(v);return Number.isFinite(n)&&n>=0?Number(n.toFixed(2)):0}
function signedMoney(v){const n=Number(v);return Number.isFinite(n)?Number(n.toFixed(2)):0}
function costSettings(){
  const st=db.settings||{};
  return {
    default_home_fee:money(st.default_home_fee??50),
    default_delivery_fee:money(st.default_delivery_fee??40),
    default_home_staff_allowance:money(st.default_home_staff_allowance??20),
    default_delivery_staff_allowance:money(st.default_delivery_staff_allowance??15)
  };
}
function ensureCustomer(name,mobile){
  let c=db.customers.find(z=>z.mobile===mobile);
  if(!c){c={id:newId(),customer_id:STORAGE.customerIdFor(mobile),name,mobile,status:'active',pin_set:false,created_at:now(),updated_at:now()};db.customers.push(c)}
  else {if(name)c.name=name;c.updated_at=now()}
  return c;
}
function serviceFinancials(x){
  const service=String(x.service||'').trim();
  const base=money(x.base_service_fee??chargeFor(service)??0);
  const official=money(x.official_fee??0);
  const angel=money(x.angelstore_fee??Math.max(0,base-official));
  const home=money(x.home_service_fee??0), delivery=money(x.delivery_fee??0);
  const staff=money(x.staff_commission??0), homeAllowance=money(x.home_staff_allowance??0), deliveryAllowance=money(x.delivery_staff_allowance??0);
  const payment=money(x.payment_charge??0), deliveryCost=money(x.delivery_actual_cost??0), travel=money(x.home_travel_cost??0), other=money(x.other_direct_cost??0);
  const customerTotal=money(x.customer_total??(base+home+delivery));
  const directCost=money(official+staff+homeAllowance+deliveryAllowance+payment+deliveryCost+travel+other);
  const contribution=money(customerTotal-directCost);
  return {base_service_fee:base,official_fee:official,angelstore_fee:angel,home_service_fee:home,delivery_fee:delivery,staff_commission:staff,home_staff_allowance:homeAllowance,delivery_staff_allowance:deliveryAllowance,payment_charge:payment,delivery_actual_cost:deliveryCost,home_travel_cost:travel,other_direct_cost:other,customer_total:customerTotal,direct_cost:directCost,angelstore_contribution:contribution};
}
function publicHome(h){return {id:h.id,home_service_id:h.home_service_id,customer_id:h.customer_id,name:h.name,mobile:h.mobile,service:h.service,address:h.address,preferred_date:h.preferred_date,preferred_time:h.preferred_time,status:h.status,staff_id:h.staff_id||null,fee:money(h.home_service_fee),travel_cost:money(h.home_travel_cost),staff_allowance:money(h.staff_allowance),created_at:h.created_at,assigned_at:h.assigned_at||null,completed_at:h.completed_at||null,completion_note:h.completion_note||null,proof_reference:h.proof_reference||null,completed_by:h.completed_by||null}}
function publicDelivery(d){return {id:d.id,delivery_id:d.delivery_id,customer_id:d.customer_id,name:d.name,mobile:d.mobile,token_id:d.token_id||null,address:d.address,status:d.status,delivery_fee:money(d.delivery_fee),actual_cost:money(d.actual_cost),staff_allowance:money(d.staff_allowance),staff_id:d.staff_id||null,created_at:d.created_at,assigned_at:d.assigned_at||null,delivered_at:d.delivered_at||null,delivery_note:d.delivery_note||null,proof_reference:d.proof_reference||null,delivered_by:d.delivered_by||null}}
function dateOnly(v){return String(v||'').slice(0,10)}
function inDateRange(v,from='',to=''){const d=dateOnly(v);return (!from||d>=from)&&(!to||d<=to)}
function staffAttendanceRows(staffId='',from='',to=''){
  return db.staff_attendance.filter(x=>(!staffId||x.staff_id===staffId)&&inDateRange(x.date,from,to)).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
}
function staffSalaryBase(staffId,from='',to=''){
  const st=db.staff.find(x=>x.staff_id===staffId);if(!st)return 0;
  const days=new Set(staffAttendanceRows(staffId,from,to).filter(x=>x.status==='present'||x.status==='half_day').map(x=>x.date));
  let total=0;for(const r of staffAttendanceRows(staffId,from,to)){if(r.status==='present')total+=Number(st.daily_rate||0);else if(r.status==='half_day')total+=Number(st.daily_rate||0)/2}
  return money(total)
}
function settlementForStaff(staffId,from,to){
  const st=db.staff.find(x=>x.staff_id===staffId);if(!st)return null;
  const attendance=staffAttendanceRows(staffId,from,to);
  const present=attendance.filter(x=>x.status==='present').length;
  const half=attendance.filter(x=>x.status==='half_day').length;
  const salary=money(present*Number(st.daily_rate||0)+half*Number(st.daily_rate||0)/2);
  const commission=money(db.commissions.filter(x=>x.staff_id===staffId&&inDateRange(x.created_at||x.date,from,to)).reduce((a,x)=>a+Number(x.amount||0),0));
  const home=money(db.home_services.filter(x=>x.staff_id===staffId&&inDateRange(x.created_at,from,to)).reduce((a,x)=>a+Number(x.staff_allowance||0),0));
  const delivery=money(db.deliveries.filter(x=>x.staff_id===staffId&&inDateRange(x.created_at,from,to)).reduce((a,x)=>a+Number(x.staff_allowance||0),0));
  const advances=money(db.expenses.filter(x=>x.staff_id===staffId&&x.type==='staff_advance'&&inDateRange(x.created_at,from,to)).reduce((a,x)=>a+Number(x.amount||0),0));
  return {staff_id:staffId,employee_id:st.employee_id,name:st.name,from,to,present_days:present,half_days:half,base_salary:salary,commission,home_allowance:home,delivery_allowance:delivery,advances,net_payable:money(salary+commission+home+delivery-advances)}
}
function financeStaffSummary(from='',to=''){
  return db.staff.map(st=>settlementForStaff(st.staff_id,from,to)).filter(Boolean)
}
function rangeParams(u){return {from:u.searchParams.get("from")||"",to:u.searchParams.get("to")||""}}
function serviceAnalytics(from='',to=''){
  const inRange=d=>inDateRange(d,from,to), rows={};
  const tokens=db.tokens.filter(x=>inRange(x.date||x.created_at));
  for(const t of tokens){const k=t.service||'Unknown';rows[k]??={service:k,tokens:0,completed:0,pending:0,cancelled:0,verified_collection:0,official_fee:0,staff_commission:0,contribution:0};const r=rows[k];r.tokens++;if(t.status==='पूर्ण')r.completed++;if(t.status==='लंबित')r.pending++;if(t.status==='रद्द')r.cancelled++;const pay=db.payments.find(x=>Number(x.id)===Number(t.payment_id)&&x.status==='Verified');if(pay){r.verified_collection+=Number(pay.amount||0);r.official_fee+=Number(pay.official_fee||0);r.staff_commission+=Number(pay.staff_commission||0);r.contribution+=Number(pay.amount||0)-Number(pay.official_fee||0)-Number(pay.staff_commission||0)-Number(pay.payment_charge||0)}}
  return Object.values(rows).map(r=>({...r,verified_collection:money(r.verified_collection),official_fee:money(r.official_fee),staff_commission:money(r.staff_commission),contribution:signedMoney(r.contribution),completion_rate:r.tokens?Math.round(r.completed*10000/r.tokens)/100:0})).sort((a,b)=>b.tokens-a.tokens)
}
function staffPerformance(from='',to=''){
  const inRange=d=>inDateRange(d,from,to);
  return db.staff.map(st=>{const assigned=db.tokens.filter(t=>t.staff_id===st.staff_id&&inRange(t.assigned_at||t.created_at));const completed=assigned.filter(t=>t.status==='पूर्ण').length;const qualityPassed=assigned.filter(t=>t.quality_status==='passed').length;const qcNeedsReview=assigned.filter(t=>t.quality_status==='needs_review').length;const visits=db.home_services.filter(x=>x.staff_id===st.staff_id&&inRange(x.created_at)).length;const deliveries=db.deliveries.filter(x=>x.staff_id===st.staff_id&&inRange(x.created_at)).length;const commission=money(db.commissions.filter(x=>x.staff_id===st.staff_id&&inRange(x.created_at||x.date)).reduce((a,x)=>a+Number(x.amount||0),0));return {staff_id:st.staff_id,employee_id:st.employee_id,name:st.name,role:st.role||'staff',status:st.status||'active',assigned:assigned.length,completed,active:assigned.filter(t=>!['पूर्ण','रद्द','स्किप'].includes(t.status)).length,quality_passed:qualityPassed,qc_needs_review:qcNeedsReview,home_visits:visits,deliveries,commission,completion_rate:assigned.length?Math.round(completed*10000/assigned.length)/100:0}}).sort((a,b)=>b.completed-a.completed||b.assigned-a.assigned)
}
function customerHistory(mobile){
  const m=String(mobile||'').trim();if(!validMobile(m))return null;const customer=db.customers.find(x=>x.mobile===m)||null;const tokens=db.tokens.filter(x=>x.mobile===m).sort((a,b)=>Number(b.id)-Number(a.id));const payments=db.payments.filter(x=>x.mobile===m).sort((a,b)=>Number(b.id)-Number(a.id)).map(customerPayment);const applications=db.applications.filter(x=>x.mobile===m).sort((a,b)=>Number(b.id)-Number(a.id));const home=db.home_services.filter(x=>x.mobile===m).sort((a,b)=>Number(b.id)-Number(a.id)).map(publicHome);const deliveries=db.deliveries.filter(x=>x.mobile===m).sort((a,b)=>Number(b.id)-Number(a.id)).map(publicDelivery);return {customer:customer?customerPublic(customer):{name:tokens[0]?.name||payments[0]?.name||'',mobile:m,status:'active'},summary:{tokens:tokens.length,payments:payments.length,applications:applications.length,home_services:home.length,deliveries:deliveries.length,verified_paid:money(payments.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0))},tokens:tokens.map(staffTask),payments,applications,home_services:home,deliveries:deliveries};
}
function controlCenter(from='',to=''){
  const inRange=d=>inDateRange(d,from,to),tokens=db.tokens.filter(x=>inRange(x.date||x.created_at));const pendingPayments=db.payments.filter(x=>x.status==='Pending Verification'&&inRange(String(x.created_at).slice(0,10))).length;const unassigned=tokens.filter(x=>!x.staff_id&&!['पूर्ण','रद्द','स्किप'].includes(x.status)).length;const qc=tokens.filter(x=>x.staff_id&&!['पूर्ण','रद्द','स्किप'].includes(x.status)&&x.quality_status!=='passed').length;const activeStaff=db.staff.filter(x=>x.status==='active').length;const homePending=db.home_services.filter(x=>inRange(x.created_at)&&['Requested','Assigned'].includes(x.status)).length;const openComplaints=db.complaints.filter(x=>inRange(x.created_at)&&!['closed','resolved'].includes(String(x.status||'').toLowerCase())).length;return {period:{from,to},kpis:{tokens:tokens.length,active_tokens:tokens.filter(x=>!['पूर्ण','रद्द','स्किप'].includes(x.status)).length,completed:tokens.filter(x=>x.status==='पूर्ण').length,pending_payments:pendingPayments,unassigned_tokens:unassigned,qc_pending:qc,active_staff:activeStaff,home_pending:homePending,open_complaints:openComplaints},alerts:[...(pendingPayments?[{type:'payment',severity:'high',count:pendingPayments,label:'Payment verification pending'}]:[]),...(unassigned?[{type:'assignment',severity:'medium',count:unassigned,label:'Token staff assignment pending'}]:[]),...(qc?[{type:'quality',severity:'high',count:qc,label:'Final Quality Review pending'}]:[]),...(openComplaints?[{type:'complaint',severity:'high',count:openComplaints,label:'Open complaints'}]:[])]};
}

const PAYMENT_LIFECYCLE = Object.freeze({
  'Pending Verification': new Set(['Verified','Rejected']),
  'Verified': new Set([]),
  'Rejected': new Set([])
});
const UPPCL_PROCESS_LIFECYCLE = Object.freeze({
  'Awaiting Payment Verification': new Set(['Completed','Failed']),
  'Completed': new Set([]),
  'Failed': new Set([])
});
const RECHARGE_LIFECYCLE = Object.freeze({
  'Pending': new Set(['Success','Failed']),
  'Success': new Set([]),
  'Failed': new Set([])
});
function lifecycleCanMove(map,current,next){
  const allowed=map[String(current||'')];
  return !!allowed && allowed.has(String(next||''));
}
function paymentLifecycleIssues(){
  const issues=[];
  const add=(type,severity,message,extra={})=>issues.push({type,severity,message,...extra});
  for(const p of (db.payments||[])){
    const status=String(p.status||'');
    if(!PAYMENT_LIFECYCLE[status]) add('PAYMENT_UNKNOWN_STATE','high',`Payment #${p.id} has unknown lifecycle state ${status||'(empty)'}.`,{payment_id:p.id,state:status});
    if(status==='Verified' && !p.verified_at) add('PAYMENT_VERIFIED_WITHOUT_TIMESTAMP','medium',`Verified payment #${p.id} has no verified_at timestamp.`,{payment_id:p.id});
    if(status==='Rejected' && !p.reject_reason) add('PAYMENT_REJECTED_WITHOUT_REASON','medium',`Rejected payment #${p.id} has no rejection reason.`,{payment_id:p.id});
    if(p.service==='UPPCL Bill Payment'){
      const ps=String(p.uppcl_processing_status||'Awaiting Payment Verification');
      if(!UPPCL_PROCESS_LIFECYCLE[ps]) add('UPPCL_UNKNOWN_PROCESS_STATE','high',`UPPCL payment #${p.id} has unknown processing state ${ps}.`,{payment_id:p.id,state:ps});
      if(ps==='Completed' && status!=='Verified') add('UPPCL_COMPLETED_BEFORE_PAYMENT_VERIFIED','critical',`UPPCL payment #${p.id} is Completed while payment state is ${status}.`,{payment_id:p.id,state:status,processing_state:ps});
      if(ps==='Completed' && !p.receipt_no) add('UPPCL_COMPLETED_WITHOUT_RECEIPT','medium',`UPPCL payment #${p.id} is Completed without receipt number.`,{payment_id:p.id});
    }
  }
  for(const r of (db.recharge_transactions||[])){
    const status=String(r.status||'');
    if(!RECHARGE_LIFECYCLE[status]) add('RECHARGE_UNKNOWN_STATE','high',`Recharge #${r.id} has unknown lifecycle state ${status||'(empty)'}.`,{recharge_id:r.id,state:status});
    if(status==='Success' && r.payment_id){
      const pay=(db.payments||[]).find(p=>Number(p.id)===Number(r.payment_id));
      if(!pay || pay.status!=='Verified') add('RECHARGE_SUCCESS_BEFORE_PAYMENT_VERIFIED','critical',`Recharge #${r.id} is Success without a linked Verified payment.`,{recharge_id:r.id,payment_id:r.payment_id});
    }
  }
  return issues;
}
function globalPaymentLifecycleAudit(){
  const issues=paymentLifecycleIssues();
  const payments=Array.isArray(db.payments)?db.payments:[];
  const recharges=Array.isArray(db.recharge_transactions)?db.recharge_transactions:[];
  const uppcl=payments.filter(p=>p.service==='UPPCL Bill Payment');
  return {ok:issues.length===0,issue_count:issues.length,issues:issues.slice(0,300),checked:{payments:payments.length,recharges:recharges.length,uppcl_payments:uppcl.length},states:{payments:Object.fromEntries([...new Set(payments.map(p=>String(p.status||'')))].sort().map(x=>[x,payments.filter(p=>String(p.status||'')===x).length])),recharge:Object.fromEntries([...new Set(recharges.map(r=>String(r.status||'')))].sort().map(x=>[x,recharges.filter(r=>String(r.status||'')===x).length])),uppcl_processing:Object.fromEntries([...new Set(uppcl.map(p=>String(p.uppcl_processing_status||'Awaiting Payment Verification')))].sort().map(x=>[x,uppcl.filter(p=>String(p.uppcl_processing_status||'Awaiting Payment Verification')===x).length]))},checked_at:now()};
}

function globalPaymentReconciliation(){
  const issues=[];
  const payments=Array.isArray(db.payments)?db.payments:[];
  const applications=Array.isArray(db.applications)?db.applications:[];
  const recharges=Array.isArray(db.recharge_transactions)?db.recharge_transactions:[];
  const bills=Array.isArray(db.uppcl_manual_bills)?db.uppcl_manual_bills:[];
  const idem=Array.isArray(db.payment_idempotency)?db.payment_idempotency:[];
  const appById=new Map(applications.map(a=>[Number(a.id),a]));
  const payById=new Map(payments.map(x=>[Number(x.id),x]));
  const rechargeByPayment=new Map();
  for(const r of recharges){if(r.payment_id){const k=Number(r.payment_id);rechargeByPayment.set(k,(rechargeByPayment.get(k)||[]).concat(r));}}
  const add=(type,severity,message,extra={})=>issues.push({type,severity,message,...extra});
  for(const p of payments){
    if(p.application_id && !appById.has(Number(p.application_id))) add('PAYMENT_ORPHAN_APPLICATION','high',`Payment #${p.id} references missing application #${p.application_id}.`,{payment_id:p.id,application_id:p.application_id,service:p.service||''});
    if(p.status==='Verified' && p.application_id){const a=appById.get(Number(p.application_id)); if(a && ['Payment Pending','Payment Verification Pending'].includes(a.status)) add('APPLICATION_STATUS_MISMATCH','medium',`Verified payment #${p.id} is linked to application ${a.application_id||a.id}, but application is still ${a.status}.`,{payment_id:p.id,application_id:a.id,service:p.service||'',repairable:true,repair_action:'sync_application_payment_status'});}
    if(p.service==='UPPCL Bill Payment' && p.status==='Verified' && p.uppcl_processing_status==='Completed' && !p.receipt_no) add('UPPCL_COMPLETED_NO_RECEIPT','medium',`Completed UPPCL payment #${p.id} has no receipt number.`,{payment_id:p.id,application_id:p.application_id||null,repairable:true,repair_action:'repair_uppcl_receipt'});
  }
  // STEP643: cross-workflow receipt/token invariants. A receipt is only valid
  // after the linked payment is verified AND its service workflow is terminal.
  for(const p of payments){
    if(p.receipt_no && p.status!=='Verified') add('RECEIPT_BEFORE_PAYMENT_VERIFIED','critical',`Payment #${p.id} has receipt ${p.receipt_no} while payment state is ${p.status}.`,{payment_id:p.id,receipt_no:p.receipt_no,state:p.status});
    if(p.receipt_no && p.status==='Verified' && !receiptEligibility(p)) add('RECEIPT_BEFORE_WORKFLOW_COMPLETION','high',`Payment #${p.id} has receipt ${p.receipt_no} before its service workflow is completed.`,{payment_id:p.id,receipt_no:p.receipt_no,service:p.service||'',application_id:p.application_id||null});
  }
  for(const t of (db.tokens||[])){
    const p=t.payment_id?payById.get(Number(t.payment_id)):null;
    if(t.payment_id && !p) add('TOKEN_ORPHAN_PAYMENT','high',`Token #${t.id} references missing payment #${t.payment_id}.`,{token_id:t.id,payment_id:t.payment_id});
    if(t.payment_id && p && p.status!=='Verified') add('TOKEN_BEFORE_PAYMENT_VERIFIED','critical',`Token #${t.id} exists while linked payment #${p.id} is ${p.status}.`,{token_id:t.id,payment_id:p.id,state:p.status});
    if(t.payment_id && p && t.application_id && p.application_id && Number(t.application_id)!==Number(p.application_id)) add('TOKEN_PAYMENT_APPLICATION_MISMATCH','high',`Token #${t.id}, payment #${p.id} and application links do not match.`,{token_id:t.id,payment_id:p.id,token_application_id:t.application_id,payment_application_id:p.application_id});
  }
  for(const r of recharges){
    if(!r.payment_id){ if(r.source==='customer-payment') add('RECHARGE_MISSING_PAYMENT','high',`Customer recharge #${r.id} has no linked payment.`,{recharge_id:r.id}); continue; }
    const p=payById.get(Number(r.payment_id));
    if(!p) add('RECHARGE_ORPHAN_PAYMENT','high',`Recharge #${r.id} references missing payment #${r.payment_id}.`,{recharge_id:r.id,payment_id:r.payment_id});
    else {
      if(Number(p.amount)!==Number(r.amount)) add('RECHARGE_AMOUNT_MISMATCH','high',`Recharge #${r.id} amount ₹${r.amount} differs from payment #${p.id} amount ₹${p.amount}.`,{recharge_id:r.id,payment_id:p.id});
      if(r.status==='Success' && p.status!=='Verified') add('RECHARGE_TERMINAL_PAYMENT_MISMATCH','high',`Recharge #${r.id} is Success while linked payment #${p.id} is ${p.status}.`,{recharge_id:r.id,payment_id:p.id});
      if(r.status==='Success' && p.application_id && r.application_id && Number(p.application_id)!==Number(r.application_id)) add('RECHARGE_APPLICATION_MISMATCH','high',`Recharge #${r.id} and payment #${p.id} point to different applications.`,{recharge_id:r.id,payment_id:p.id,application_id:r.application_id,payment_application_id:p.application_id});
    }
    if(r.application_id && !appById.has(Number(r.application_id))) add('RECHARGE_ORPHAN_APPLICATION','high',`Recharge #${r.id} references missing application #${r.application_id}.`,{recharge_id:r.id,application_id:r.application_id});
    if(r.payment_id && !r.application_id){const linked=payById.get(Number(r.payment_id));if(linked?.application_id&&appById.has(Number(linked.application_id))) add('RECHARGE_MISSING_APPLICATION_LINK','medium',`Recharge #${r.id} has a linked payment/application source but no application link.`,{recharge_id:r.id,payment_id:r.payment_id,application_id:linked.application_id,repairable:true,repair_action:'link_recharge_application'});}
  }
  const seenIdem=new Map();
  for(const x of idem){const k=`${x.scope||''}|${x.key||''}`;if(!x.key)continue;if(seenIdem.has(k)){const prev=seenIdem.get(k);if(String(prev.fingerprint||'')!==String(x.fingerprint||'')) add('IDEMPOTENCY_DUPLICATE_CONFLICT','high',`Idempotency scope/key ${x.scope}/${x.key} has conflicting records.`,{scope:x.scope,key:x.key});else add('IDEMPOTENCY_DUPLICATE_RECORD','medium',`Duplicate idempotency record for ${x.scope}/${x.key}.`,{scope:x.scope,key:x.key});}else seenIdem.set(k,x);}
  const uppclPayments=payments.filter(p=>p.service==='UPPCL Bill Payment');
  for(const p of uppclPayments){if(p.uppcl_processing_status==='Completed' && p.application_id && !appById.has(Number(p.application_id))) add('UPPCL_ORPHAN_APPLICATION','high',`UPPCL completed payment #${p.id} references missing application.`,{payment_id:p.id,application_id:p.application_id});}
  const repaired=(db.audit||[]).filter(x=>['GLOBAL_RECONCILIATION_REVIEWED','GLOBAL_RECONCILIATION_REPAIRED'].includes(x.action)).slice(0,50);
  return {ok:issues.length===0,issue_count:issues.length,issues,checked:{payments:payments.length,applications:applications.length,recharges:recharges.length,uppcl_bills:bills.length,idempotency_records:idem.length},recent_recovery_audit:repaired,checked_at:now()};
}

function unifiedFinancialReport(from='',to=''){
  const inRange=d=>inDateRange(d,from,to);
  const payments=(db.payments||[]).filter(x=>x.status==='Verified'&&inRange(x.created_at));
  const ledger=(db.financial_ledger||[]).filter(x=>inRange(x.created_at));
  const expenses=(db.expenses||[]).filter(x=>inRange(x.created_at));
  const commissions=(db.commissions||[]).filter(x=>inRange(x.created_at||x.date));
  const staffMap=new Map((db.staff||[]).map(x=>[String(x.staff_id),x]));
  const daily=new Map(), service=new Map(), staff=new Map();
  const add=(map,key,base)=>{if(!map.has(key))map.set(key,{...base});return map.get(key)};
  for(const p of payments){
    const day=String(p.created_at||'').slice(0,10)||'Unknown';
    const d=add(daily,day,{date:day,transactions:0,collection:0,official_fee:0,staff_commission:0,payment_charges:0});
    d.transactions++;d.collection+=Number(p.amount||0);d.official_fee+=Number(p.official_fee||0);d.staff_commission+=Number(p.staff_commission||0);d.payment_charges+=Number(p.payment_charge||0);
    const svc=String(p.service||'Unknown');
    const sr=add(service,svc,{service:svc,transactions:0,collection:0,official_fee:0,staff_commission:0});
    sr.transactions++;sr.collection+=Number(p.amount||0);sr.official_fee+=Number(p.official_fee||0);sr.staff_commission+=Number(p.staff_commission||0);
    const sid=String(p.staff_id||'unassigned');
    const st=staffMap.get(sid);
    const wr=add(staff,sid,{staff_id:sid,staff_name:st?.name||'Unassigned',transactions:0,collection:0,commission:0});
    wr.transactions++;wr.collection+=Number(p.amount||0);wr.commission+=Number(p.staff_commission||0);
  }
  for(const c of commissions){
    const sid=String(c.staff_id||'unassigned'),st=staffMap.get(sid);
    const wr=add(staff,sid,{staff_id:sid,staff_name:st?.name||'Unassigned',transactions:0,collection:0,commission:0});
    if(!c.source_id || !payments.some(p=>String(p.id)===String(c.source_id))) wr.commission+=Number(c.amount||0);
  }
  const collection=payments.reduce((a,x)=>a+Number(x.amount||0),0);
  const ledgerCollection=ledger.filter(x=>x.event_type==='PAYMENT_VERIFIED').reduce((a,x)=>a+Number(x.amount||0),0);
  const operatingExpenses=expenses.filter(x=>x.type!=='staff_advance').reduce((a,x)=>a+Number(x.amount||0),0);
  const staffCommission=payments.reduce((a,x)=>a+Number(x.staff_commission||0),0);
  const officialFees=payments.reduce((a,x)=>a+Number(x.official_fee||0),0);
  const paymentCharges=payments.reduce((a,x)=>a+Number(x.payment_charge||0),0);
  const issues=[];
  if(Math.abs(collection-ledgerCollection)>0.009) issues.push({type:'LEDGER_REPORT_COLLECTION_MISMATCH',severity:'critical',collection:money(collection),ledger_collection:money(ledgerCollection)});
  return {ok:issues.length===0,from:from||null,to:to||null,summary:{verified_collection:money(collection),ledger_verified_collection:money(ledgerCollection),transactions:payments.length,official_fees:money(officialFees),staff_commission:money(staffCommission),payment_charges:money(paymentCharges),operating_expenses:money(operatingExpenses),net_after_direct_costs:signedMoney(collection-officialFees-staffCommission-paymentCharges-operatingExpenses)},daily:Array.from(daily.values()).map(r=>({...r,collection:money(r.collection),official_fee:money(r.official_fee),staff_commission:money(r.staff_commission),payment_charges:money(r.payment_charges)})).sort((a,b)=>b.date.localeCompare(a.date)),service:Array.from(service.values()).map(r=>({...r,collection:money(r.collection),official_fee:money(r.official_fee),staff_commission:money(r.staff_commission)})).sort((a,b)=>b.collection-a.collection),staff:Array.from(staff.values()).map(r=>({...r,collection:money(r.collection),commission:money(r.commission)})).sort((a,b)=>b.collection-a.collection),issues,generated_at:now()};
}

function financeSummary(from='',to=''){
  const inRange=d=>inDateRange(d,from,to);
  const payments=db.payments.filter(x=>x.status==='Verified'&&inRange(x.created_at));
  const home=db.home_services.filter(x=>inRange(x.created_at));
  const del=db.deliveries.filter(x=>inRange(x.created_at));
  const expenses=db.expenses.filter(x=>inRange(x.created_at));
  const customerCollection=money(payments.reduce((a,x)=>a+Number(x.amount||0),0));
  const homeFees=money(home.reduce((a,x)=>a+Number(x.home_service_fee||0),0));
  const deliveryFees=money(del.reduce((a,x)=>a+Number(x.delivery_fee||0),0));
  const officialFees=money(payments.reduce((a,x)=>a+Number(x.official_fee||0),0));
  const staffCommission=money(payments.reduce((a,x)=>a+Number(x.staff_commission||0),0));
  const homeCost=money(home.reduce((a,x)=>a+Number(x.travel_cost||0)+Number(x.staff_allowance||0),0));
  const deliveryCost=money(del.reduce((a,x)=>a+Number(x.actual_cost||0)+Number(x.staff_allowance||0),0));
  const paymentCharges=money(payments.reduce((a,x)=>a+Number(x.payment_charge||0),0));
  const directExpense=money(expenses.filter(x=>x.type!=='staff_advance').reduce((a,x)=>a+Number(x.amount||0),0));
  const salaryBase=money(financeStaffSummary(from,to).reduce((a,x)=>a+Number(x.base_salary||0),0));
  const contribution=signedMoney(customerCollection+homeFees+deliveryFees-officialFees-staffCommission-homeCost-deliveryCost-paymentCharges);
  const netProfit=signedMoney(contribution-salaryBase-directExpense);
  return {customer_collection:customerCollection,home_service_fees:homeFees,delivery_fees:deliveryFees,official_fees:officialFees,staff_commission:staffCommission,home_cost:homeCost,delivery_cost:deliveryCost,payment_charges:paymentCharges,direct_cost:money(officialFees+staffCommission+homeCost+deliveryCost+paymentCharges),contribution,salary_base:salaryBase,operating_expenses:directExpense,net_profit:netProfit};
}


function validHttpsUrl(value){try{const raw=String(value||'').trim();if(!raw||/[\s\u0000-\u001f]/.test(raw))return false;const u=new URL(raw);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}catch{return false}}
function validLogoValue(value){const raw=String(value||'').trim();return !raw||validHttpsUrl(raw)||(raw.startsWith('/')&&!raw.startsWith('//')&&!raw.includes('\\')&&!/[\s\u0000-\u001f]/.test(raw))}

async function route(req,res){
  if(req.method==='OPTIONS'){res.writeHead(204,corsHeaders(req));return res.end()}
  const u=new URL(req.url,'http://localhost'),p=u.pathname;
  res._corsOrigin=corsOrigin(req);
  if(!csrfOk(req))return json(res,403,{error:'CSRF validation failed. Request token missing or invalid.'});
  try{
    // STEP645: Bank/Demat referral directory. No payment, approval, receipt or application workflow is attached.
    if(p==='/api/partner-banks'&&req.method==='GET'){
      const rows=(db.partner_banks||[]).filter(x=>x.active!==false).map(x=>({
        id:x.id,name:x.name,account_type:x.account_type||'Savings / Current',logo:x.logo||'',referral_link:x.referral_link||'',active:true
      }));
      return json(res,200,{banks:rows});
    }
    if(p==='/api/demat-partners'&&req.method==='GET'){
      const rows=(db.demat_partners||[]).filter(x=>x.active!==false).map(x=>({
        id:x.id,name:x.name,account_type:x.account_type||'Demat & Trading',logo:x.logo||'',referral_link:x.referral_link||'',active:true
      }));
      return json(res,200,{partners:rows});
    }
    if(p==='/api/admin/partner-banks'&&req.method==='GET'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});
      return json(res,200,{banks:db.partner_banks||[]});
    }
    if(p==='/api/admin/demat-partners'&&req.method==='GET'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});
      return json(res,200,{partners:db.demat_partners||[]});
    }
    if((p==='/api/admin/partner-banks'||p==='/api/admin/demat-partners')&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req);
      const isBank=p.endsWith('/partner-banks');
      const key=isBank?'partner_banks':'demat_partners';
      const list=db[key]||[];
      const id=Number(x.id||0);
      const name=String(x.name||'').trim();
      const accountType=String(x.account_type||'').trim()||(isBank?'Savings / Current':'Demat & Trading');
      const logo=String(x.logo||'').trim().slice(0,1000);
      const link=String(x.referral_link||'').trim().slice(0,2000);
      if(!name)return json(res,400,{error:isBank?'Bank name जरूरी है':'Partner name जरूरी है'});
      if(link && !validHttpsUrl(link))return json(res,400,{error:'Referral link केवल valid HTTPS URL होना चाहिए'});
      if(logo && !validLogoValue(logo))return json(res,400,{error:'Logo केवल HTTPS URL या सुरक्षित local path होना चाहिए'});
      if(list.some(r=>String(r.name).toLowerCase()===name.toLowerCase()&&Number(r.id)!==id))return json(res,409,{error:'यह नाम पहले से मौजूद है'});
      let row=id?list.find(r=>Number(r.id)===id):null;
      if(id&&!row)return json(res,404,{error:'Record नहीं मिला'});
      if(!row){row={id:newId(),created_at:now()};list.unshift(row);}
      row.name=name;row.account_type=accountType;row.logo=logo;row.referral_link=link;row.active=x.active!==false;row.updated_at=now();
      db[key]=list;
      db.audit.unshift({id:newId(),action:isBank?'PARTNER_BANK_CHANGED':'DEMAT_PARTNER_CHANGED',record_id:row.id,name:row.name,by:a.user||'admin',at:now()});
      save();
      return json(res,200,{ok:true,record:row});
    }
    if((p.startsWith('/api/admin/partner-banks/')||p.startsWith('/api/admin/demat-partners/'))&&req.method==='DELETE'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const parts=p.split('/');const isBank=p.includes('/partner-banks/');const key=isBank?'partner_banks':'demat_partners';const id=Number(parts.pop());
      const list=db[key]||[];const idx=list.findIndex(r=>Number(r.id)===id);if(idx<0)return json(res,404,{error:'Record नहीं मिला'});
      const removed=list[idx];list.splice(idx,1);db[key]=list;
      db.audit.unshift({id:newId(),action:isBank?'PARTNER_BANK_DELETED':'DEMAT_PARTNER_DELETED',record_id:id,name:removed.name,by:a.user||'admin',at:now()});save();
      return json(res,200,{ok:true});
    }
    if(p==='/api/recharge/operator-detect'&&req.method==='GET'){
      const mobile=String(u.searchParams.get('mobile')||'').replace(/\D/g,'');
      if(!/^\d{10}$/.test(mobile))return json(res,400,{detected:false,error:'Valid 10 digit mobile number जरूरी है'});
      return json(res,200,{detected:false,source:'manual-selection',admin_managed:true,message:'Mobile number से operator auto-detect नहीं किया जाता। कृपया ऊपर सही operator manually चुनें।'});
    }
    if(p==='/api/recharge/plans'&&req.method==='GET'){
      const operator=String(u.searchParams.get('operator')||'JIO').toUpperCase(),type=String(u.searchParams.get('type')||'PREPAID').toUpperCase(),circle=String(u.searchParams.get('circle')||'UP').toUpperCase();
      const plans=(db.recharge_plans||[]).filter(x=>x.active!==false&&String(x.operator||'').toUpperCase()===operator&&String(x.type||'PREPAID').toUpperCase()===type&&(!x.circle||String(x.circle).toUpperCase()===circle)).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
      return json(res,200,{live:false,plans,source:'admin-catalog',admin_managed:true,message:plans.length?'Admin-managed plans loaded.':'इस operator/type/circle के लिए Admin ने अभी कोई plan नहीं जोड़ा है।'});
    }
    if(p==='/api/admin/recharge/plans'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const operator=String(u.searchParams.get('operator')||'').toUpperCase(),type=String(u.searchParams.get('type')||'').toUpperCase();
      const rows=(db.recharge_plans||[]).filter(x=>(!operator||String(x.operator).toUpperCase()===operator)&&(!type||String(x.type).toUpperCase()===type)).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
      return json(res,200,{plans:rows});
    }
    if(p==='/api/admin/recharge/plans'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),id=String(x.id||'').trim().replace(/[^A-Za-z0-9._-]/g,'').slice(0,60),operator=String(x.operator||'').toUpperCase(),type=String(x.type||'PREPAID').toUpperCase(),circle=String(x.circle||'UP').toUpperCase();
      const amount=Number(x.amount),validity=String(x.validity||'').trim().slice(0,60),data=String(x.data||'').trim().slice(0,100),calls=String(x.calls||'Unlimited Calls').trim().slice(0,100),sms=String(x.sms||'100 SMS/Day').trim().slice(0,100),category=['popular','data','unlimited','top'].includes(String(x.category||''))?String(x.category):'popular';
      if(!id||!['JIO','AIRTEL','VI','BSNL'].includes(operator)||!['PREPAID','POSTPAID'].includes(type)||!(amount>0)||!validity||!data)return json(res,400,{error:'Operator, type, plan ID, amount, validity और data जरूरी हैं'});
      const duplicate=(db.recharge_plans||[]).find(z=>z.id===id&&z.operator===operator&&z.type===type&&z.circle===circle);
      const t=now();
      if(duplicate){Object.assign(duplicate,{amount,validity,data,calls,sms,category,active:x.active!==false,updated_at:t,updated_by:a.user||'Admin',sort_order:Number(x.sort_order||duplicate.sort_order||0)});}
      else db.recharge_plans.unshift({id,operator,type,circle,amount,validity,data,calls,sms,category,active:x.active!==false,created_at:t,updated_at:t,updated_by:a.user||'Admin',sort_order:Number(x.sort_order||0)});
      db.audit.unshift({id:newId(),action:duplicate?'ADMIN_RECHARGE_PLAN_UPDATED':'ADMIN_RECHARGE_PLAN_CREATED',plan_id:id,operator,type,circle,by:a.user||'Admin',at:t});save();
      return json(res,200,{ok:true,plan:(db.recharge_plans||[]).find(z=>z.id===id&&z.operator===operator&&z.type===type&&z.circle===circle)});
    }
    if(p==='/api/admin/uppcl/reconciliation'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const issues=[];const payments=(db.payments||[]).filter(x=>x.service==='UPPCL Bill Payment');const apps=(db.applications||[]).filter(x=>x.service==='UPPCL Bill Payment');const bills=db.uppcl_manual_bills||[];
      const add=(type,payment,application,message)=>{
        const candidateApplications=payment ? apps.filter(candidate=>{
          if(Number(candidate.id)===Number(application?.id||0)) return false;
          if(String(candidate.mobile||'')!==String(payment.mobile||'')) return false;
          if(String(candidate.uppcl_account||'')!==String(payment.uppcl_account||'')) return false;
          if(Number(candidate.uppcl_bill_id||0)!==Number(payment.uppcl_bill_id||0)) return false;
          if(Number(candidate.uppcl_bill_version||0)!==Number(payment.uppcl_bill_version||0)) return false;
          if(payments.some(other=>Number(other.id)!==Number(payment.id)&&Number(other.application_id)===Number(candidate.id))) return false;
          return true;
        }).slice(0,10).map(candidate=>({id:Number(candidate.id),application_id:candidate.application_id||'',status:candidate.status||''})) : [];
        issues.push({type,severity:type==='MISSING_APPLICATION'||type==='MISSING_PAYMENT'?'high':'medium',payment_id:payment?.id||null,application_id:application?.id||null,account:payment?.uppcl_account||application?.uppcl_account||'',message,candidate_applications:candidateApplications,repairable:!!(payment&&candidateApplications.length&&['MISSING_APPLICATION','APPLICATION_LINK_MISMATCH'].includes(type)&&['Pending Verification','Verified'].includes(String(payment.status||''))&&String(payment.uppcl_processing_status||'Awaiting Payment Verification')==='Awaiting Payment Verification')});
      };
      for(const pay of payments){
        const app=pay.application_id?apps.find(x=>Number(x.id)===Number(pay.application_id)):null;
        if(!app){add('MISSING_APPLICATION',pay,null,'UPPCL payment का linked application नहीं मिला।');continue;}
        if(Number(app.id)!==Number(pay.application_id))add('APPLICATION_LINK_MISMATCH',pay,app,'Payment और application link mismatch है।');
        if(Number(pay.uppcl_bill_id||0)!==Number(app.uppcl_bill_id||0)||Number(pay.uppcl_bill_version||0)!==Number(app.uppcl_bill_version||0))add('BILL_SNAPSHOT_MISMATCH',pay,app,'Payment और application में bill ID/version अलग हैं।');
        const bill=bills.find(x=>Number(x.id)===Number(pay.uppcl_bill_id));
        if(!bill)add('MISSING_BILL',pay,app,'Referenced UPPCL bill record नहीं मिला।');
        if(pay.status==='Verified'&&pay.uppcl_processing_status==='Completed'&&String(app.status||'')!=='Completed')add('COMPLETED_APPLICATION_MISMATCH',pay,app,'Payment Completed है लेकिन application Completed नहीं है।');
        if(pay.status==='Rejected'&&pay.uppcl_processing_status==='Completed')add('REJECTED_PAYMENT_COMPLETED',pay,app,'Rejected payment को Completed processing state मिला हुआ है।');
      }
      for(const app of apps){
        const linked=payments.find(x=>Number(x.application_id)===Number(app.id));
        if(!linked)add('MISSING_PAYMENT',null,app,'UPPCL application का linked payment नहीं मिला।');
      }
      const counts=issues.reduce((m,x)=>(m[x.type]=(m[x.type]||0)+1,m),{});
      return json(res,200,{ok:true,checked:{payments:payments.length,applications:apps.length,bills:bills.length},issue_count:issues.length,counts,issues:issues.slice(0,200),status:issues.length?'attention_required':'healthy',generated_at:now()});
    }
    if(p==='/api/admin/uppcl/reconciliation/recover'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),action=String(x.action||'').trim(),paymentId=Number(x.payment_id)||0,targetApplicationId=Number(x.target_application_id)||0;
      if(!['repair_payment_application','mark_reviewed'].includes(action))return json(res,400,{error:'Invalid reconciliation recovery action'});
      const payments=(db.payments||[]).filter(z=>z.service==='UPPCL Bill Payment');
      const apps=(db.applications||[]).filter(z=>z.service==='UPPCL Bill Payment');
      const pay=paymentId?payments.find(z=>Number(z.id)===paymentId):null;
      if(action==='repair_payment_application'){
        if(!pay)return json(res,404,{error:'UPPCL payment नहीं मिला'});
        if(!['Pending Verification','Verified'].includes(String(pay.status||'')))return json(res,409,{error:'Completed/Rejected payment का application link recovery से बदलना allowed नहीं है।'});
        if(String(pay.uppcl_processing_status||'Awaiting Payment Verification')!=='Awaiting Payment Verification')return json(res,409,{error:'Processed UPPCL payment का application link recovery से बदलना allowed नहीं है।'});
        const target=apps.find(z=>Number(z.id)===targetApplicationId);
        if(!target)return json(res,404,{error:'Target UPPCL application नहीं मिला'});
        if(String(target.mobile||'')!==String(pay.mobile||'')||String(target.uppcl_account||'')!==String(pay.uppcl_account||'')||Number(target.uppcl_bill_id||0)!==Number(pay.uppcl_bill_id||0)||Number(target.uppcl_bill_version||0)!==Number(pay.uppcl_bill_version||0))return json(res,409,{error:'Target application customer/account/bill snapshot से match नहीं करता।'});
        const occupied=payments.find(z=>Number(z.id)!==Number(pay.id)&&Number(z.application_id)===Number(target.id));
        if(occupied)return json(res,409,{error:'Target application पहले से दूसरे payment से linked है।'});
        const previous=pay.application_id||null;pay.application_id=target.id;pay.reconciliation_repaired_at=now();pay.reconciliation_repaired_by=a.user||'Admin';
        db.audit.unshift({id:newId(),action:'UPPCL_RECONCILIATION_LINK_REPAIRED',payment_id:pay.id,previous_application_id:previous,target_application_id:target.id,by:a.user||'Admin',at:pay.reconciliation_repaired_at,reason:String(x.reason||'Admin-controlled reconciliation repair').trim().slice(0,300)});
        save();return json(res,200,{ok:true,action,payment_id:pay.id,application_id:target.id,message:'Payment ↔ Application link repaired. Reconciliation फिर से चलाएँ।'});
      }
      const issueType=String(x.issue_type||'').trim().slice(0,80),applicationId=Number(x.application_id)||null;
      db.audit.unshift({id:newId(),action:'UPPCL_RECONCILIATION_ISSUE_REVIEWED',payment_id:paymentId||null,application_id:applicationId,issue_type:issueType,by:a.user||'Admin',at:now(),reason:String(x.reason||'Admin reviewed; no automatic repair').trim().slice(0,300)});
      save();return json(res,200,{ok:true,action,message:'Issue review audit log में दर्ज हो गया। कोई data record automatically नहीं बदला गया।'});
    }
    if(p==='/api/admin/uppcl/manual-payments'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const rows=db.payments.filter(x=>x.service==='UPPCL Bill Payment').slice(0,100).map(x=>{const billAmount=Number(x.uppcl_bill_total||0);const verifiedPaid=db.payments.filter(q=>q.service==='UPPCL Bill Payment'&&Number(q.uppcl_bill_id||0)===Number(x.uppcl_bill_id||0)&&q.status==='Verified').reduce((a,q)=>a+Number(q.amount||0),0);const completedPaid=db.payments.filter(q=>q.service==='UPPCL Bill Payment'&&Number(q.uppcl_bill_id||0)===Number(x.uppcl_bill_id||0)&&q.uppcl_processing_status==='Completed').reduce((a,q)=>a+Number(q.amount||0),0);return {...customerPayment(x),uppcl_account:x.uppcl_account||'',uppcl_district:x.uppcl_district||'',uppcl_discom:x.uppcl_discom||'',uppcl_bill_month:x.uppcl_bill_month||'',uppcl_due_date:x.uppcl_due_date||'',uppcl_consumer_name:x.uppcl_consumer_name||'',uppcl_bill_total:billAmount,uppcl_verified_paid:verifiedPaid,uppcl_completed_paid:completedPaid,uppcl_remaining:Math.max(0,billAmount-verifiedPaid),uppcl_advance:Math.max(0,verifiedPaid-billAmount),uppcl_processing_status:x.uppcl_processing_status||'Awaiting Payment Verification',uppcl_provider_ref:x.uppcl_provider_ref||''};});
      return json(res,200,{payments:rows});
    }
    if(p==='/api/admin/uppcl/process'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),id=Number(x.id),status=String(x.status||'').trim(),ref=String(x.provider_ref||'').trim().slice(0,120),note=String(x.note||'').trim().slice(0,300);if(!['Completed','Failed'].includes(status))return json(res,400,{error:'Status Completed या Failed होना चाहिए'});const pay=db.payments.find(z=>Number(z.id)===id&&z.service==='UPPCL Bill Payment');if(!pay)return json(res,404,{error:'UPPCL payment नहीं मिला'});if(pay.status!=='Verified')return json(res,409,{error:'पहले Customer payment को Admin Verify करें'});const processingState=String(pay.uppcl_processing_status||'Awaiting Payment Verification');if(!UPPCL_PROCESS_LIFECYCLE[processingState])return json(res,409,{error:'UPPCL processing lifecycle state invalid है'});if(!lifecycleCanMove(UPPCL_PROCESS_LIFECYCLE,processingState,status))return json(res,409,{error:`UPPCL processing transition ${processingState} → ${status} allowed नहीं है।`});const billTotal=Number(pay.uppcl_bill_total||0);const verifiedTotal=db.payments.filter(q=>q.service==='UPPCL Bill Payment'&&Number(q.uppcl_bill_id||0)===Number(pay.uppcl_bill_id||0)&&q.status==='Verified').reduce((a,q)=>a+Number(q.amount||0),0);if(status==='Completed'&&billTotal>0&&verifiedTotal+0.009<billTotal)return json(res,409,{error:`Bill अभी पूरा paid नहीं है। Verified total ₹${verifiedTotal.toFixed(2)} / ₹${billTotal.toFixed(2)} है। Remaining ₹${Math.max(0,billTotal-verifiedTotal).toFixed(2)} है। पहले remaining payment verify करें।`});pay.uppcl_processing_status=status;pay.uppcl_provider_ref=ref;pay.uppcl_processed_by=a.user||db.settings.operator||'Admin';pay.uppcl_processed_at=now();pay.uppcl_process_note=note;const app=applicationFor(pay.application_id);if(status==='Completed'){pay.completed_at=pay.uppcl_processed_at;pay.receipt_no=pay.receipt_no||'RCP-UPPCL-'+String(pay.id).slice(-8);pay.receipt_generated_at=pay.receipt_generated_at||pay.completed_at;pay.completed_by=pay.completed_by||pay.uppcl_processed_by;if(app)app.status='Completed';notifyCustomer(pay.mobile,'completion','success','UPPCL Bill Payment Completed',`आपका UPPCL bill payment ${pay.receipt_no} के साथ complete हो गया है।`,{payment_id:pay.id,application_id:pay.application_id,receipt_no:pay.receipt_no,event_key:'uppcl-completed:'+pay.id});notifyCustomer(pay.mobile,'receipt','success','Receipt Generated',`आपकी UPPCL receipt ${pay.receipt_no} generate हो गई है।`,{payment_id:pay.id,application_id:pay.application_id,receipt_no:pay.receipt_no,event_key:'uppcl-receipt:'+pay.id});db.audit.unshift({id:newId(),action:'RECEIPT_AUTO_GENERATED',payment_id:pay.id,receipt_no:pay.receipt_no,by:pay.completed_by,at:pay.receipt_generated_at});}else{if(app)app.status='UPPCL Payment Failed';notifyCustomer(pay.mobile,'payment','error','UPPCL Bill Payment Failed','UPPCL bill payment process नहीं हो पाया।'+(note?' कारण: '+note:''),{payment_id:pay.id,application_id:pay.application_id,event_key:'uppcl-failed:'+pay.id});}db.audit.unshift({id:newId(),action:'ADMIN_UPPCL_MANUAL_PROCESS',payment_id:id,status,provider_ref:ref,by:pay.uppcl_processed_by,at:pay.uppcl_processed_at});save();return json(res,200,{ok:true,payment:customerPayment(pay),processing_status:status});
    }
    if(p==='/api/admin/uppcl/official-receipt'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),id=Number(x.payment_id)||0,pay=db.payments.find(z=>Number(z.id)===id&&z.service==='UPPCL Bill Payment');
      if(!pay)return json(res,404,{error:'UPPCL payment नहीं मिला'});
      if(pay.status!=='Verified'||pay.uppcl_processing_status!=='Completed')return json(res,409,{error:'Official receipt केवल Verified + Completed UPPCL payment पर upload की जा सकती है'});
      if(!x.receipt_data)return json(res,400,{error:'Official receipt file जरूरी है'});
      let receipt;try{receipt=safeOfficialReceipt(x.receipt_data)}catch(e){return json(res,400,{error:e.message})}
      if(pay.official_receipt){try{const oldFile=path.basename(String(pay.official_receipt));if(OFFICIAL_RECEIPT_FILE_RE.test(oldFile))fs.rmSync(path.join(UPLOAD_DIR,oldFile),{force:true})}catch{} }
      pay.official_receipt=receipt.url;pay.official_receipt_name=String(x.filename||receipt.filename).slice(0,160);pay.official_receipt_mime=receipt.mime;pay.official_receipt_sha256=receipt.sha256;pay.official_receipt_uploaded_at=now();pay.official_receipt_uploaded_by=a.user||db.settings.operator||'Admin';
      db.audit.unshift({id:newId(),action:'UPPCL_OFFICIAL_RECEIPT_UPLOADED',payment_id:pay.id,file:pay.official_receipt_name,by:pay.official_receipt_uploaded_by,at:pay.official_receipt_uploaded_at});
      save();return json(res,200,{ok:true,payment:customerPayment(pay),message:'Official UPPCL receipt upload हो गई।'});
    }
    if(p.startsWith('/api/admin/uppcl/official-receipt/')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const ref=path.basename(decodeURIComponent(p.split('/').pop()||''));
      const pay=db.payments.find(x=>x.service==='UPPCL Bill Payment'&&path.basename(String(x.official_receipt||''))===ref);
      if(!pay||!pay.official_receipt||!OFFICIAL_RECEIPT_FILE_RE.test(ref))return json(res,404,{error:'Official receipt not found'});
      const fp=path.join(UPLOAD_DIR,ref);if(!fs.existsSync(fp))return json(res,404,{error:'Official receipt file not found'});
      const ext=path.extname(fp).toLowerCase(),ct=ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);
      res.writeHead(200,{'Content-Type':ct,'Content-Disposition':'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p.startsWith('/api/customer/uppcl/official-receipt/')&&req.method==='GET'){
      const c=customer(req);if(!c)return json(res,401,{error:'Customer login required'});
      const ref=path.basename(decodeURIComponent(p.split('/').pop()||''));
      const pay=db.payments.find(x=>x.service==='UPPCL Bill Payment'&&String(x.mobile)===String(c.mobile)&&path.basename(String(x.official_receipt||''))===ref);
      if(!pay||!pay.official_receipt||!OFFICIAL_RECEIPT_FILE_RE.test(ref))return json(res,404,{error:'Official receipt not found'});
      const fp=path.join(UPLOAD_DIR,ref);if(!fs.existsSync(fp))return json(res,404,{error:'Official receipt file not found'});
      const ext=path.extname(fp).toLowerCase(),ct=ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);
      res.writeHead(200,{'Content-Type':ct,'Content-Disposition':'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p==='/api/admin/uppcl/manual-bill-history'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const rows=(db.uppcl_manual_bills||[]).slice().sort((x,y)=>new Date(y.updated_at||0)-new Date(x.updated_at||0)).slice(0,100);
      return json(res,200,{bills:rows});
    }
    if(p==='/api/customer/uppcl/bill-request'&&req.method==='POST'){
      const c=customer(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),account=String(x.account||'').replace(/\D/g,'').slice(0,30),district=String(x.district||'').trim().slice(0,40),discom=String(x.discom||'').trim().slice(0,40);
      if(!/^\d{6,30}$/.test(account))return json(res,400,{error:'Valid numeric Account Number (6–30 digits) दर्ज करें।'});
      const mobile=String(c.mobile||'').replace(/\D/g,'');
      const t=now();
      let r=(db.uppcl_bill_requests||[]).find(z=>String(z.mobile||'')===mobile&&String(z.account||'')===account&&String(z.status||'Pending')==='Pending');
      if(r){r.requested_at=t;r.request_count=Number(r.request_count||1)+1;r.district=district;r.discom=discom;r.customer_name=c.name||r.customer_name||'';}
      else{r={id:newId(),customer_id:c.customer_id||'',customer_name:c.name||'',mobile,account,district,discom,status:'Pending',requested_at:t,request_count:1,created_at:t};(db.uppcl_bill_requests||[]).unshift(r)}
      save();
      return json(res,200,{ok:true,request:{id:r.id,status:r.status,customer_name:r.customer_name,mobile:r.mobile,account:r.account,district:r.district,discom:r.discom,requested_at:r.requested_at},message:'Bill request Admin को भेज दी गई है। Admin अब customer details देखकर bill update कर सकता है।'});
    }
    if(p==='/api/admin/uppcl/bill-requests'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const rows=(db.uppcl_bill_requests||[]).slice().sort((x,y)=>new Date(y.requested_at||y.created_at||0)-new Date(x.requested_at||x.created_at||0)).slice(0,100);
      return json(res,200,{requests:rows});
    }
    if(p==='/api/customer/uppcl/manual-bill'&&req.method==='GET'){
      const c=customer(req);if(!c)return json(res,401,{error:'Customer login required'});
      const mode=String(u.searchParams.get('mode')||'account').trim()==='mobile'?'mobile':'account';
      const value=String(u.searchParams.get('value')||u.searchParams.get('account')||'').trim();
      const requestedDistrict=String(u.searchParams.get('district')||'').trim();
      const requestedDiscom=String(u.searchParams.get('discom')||'').trim();
      if(!value)return json(res,400,{error:mode==='mobile'?'Registered Mobile जरूरी है':'Account number जरूरी है'});
      if(mode==='account'&&!/^\d{6,30}$/.test(value))return json(res,400,{error:'Valid numeric Account Number (6–30 digits) दर्ज करें।'});
      if(mode==='mobile'&&!/^\d{10}$/.test(value))return json(res,400,{error:'Valid 10 digit Registered Mobile दर्ज करें।'});
      const bill=(db.uppcl_manual_bills||[]).filter(z=>String(z.status||'Updated')==='Updated' && (mode==='account'?String(z.account||'').trim()===value:String(z.registered_mobile||'').replace(/\D/g,'')===value)).sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0))[0];
      if(!bill){
        if(mode==='account'){
          const mobile=String(c.mobile||'').replace(/\D/g,'');
          const t=now();let r=(db.uppcl_bill_requests||[]).find(z=>String(z.mobile||'')===mobile&&String(z.account||'')===value&&String(z.status||'Pending')==='Pending');
          if(r){r.requested_at=t;r.request_count=Number(r.request_count||1)+1;r.district=requestedDistrict;r.discom=requestedDiscom;}
          else{r={id:newId(),customer_id:c.customer_id||'',customer_name:c.name||'',mobile,account:value,district:requestedDistrict,discom:requestedDiscom,status:'Pending',requested_at:t,request_count:1,created_at:t};(db.uppcl_bill_requests||[]).unshift(r)}
          save();
        }
        return json(res,404,{error:mode==='mobile'?'इस Registered Mobile का Admin-approved bill उपलब्ध नहीं है।':'Bill अभी उपलब्ध नहीं है। Customer की details Admin को भेज दी गई हैं; Admin अब bill update कर सकता है।',bill_request_created:true,customer_name:c.name||'',customer_mobile:c.mobile||'',account:mode==='account'?value:'',district:requestedDistrict,discom:requestedDiscom});
      }
      const customerMobile=String(c.mobile||'').replace(/\D/g,'');
      const billMobile=String(bill.registered_mobile||'').replace(/\D/g,'');
      if(!billMobile)return json(res,409,{error:'इस Admin-approved bill में customer Registered Mobile mapping उपलब्ध नहीं है। Admin से bill में Registered Mobile map करवाएँ।'});
      if(billMobile!==customerMobile)return json(res,403,{error:'यह bill आपके customer account से linked नहीं है। सही registered mobile वाला bill देखें।'});
      if(requestedDistrict && String(bill.district||'').trim() && String(bill.district||'').trim()!==requestedDistrict)return json(res,409,{error:'चयनित जिला और Admin-approved bill का जिला match नहीं करता। सही जिला चुनें।'});
      if(requestedDiscom && String(bill.discom||'').trim() && String(bill.discom||'').trim()!==requestedDiscom)return json(res,409,{error:'चयनित DISCOM और Admin-approved bill का DISCOM match नहीं करता। सही DISCOM चुनें।'});
      const billPayments=db.payments.filter(q=>q.service==='UPPCL Bill Payment'&&Number(q.uppcl_bill_id||0)===Number(bill.id));const currentVersionPayments=billPayments.filter(q=>Number(q.uppcl_bill_version||0)===Number(bill.version||1));const verifiedPaid=billPayments.filter(q=>q.status==='Verified').reduce((a,q)=>a+Number(q.amount||0),0);const pendingPaid=currentVersionPayments.filter(q=>q.status==='Pending Verification').reduce((a,q)=>a+Number(q.amount||0),0);const totalPayable=Number(bill.total_amount||0);return json(res,200,{bill:{id:Number(bill.id),version:Number(bill.version||1),consumer_name:bill.consumer_name||'',account:bill.account||'',registered_mobile:bill.registered_mobile||'',bill_month:bill.bill_month||'',due_date:bill.due_date||'',current_bill:Number(bill.bill_amount||0),arrear:Number(bill.arrear||0),late_fee:Number(bill.late_fee||0),total_payable:totalPayable,bill_number:bill.bill_number||'',district:bill.district||'',discom:bill.discom||'',updated_at:bill.updated_at||'',verified_paid:verifiedPaid,pending_paid:pendingPaid,remaining:Math.max(0,totalPayable-verifiedPaid),advance:Math.max(0,verifiedPaid-totalPayable),payment_count:billPayments.length}});
    }
    if(p==='/api/admin/uppcl/manual-bill'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),id=Number(x.id)||0,account=String(x.account||'').trim().slice(0,30),registeredMobile=String(x.registered_mobile||'').replace(/\D/g,'').slice(0,10),consumer=String(x.consumer_name||'').trim().slice(0,160),billNumber=String(x.bill_number||'').trim().slice(0,80),month=String(x.bill_month||'').trim().slice(0,40),district=String(x.district||'').trim().slice(0,40),discom=String(x.discom||'').trim().slice(0,40),due=String(x.due_date||'').trim();
      const billAmount=Number(x.bill_amount),arrear=Number(x.arrear||0),lateFee=Number(x.late_fee||0),requestedTotal=Number(x.total_amount||0),totalAmount=billAmount+arrear+lateFee;
      if(!account)return json(res,400,{error:'Account number जरूरी है'});
      if(!/^[0-9]{6,30}$/.test(account))return json(res,400,{error:'Valid numeric Account Number (6–30 digits) दर्ज करें।'});if(!/^\d{10}$/.test(registeredMobile))return json(res,400,{error:'Registered Mobile 10 digits का होना चाहिए। Customer bill mapping के लिए Registered Mobile जरूरी है।'});
      if(!Number.isFinite(billAmount)||billAmount<=0)return json(res,400,{error:'Valid bill amount जरूरी है'});
      if(!Number.isFinite(arrear)||arrear<0)return json(res,400,{error:'Arrear invalid है'});
      if(!Number.isFinite(lateFee)||lateFee<0)return json(res,400,{error:'Late fee invalid है'});
      if(Number.isFinite(requestedTotal)&&requestedTotal>0&&Math.abs(requestedTotal-totalAmount)>0.01)return json(res,400,{error:'Total Payable = Current Bill + Arrear + Late Fee होना चाहिए।'});
      let bill=(db.uppcl_manual_bills||[]).find(z=>Number(z.id)===id);
      const t=now();
      if(!bill){
        const sameAccount=(db.uppcl_manual_bills||[]).filter(z=>String(z.status||'Updated')==='Updated' && String(z.account||'').trim()===account);
        const sameMonth=sameAccount.find(z=>String(z.bill_month||'').trim()===month);
        const blankMonth=!month && sameAccount.find(z=>!String(z.bill_month||'').trim());
        bill=sameMonth||blankMonth||null;
      }
      if(!bill){bill={id:newId(),version:1,created_at:t};db.uppcl_manual_bills.unshift(bill)}
      else bill.version=Math.max(1,Number(bill.version||1)+1);
      Object.assign(bill,{consumer_name:consumer,bill_number:billNumber,account,registered_mobile:registeredMobile,bill_amount:billAmount,arrear,late_fee:lateFee,total_amount:totalAmount,bill_month:month,due_date:due,district,discom,updated_by:a.user||db.settings.operator||'Admin',updated_at:t,status:'Updated'});
      (db.uppcl_bill_requests||[]).forEach(r=>{if(String(r.account||'')===account&&String(r.mobile||'')===registeredMobile&&String(r.status||'Pending')==='Pending'){r.status='Bill Updated';r.bill_id=bill.id;r.bill_version=bill.version;r.updated_at=t;r.updated_by=bill.updated_by;}});
      db.audit.unshift({id:newId(),action:'ADMIN_UPPCL_MANUAL_BILL_UPDATE',uppcl_bill_id:bill.id,account:'******'+account.slice(-4),amount:totalAmount,by:bill.updated_by,at:t});
      save();
      return json(res,200,{ok:true,bill,message:'Manual UPPCL bill details save हो गए।'});
    }
    if(p==='/api/admin/uppcl/status'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      return json(res,200,{manual_only:true,admin_managed:true,message:'UPPCL workflow Admin-managed और Manual Only है।'});
    }
    if(p==='/api/admin/uppcl/bill-check'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      return json(res,410,{error:'UPPCL external bill API disabled. Admin पहले Manual Bill Entry में bill save करें।'});
    }
    if(p==='/api/recharge/manual'&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'recharge_process'))return json(res,403,{error:'इस staff role को manual recharge की अनुमति नहीं है'});
      const rows=db.recharge_transactions.slice().sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,100).map(x=>{const pay=x.payment_id?db.payments.find(z=>Number(z.id)===Number(x.payment_id)):null;const rootId=Number(x.retry_group_id||x.id);const chain=db.recharge_transactions.filter(z=>Number(z.retry_group_id||z.id)===rootId).sort((a,b)=>Number(a.attempt_no||1)-Number(b.attempt_no||1));return {...x,actor_name:x.actor_name||x.actor_id||'—',payment_status:pay?.status||null,receipt_no:pay?.receipt_no||null,payment_utr:pay?.utr||'',attempt_chain:chain.map(z=>({id:z.id,status:z.status,attempt_no:Number(z.attempt_no||1),retry_of_recharge_id:z.retry_of_recharge_id||null,created_at:z.created_at,updated_at:z.updated_at,failed_at:z.failed_at||null,completed_at:z.completed_at||null,failure_reason:z.failure_reason||'',payment_id:z.payment_id||null,receipt_no:(z.payment_id?db.payments.find(q=>Number(q.id)===Number(z.payment_id))?.receipt_no:null)||null,payment_status:(z.payment_id?db.payments.find(q=>Number(q.id)===Number(z.payment_id))?.status:null)||null,utr:(z.payment_id?db.payments.find(q=>Number(q.id)===Number(z.payment_id))?.utr:null)||''}))};});
      return json(res,200,{transactions:rows});
    }
    if(p==='/api/recharge/manual'&&req.method==='POST'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'recharge_process'))return json(res,403,{error:'इस staff role को manual recharge की अनुमति नहीं है'});
      const x=await body(req),mobile=String(x.mobile||'').replace(/\D/g,'');
      if(!validMobile(mobile)||!x.operator)return json(res,400,{error:'Valid mobile और operator जरूरी है'});
      const amount=Number(x.amount||0);if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Valid recharge amount जरूरी है'});
      const status=['Pending','Success','Failed'].includes(String(x.status||''))?String(x.status):'Pending';
      const actor=aa?{type:'admin',id:'admin',name:'Admin'}:{type:'staff',id:sa.staff_id,name:sa.record.name};
      const row={id:newId(),mobile,operator:String(x.operator),type:String(x.type||'PREPAID'),circle:String(x.circle||'UP'),amount:money(amount),plan_id:String(x.plan_id||''),plan_name:String(x.plan_name||''),provider_ref:String(x.provider_ref||''),status,source:'manual',actor_type:actor.type,actor_id:actor.id,actor_name:actor.name,notes:String(x.notes||''),created_at:now(),updated_at:now()};
      db.recharge_transactions.unshift(row);db.audit.unshift({id:newId(),action:'MANUAL_RECHARGE_CREATED',recharge_id:row.id,status:row.status,amount:row.amount,mobile:'******'+mobile.slice(-4),operator:row.operator,actor:actor.name,at:row.created_at});save();
      return json(res,201,{ok:true,transaction:row,message:status==='Success'?'Recharge marked successful.':status==='Failed'?'Recharge marked failed.':'Manual recharge saved as pending.'});
    }
    if(p.startsWith('/api/recharge/manual/')&&req.method==='POST'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'recharge_process'))return json(res,403,{error:'इस staff role को manual recharge update करने की अनुमति नहीं है'});
      const id=decodeURIComponent(p.split('/')[4]||'');const row=db.recharge_transactions.find(x=>String(x.id)===String(id));if(!row)return json(res,404,{error:'Recharge transaction नहीं मिला'});
      const x=await body(req),status=String(x.status||'');if(!RECHARGE_LIFECYCLE[row.status])return json(res,409,{error:'Recharge lifecycle state invalid है'});if(!lifecycleCanMove(RECHARGE_LIFECYCLE,row.status,status))return json(res,409,{error:`Recharge transition ${row.status} → ${status} allowed नहीं है।`});if(status==='Success'&&row.payment_id){const linkedPayment=db.payments.find(z=>Number(z.id)===Number(row.payment_id));if(!linkedPayment||linkedPayment.status!=='Verified')return json(res,409,{error:'पहले linked payment को Admin Verify करें, उसके बाद recharge Success करें'});}
      const transitionAt=now(),transitionReason=String(x.reason??x.note??'').trim().slice(0,500);row.status=status;row.provider_ref=String(x.provider_ref ?? (row.provider_ref||''));row.notes=String(x.notes ?? (row.notes||''));row.updated_at=transitionAt;row.state_revision=Number(row.state_revision||0)+1;row.status_history=Array.isArray(row.status_history)?row.status_history:[];if(!row.status_history.some(h=>h.status===status&&String(h.at)===String(transitionAt)))row.status_history.push({status,at:transitionAt,reason:transitionReason});if(status==='Success')row.completed_at=row.completed_at||transitionAt;if(status==='Failed'){row.failed_at=row.failed_at||transitionAt;row.failure_reason=transitionReason||row.failure_reason||'Recharge process failed';}
      if(status==='Success'&&row.payment_id){const linkedPayment=db.payments.find(z=>Number(z.id)===Number(row.payment_id));if(linkedPayment&&linkedPayment.status==='Verified'){linkedPayment.completed_at=linkedPayment.completed_at||row.updated_at;linkedPayment.receipt_no=linkedPayment.receipt_no||'RCP-RCH-'+String(linkedPayment.id).slice(-8);linkedPayment.receipt_generated_at=linkedPayment.receipt_generated_at||linkedPayment.completed_at;linkedPayment.completed_by=linkedPayment.completed_by||((aa&&aa.user)||sa?.record?.name||db.settings.operator||'Admin');const rechargeApp=applicationFor(linkedPayment.application_id||row.application_id);if(rechargeApp)rechargeApp.status='Completed';if(!linkedPayment.receipt_generated_at_notified){linkedPayment.receipt_generated_at_notified=linkedPayment.receipt_generated_at;db.audit.unshift({id:newId(),action:'RECEIPT_AUTO_GENERATED',payment_id:linkedPayment.id,recharge_id:row.id,receipt_no:linkedPayment.receipt_no,by:linkedPayment.completed_by,at:linkedPayment.receipt_generated_at});notifyCustomer(linkedPayment.mobile,'receipt','success','Recharge Receipt Generated',`आपकी recharge receipt ${linkedPayment.receipt_no} generate हो गई है।`,{payment_id:linkedPayment.id,application_id:linkedPayment.application_id,receipt_no:linkedPayment.receipt_no,event_key:'recharge-receipt:'+linkedPayment.id});notifyCustomer(linkedPayment.mobile,'completion','success','Recharge Completed',`आपका ${row.operator} recharge ₹${Number(row.amount||0).toFixed(2)} में complete हो गया है।`,{payment_id:linkedPayment.id,application_id:linkedPayment.application_id,receipt_no:linkedPayment.receipt_no,event_key:'recharge-completed:'+linkedPayment.id});}}}
      if(status==='Failed'&&row.payment_id){const linkedPayment=db.payments.find(z=>Number(z.id)===Number(row.payment_id));if(linkedPayment&&!linkedPayment.recharge_failed_notified){linkedPayment.recharge_failed_notified=row.updated_at;notifyCustomer(linkedPayment.mobile,'recharge','error','Recharge Failed',`आपका ${row.operator} recharge ₹${Number(row.amount||0).toFixed(2)} सफल नहीं हुआ।${row.failure_reason?' कारण: '+row.failure_reason:''}`,{payment_id:linkedPayment.id,application_id:linkedPayment.application_id,event_key:'recharge-failed:'+row.id});}}
      db.audit.unshift({id:newId(),action:'MANUAL_RECHARGE_STATUS_UPDATED',recharge_id:row.id,status,actor:aa?'Admin':sa.record.name,at:row.updated_at});save();return json(res,200,{ok:true,transaction:row,payment:row.payment_id?customerPayment(db.payments.find(z=>Number(z.id)===Number(row.payment_id))):null});
    }
    if(p==='/api/customer/recharge/payment'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),name=String(c.name||'').trim(),accountMobile=String(c.mobile||'').trim(),mobile=String(x.mobile||'').replace(/\D/g,''),operator=String(x.operator||'').trim().toUpperCase(),type=String(x.type||'PREPAID').toUpperCase(),circle=String(x.circle||'UP').trim(),utr=String(x.utr||'').trim(),amount=Number(x.amount),plan=x.plan||{};
      const idemKey=paymentIdempotencyKey(req,x);
      if(!idemKey)return json(res,400,{error:'Payment retry safety के लिए idempotency key जरूरी है'});
      const idemFingerprint=paymentFingerprint([c.customer_id||'',accountMobile,mobile,operator,type,circle,amount,utr,plan.id,plan.name||plan.title||'']);
      const existingIdem=findPaymentIdempotency('recharge-payment',idemKey,idemFingerprint);
      if(existingIdem?.conflict)return json(res,409,{error:'Same idempotency key different recharge payload के साथ reuse नहीं हो सकता।'});
      if(existingIdem?.payment_id){const existingPayment=db.payments.find(z=>Number(z.id)===Number(existingIdem.payment_id));const existingRecharge=db.recharge_transactions.find(z=>Number(z.id)===Number(existingIdem.recharge_id));if(existingPayment&&existingRecharge)return json(res,200,{ok:true,payment:customerPayment(existingPayment),recharge:existingRecharge,message:'Payment request पहले ही दर्ज हो चुकी है।'});}
      if(!validMobile(mobile)||!['JIO','AIRTEL','VI','BSNL'].includes(operator)||!['PREPAID','POSTPAID'].includes(type)||!Number.isFinite(amount)||amount<=0||!plan.id)return json(res,400,{error:'Valid mobile, operator, type, plan और amount जरूरी हैं'});
      if(utr&&!validUtr(utr))return json(res,400,{error:'UTR / Transaction Reference में 6–50 अक्षर/अंक और केवल . _ - / जैसे मान्य चिन्ह रखें'});
      if(utr&&db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      let proof=null;if(x.screenshot){try{proof=safeImage(x.screenshot)}catch(e){return json(res,400,{error:e.message})}}
      if(!utr&&!proof)return json(res,400,{error:'UTR या payment screenshot में से कम-से-कम एक जरूरी है'});
      const duplicateProof=db.payments.some(existing=>{if(!existing.screenshot)return false;let h=String(existing.proof_sha256||'').toLowerCase();if(!h){const fp=path.join(UPLOAD_DIR,path.basename(existing.screenshot));try{if(fs.existsSync(fp))h=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}catch{h=''}}return h===proof.sha256});
      if(duplicateProof){try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}return json(res,409,{error:'यह payment screenshot पहले से दर्ज है। नया payment proof इस्तेमाल करें।'})}
      const service='Prepaid mobile recharge',t=now(),applicationId=newId();
      const app={id:applicationId,application_id:nextCode('applications','application_id','APP',4),name,mobile,service,category:'मोबाइल रिचार्ज',address:'',note:`Recharge target: ${mobile}; ${operator} ${type}; ${String(plan.name||plan.title||'Selected plan').slice(0,160)}`,status:'Payment Verification Pending',created_at:t,customer_id:c.customer_id||STORAGE.customerIdFor(accountMobile)};
      db.applications.push(app);
      const paymentId=newId(),pay={id:paymentId,txn_id:'PAY-'+String(paymentId).slice(-8),name,mobile:accountMobile,service,amount,payable_amount_snapshot:amount,offer_id:null,offer_title:String(plan.name||plan.title||`₹${amount}`),method:'UPI',utr,screenshot:proof?proof.url:null,status:'Pending Verification',created_at:t,receipt_no:null,application_id:applicationId,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null,verified_by:null,verified_at:null,reject_reason:null,recharge_mobile:mobile,recharge_operator:operator,recharge_type:type,recharge_circle:circle,recharge_plan:plan};
      db.payments.push(pay);
      const rechargeId=newId(),row={id:rechargeId,mobile,operator,type,circle,amount:money(amount),plan_id:String(plan.id||''),plan_name:String(plan.name||plan.title||`₹${amount}`),provider_ref:'',status:'Pending',source:'customer-payment',payment_id:paymentId,application_id:applicationId,customer_id:c.customer_id||'',customer_name:name,actor_type:'customer',actor_id:c.customer_id||accountMobile,actor_name:name,retry_of_recharge_id:null,retry_group_id:rechargeId,attempt_no:1,notes:'Payment verification pending; manual recharge only after Admin verification.',created_at:t,updated_at:t,status_history:[{status:'Pending',at:t,reason:'Payment verification pending'}]};
      db.recharge_transactions.unshift(row);
      rememberPaymentIdempotency('recharge-payment',idemKey,idemFingerprint,{payment_id:paymentId,recharge_id:rechargeId,application_id:applicationId});
      db.audit.unshift({id:newId(),action:'CUSTOMER_RECHARGE_PAYMENT_SUBMITTED',payment_id:paymentId,recharge_id:rechargeId,application_id:applicationId,mobile:'******'+mobile.slice(-4),operator,amount:row.amount,by:name,at:t});save();
      return json(res,200,{ok:true,payment:customerPayment(pay),recharge:row,message:'Payment verification pending. Admin verification के बाद manual recharge होगा।'});
    }
    if(p==='/api/customer/recharge/retry'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),sourceId=Number(x.recharge_id||0),utr=String(x.utr||'').trim();
      const retryRateKey=String(c.customer_id||c.mobile||req.socket.remoteAddress||'unknown');
      const retryNow=Date.now(),retryWindow=10*60*1000,retryLimit=12;
      const retryRate=rechargeRetryAttempts.get(retryRateKey)||{n:0,at:retryNow};
      if(retryNow-retryRate.at>retryWindow){retryRate.n=0;retryRate.at=retryNow}
      if(retryRate.n>=retryLimit)return json(res,429,{error:'बहुत अधिक recharge retry requests. कुछ मिनट बाद फिर कोशिश करें।'});
      retryRate.n++;rechargeRetryAttempts.set(retryRateKey,retryRate);
      const source=(db.recharge_transactions||[]).find(r=>Number(r.id)===sourceId);
      if(!source)return json(res,404,{error:'Original recharge नहीं मिला'});
      if(!((source.customer_id&&c.customer_id&&String(source.customer_id)===String(c.customer_id))||String(source.mobile)===String(c.mobile)))return json(res,403,{error:'इस recharge पर access नहीं है'});
      if(source.status!=='Failed')return json(res,409,{error:'Retry केवल Failed recharge के लिए उपलब्ध है'});
      if(utr&&!validUtr(utr))return json(res,400,{error:'नया UTR / Transaction Reference में 6–50 अक्षर/अंक और केवल . _ - / जैसे मान्य चिन्ह रखें'});
      let proof=null;if(x.screenshot){try{proof=safeImage(x.screenshot)}catch(e){return json(res,400,{error:e.message})}}
      if(!utr&&!proof)return json(res,400,{error:'UTR या payment screenshot में से कम-से-कम एक जरूरी है'});
      const idemKey=paymentIdempotencyKey(req,x);if(!idemKey)return json(res,400,{error:'Retry safety के लिए idempotency key जरूरी है'});
      const idemFingerprint=paymentFingerprint(['recharge-retry',c.customer_id||c.mobile,source.id,utr]);
      const existingIdem=findPaymentIdempotency('recharge-retry',idemKey,idemFingerprint);
      if(existingIdem?.conflict)return json(res,409,{error:'Same idempotency key अलग retry payload के साथ reuse नहीं हो सकता।'});
      // Idempotent replay must win before the linear-chain guard. Otherwise a
      // legitimate network retry of the already-created attempt would be
      // incorrectly reported as a duplicate child instead of returning 200.
      if(existingIdem?.payment_id){const ep=db.payments.find(z=>Number(z.id)===Number(existingIdem.payment_id));const er=db.recharge_transactions.find(z=>Number(z.id)===Number(existingIdem.recharge_id));if(ep&&er)return json(res,200,{ok:true,payment:customerPayment(ep),recharge:customerRecharge(er),message:'Retry request पहले ही दर्ज हो चुकी है।'});}
      // A retry chain is strictly linear: once an attempt has a child retry,
      // that parent can no longer be retried. This prevents concurrent/double
      // retry branches when two clients submit different proofs at the same time.
      const childRetry=(db.recharge_transactions||[]).find(r=>Number(r.retry_of_recharge_id)===Number(source.id));
      if(childRetry)return json(res,409,{error:`इस recharge का retry attempt #${Number(childRetry.attempt_no||2)} पहले से दर्ज है। नवीनतम Failed attempt से ही अगला retry करें।`,recharge_id:childRetry.id,attempt_no:Number(childRetry.attempt_no||2)});
      if(utr&&db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है। नया UTR इस्तेमाल करें।'});
      const duplicateProof=db.payments.some(existing=>{if(!existing.screenshot)return false;let h=String(existing.proof_sha256||existing.screenshot_sha256||'').toLowerCase();if(!h){const fp=path.join(UPLOAD_DIR,path.basename(existing.screenshot));try{if(fs.existsSync(fp))h=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}catch{h=''}}return h===String(proof.sha256||'').toLowerCase()});
      if(duplicateProof){try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}return json(res,409,{error:'यह payment screenshot पहले से दर्ज है। नया proof इस्तेमाल करें।'})}
      const name=String(c.name||source.customer_name||'').trim(),accountMobile=String(c.mobile||source.mobile||'').trim(),t=now(),applicationId=newId();
      const rootId=Number(source.retry_group_id||source.id),attemptNo=Math.max(1,Number(source.attempt_no||1)+1);
      const paymentId=newId(),rechargeId=newId();
      const app={id:applicationId,application_id:nextCode('applications','application_id','APP',4),name,mobile:accountMobile,service:'Prepaid mobile recharge',category:'मोबाइल रिचार्ज',address:'',note:`Recharge retry of #${source.id}: ${source.mobile}; ${source.operator} ${source.type}; ${source.plan_name}`,status:'Payment Verification Pending',created_at:t,customer_id:c.customer_id||STORAGE.customerIdFor(accountMobile),retry_of_recharge_id:source.id,retry_group_id:rootId,attempt_no:attemptNo};
      const pay={id:paymentId,txn_id:'PAY-'+String(paymentId).slice(-8),name,mobile:accountMobile,service:'Prepaid mobile recharge',amount:Number(source.amount||0),payable_amount_snapshot:Number(source.amount||0),offer_id:null,offer_title:String(source.plan_name||`₹${source.amount}`),method:'UPI',utr,screenshot:proof?proof.url:null,status:'Pending Verification',created_at:t,receipt_no:null,application_id:applicationId,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null,verified_by:null,verified_at:null,reject_reason:null,recharge_mobile:source.mobile,recharge_operator:source.operator,recharge_type:source.type,recharge_circle:source.circle,recharge_plan:{id:source.plan_id||'',name:source.plan_name||''},retry_of_recharge_id:source.id,retry_group_id:rootId,attempt_no:attemptNo};
      const row={id:rechargeId,mobile:source.mobile,operator:source.operator,type:source.type,circle:source.circle,amount:money(source.amount),plan_id:String(source.plan_id||''),plan_name:String(source.plan_name||`₹${source.amount}`),provider_ref:'',status:'Pending',source:'customer-recharge-retry',payment_id:paymentId,application_id:applicationId,customer_id:c.customer_id||source.customer_id||'',customer_name:name,actor_type:'customer',actor_id:c.customer_id||accountMobile,actor_name:name,retry_of_recharge_id:source.id,retry_group_id:rootId,attempt_no:attemptNo,notes:`Retry of failed recharge #${source.id}; payment verification pending.`,created_at:t,updated_at:t,status_history:[{status:'Pending',at:t,reason:`Retry submitted for failed recharge #${source.id}`}],state_revision:1};
      const auditRow={id:newId(),action:'CUSTOMER_RECHARGE_RETRY_SUBMITTED',payment_id:paymentId,recharge_id:rechargeId,retry_of_recharge_id:source.id,retry_group_id:rootId,attempt_no:attemptNo,mobile:'******'+String(source.mobile).slice(-4),amount:row.amount,by:name,at:t};
      try{
        withDbTransaction(['applications','payments','recharge_transactions','payment_idempotency','audit','notifications'],()=>{
          db.applications.push(app);db.payments.push(pay);db.recharge_transactions.unshift(row);
          rememberPaymentIdempotency('recharge-retry',idemKey,idemFingerprint,{payment_id:paymentId,recharge_id:rechargeId,application_id:applicationId});
          db.audit.unshift(auditRow);
          notifyCustomer(accountMobile,'recharge','success','Recharge Retry Submitted',`आपका failed recharge #${source.id} के लिए नया retry attempt #${attemptNo} submit हो गया है।`,{payment_id:paymentId,application_id:applicationId,recharge_id:rechargeId,event_key:'recharge-retry-submitted:'+rechargeId});
        },()=>{try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}});
      }catch(e){
        return json(res,503,{error:'Recharge retry save नहीं हो सका। आपका नया payment attempt दर्ज नहीं किया गया; कृपया फिर कोशिश करें।'});
      }
      return json(res,201,{ok:true,payment:customerPayment(pay),recharge:customerRecharge(row),message:'नया recharge retry submit हो गया है। Admin payment verification के बाद processing शुरू होगी।'});
    }
    if(p==='/api/recharge/initiate'&&req.method==='POST')return json(res,410,{manual_only:true,error:'Recharge execution Admin-managed है। Customer payment submit करने के बाद Admin verification और manual processing करेगा।'});
    if(p==='/api/uppcl/bill'&&req.method==='POST')return json(res,410,{error:'UPPCL external bill API disabled. Customer को Admin द्वारा saved manual bill ही दिखेगा।'});
    if(p==='/api/customer/uppcl/payment'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),account=String(x.account||'').trim().slice(0,30),billId=Number(x.bill_id)||0,billVersion=Number(x.bill_version)||0,district=String(x.district||'').trim(),discom=String(x.discom||'').trim(),utr=String(x.utr||'').trim(),amount=Number(x.amount),billMonth=String(x.bill_month||'').trim(),dueDate=String(x.due_date||'').trim(),providedIdempotencyKey=String(x.idempotency_key||req.headers['idempotency-key']||'').trim().slice(0,100),idempotencyKey=providedIdempotencyKey||('uppcl-legacy-'+crypto.createHash('sha256').update([String(c.mobile||''),account,String(billId),String(billVersion),utr].join('|')).digest('hex'));
      if(!account||!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Valid account और payment amount जरूरी हैं'});
      if(!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey))return json(res,400,{error:'Payment retry key invalid है।'});
      if(!billId||!billVersion)return json(res,409,{error:'Bill version missing है। Bill को फिर से देखें और payment दोबारा submit करें।'});
      if(!/^[0-9]{6,30}$/.test(account))return json(res,400,{error:'Valid numeric Account Number दर्ज करें।'});
      if(utr&&(utr.length<6||utr.length>40))return json(res,400,{error:'UTR / Transaction Reference valid रखें'});
      if(!utr&&!x.screenshot)return json(res,400,{error:'UTR या payment screenshot में से कम-से-कम एक जरूरी है'});
      const manualBill=(db.uppcl_manual_bills||[]).find(z=>String(z.account||'').trim()===account&&String(z.status||'Updated')==='Updated');
      if(!manualBill)return json(res,404,{error:'इस Account Number का Admin-approved bill उपलब्ध नहीं है। पहले Bill देखें।'});
      if(Number(manualBill.id)!==billId||Number(manualBill.version||1)!==billVersion)return json(res,409,{error:'Admin ने bill update किया है। नया bill फिर से देखें और उसी latest bill का payment करें।'});
      const customerMobile=String(c.mobile||'').replace(/\D/g,'');
      const billMobile=String(manualBill.registered_mobile||'').replace(/\D/g,'');
      if(!billMobile)return json(res,409,{error:'इस bill में customer Registered Mobile mapping उपलब्ध नहीं है। Payment submit करने से पहले Admin से bill mapping पूरी करवाएँ।'});
      if(billMobile!==customerMobile)return json(res,403,{error:'यह bill आपके customer account से linked नहीं है। Payment submit नहीं किया जा सकता।'});
      const expectedTotal=Number(manualBill.total_amount||0);
      if(!Number.isFinite(expectedTotal)||expectedTotal<=0)return json(res,409,{error:'Admin bill का Total Payable valid नहीं है।'});
      if(amount<=0)return json(res,409,{error:'Payment amount ₹0 से अधिक होना चाहिए।'});
      if(String(x.bill_month||'').trim()!==String(manualBill.bill_month||'').trim()||String(x.due_date||'').trim()!==String(manualBill.due_date||'').trim())return json(res,409,{error:'Bill details बदल गए हैं। Bill को फिर से देखें और उसी bill का payment करें।'});
      const existingByKey=db.payments.find(p=>p.service==='UPPCL Bill Payment'&&String(p.idempotency_key||'')===idempotencyKey);
      if(existingByKey){
        const sameRequest=String(existingByKey.mobile||'')===customerMobile&&String(existingByKey.uppcl_account||'').trim()===account&&Number(existingByKey.uppcl_bill_id||0)===billId&&Number(existingByKey.uppcl_bill_version||0)===billVersion&&Math.abs(Number(existingByKey.amount||0)-amount)<0.009;
        if(!sameRequest)return json(res,409,{error:'यह retry key किसी दूसरे payment request से जुड़ी है। नया payment submit करें।'});
        return json(res,200,{ok:true,idempotent:true,payment:customerPayment(existingByKey),message:'Payment request पहले ही दर्ज हो चुका है। उसी payment status को दिखाया जा रहा है।'});
      }
      if(utr && db.payments.some(p=>String(p.utr||'').trim() && String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      let proof=null;if(x.screenshot){try{proof=safeImage(x.screenshot)}catch(e){return json(res,400,{error:e.message})}}
      const duplicateProof=proof&&db.payments.some(existing=>{if(!existing.screenshot)return false;let h=String(existing.proof_sha256||'').toLowerCase();if(!h){const fp=path.join(UPLOAD_DIR,path.basename(existing.screenshot));try{if(fs.existsSync(fp))h=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}catch{h=''}}return h===proof.sha256});
      if(duplicateProof){try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}return json(res,409,{error:'यह payment screenshot पहले से दर्ज है। नया payment proof इस्तेमाल करें।'})}
      const billDistrict=String(manualBill.district||district).slice(0,40),billDiscom=String(manualBill.discom||discom).slice(0,40),billMonthValue=String(manualBill.bill_month||billMonth).slice(0,40),dueDateValue=String(manualBill.due_date||dueDate).slice(0,40),consumerNameValue=String(manualBill.consumer_name||x.consumer_name||'').slice(0,160),currentBillValue=Number(manualBill.bill_amount||0),arrearValue=Number(manualBill.arrear||0),lateFeeValue=Number(manualBill.late_fee||0);
      const t=now(),name=String(c.name||'').trim()||String(c.mobile||''),mobile=String(c.mobile||'').trim(),applicationId=newId();
      const app={id:applicationId,uppcl_bill_id:billId,uppcl_bill_version:billVersion,application_id:nextCode('applications','application_id','APP',4),name,mobile,service:'UPPCL Bill Payment',category:'बिल भुगतान',address:'',note:`UPPCL ${account} · ${billDistrict}/${billDiscom} · Bill ${billMonthValue||'—'} · ₹${amount.toFixed(2)}`,status:'Payment Verification Pending',created_at:t,uppcl_account:account,uppcl_bill_id:billId,uppcl_bill_version:billVersion,uppcl_district:billDistrict,uppcl_discom:billDiscom,uppcl_bill_month:billMonthValue,uppcl_due_date:dueDateValue,uppcl_consumer_name:consumerNameValue,uppcl_current_bill:currentBillValue,uppcl_arrear:arrearValue,uppcl_late_fee:lateFeeValue,uppcl_amount:amount};
      // Treat the application + payment + audit write as one logical transaction.
      // If persistence fails (for example a concurrent revision conflict), rollback the
      // in-memory records and remove the newly uploaded proof so no orphan application
      // or orphan payment survives a failed submission.
      const applicationsBefore=db.applications.length;
      const paymentsBefore=db.payments.length;
      const auditBefore=db.audit.length;
      db.applications.push(app);
      const paymentId=newId(),pay={id:paymentId,txn_id:'PAY-'+String(paymentId).slice(-8),name,mobile,service:'UPPCL Bill Payment',amount,payable_amount_snapshot:amount,offer_id:null,offer_title:`UPPCL Bill ${account}`,method:'UPI',utr,screenshot:proof?proof.url:null,status:'Pending Verification',created_at:t,receipt_no:null,application_id:applicationId,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null,verified_by:null,verified_at:null,reject_reason:null,uppcl_bill_id:billId,uppcl_bill_version:billVersion,uppcl_account:account,uppcl_district:billDistrict,uppcl_discom:billDiscom,uppcl_bill_month:billMonthValue,uppcl_due_date:dueDateValue,uppcl_consumer_name:consumerNameValue,uppcl_current_bill:currentBillValue,uppcl_arrear:arrearValue,uppcl_late_fee:lateFeeValue,uppcl_bill_total:expectedTotal,uppcl_processing_status:'Awaiting Payment Verification',uppcl_provider_ref:'',idempotency_key:idempotencyKey};
      db.payments.push(pay);db.audit.unshift({id:newId(),action:'CUSTOMER_UPPCL_PAYMENT_SUBMITTED',payment_id:paymentId,application_id:applicationId,by:name,account:'******'+account.slice(-4),amount,at:t});
      try{
        save();
      }catch(e){
        db.applications.length=applicationsBefore;
        db.payments.length=paymentsBefore;
        db.audit.length=auditBefore;
        try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}
        const message=String(e?.message||'').includes('Concurrent database update detected')
          ? 'Database update के दौरान conflict हुआ। Payment save नहीं हुआ; कृपया थोड़ी देर बाद दोबारा submit करें।'
          : 'Payment save नहीं हो पाया। Payment/application record create नहीं किया गया; कृपया दोबारा submit करें।';
        return json(res,503,{error:message,retryable:true});
      }
      return json(res,200,{ok:true,payment:customerPayment(pay),message:'UPPCL payment verification pending. Admin verification के बाद bill manually process किया जाएगा।'});
    }
    if(p==='/api/uppcl/payment'&&req.method==='POST')return json(res,410,{error:'UPPCL external payment API disabled. Customer payment केवल Angelstore manual UPI verification flow से होगा।'});
    if(p==='/api/health')return json(res,PRODUCTION_CONFIG_ERROR?503:200,{ok:!PRODUCTION_CONFIG_ERROR,service:'angelstore-csc-backend',time:now(),environment:IS_PRODUCTION?'production':'local',configuration:PRODUCTION_CONFIG_ERROR?'invalid':'ok'});
    if(p==='/api/admin/monitoring'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const r=await reconcileIncidents('admin');return json(res,200,{ok:r.open.length===0,monitor:r.monitor,incidents:r.open,alert_webhook_configured:!!ALERT_WEBHOOK_URL,interval_minutes:MONITOR_INTERVAL_MINUTES});}
    if(p==='/api/admin/recharge-retry-observability'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{ok:true,observability:rechargeRetryObservability(),checked_at:now()});}
    if(p==='/api/admin/incidents'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{incidents:(db.incidents||[]).slice(0,100),checked_at:now()});}
    if(p==='/api/admin/incidents/resolve'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),id=Number(x.id);const inc=(db.incidents||[]).find(i=>Number(i.id)===id&&i.status==='open');if(!inc)return json(res,404,{error:'Open incident नहीं मिला'});inc.status='resolved';inc.resolved_at=now();inc.resolved_by=a.user||'admin';const alert=await sendAlertWebhook({action:'incident_resolved',incident:inc,manual:true});inc.recovery_alert_sent=!!alert.sent;inc.recovery_alert_result=alert;save();return json(res,200,{ok:true,incident:inc});}
    if(p==='/api/admin/storage-status'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{ok:true,storage:storageStatus()});}
    if(p==='/api/admin/security-audit'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const limit=Math.min(500,Math.max(1,Number(u.searchParams.get('limit')||100)));
      const rows=(db.audit||[]).slice().sort((x,y)=>String(y.at||'').localeCompare(String(x.at||'')));
      const match=(patterns)=>rows.filter(x=>patterns.some(pat=>String(x.action||'').toUpperCase().includes(pat)));
      const loginHistory=rows.filter(x=>['ADMIN_LOGIN','ADMIN_LOGOUT','STAFF_LOGIN','STAFF_LOGOUT'].includes(String(x.action||''))).slice(0,limit);
      const failedLogin=rows.filter(x=>['FAILED_ADMIN_LOGIN','FAILED_STAFF_LOGIN'].includes(String(x.action||''))).slice(0,limit);
      const documentAccess=match(['DOCUMENT_VIEWED','DOCUMENT_ACCESS']).slice(0,limit);
      const downloadLog=match(['DOCUMENT_DOWNLOADED','DOWNLOAD']).slice(0,limit);
      const deleteLog=match(['DOCUMENT_DELETED','DELETE']).slice(0,limit);
      const paymentVerification=match(['PAYMENT_VERIFIED','PAYMENT_REJECTED','PAYMENT_VERIFICATION']).slice(0,limit);
      const tokenChanges=match(['TOKEN_']).slice(0,limit);
      const adminActivity=rows.filter(x=>String(x.by||'').toLowerCase().includes('admin')||String(x.action||'').startsWith('ADMIN_')).slice(0,limit);
      const staffActivity=rows.filter(x=>String(x.action||'').startsWith('STAFF_')||x.staff_id).slice(0,limit);
      const permissionChanges=match(['PERMISSION_','ROLE_CHANGED']).slice(0,limit);
      return json(res,200,{ok:true,checked_at:now(),counts:{login_history:loginHistory.length,failed_login:failedLogin.length,document_access:documentAccess.length,download_log:downloadLog.length,delete_log:deleteLog.length,payment_verification:paymentVerification.length,token_changes:tokenChanges.length,admin_activity:adminActivity.length,staff_activity:staffActivity.length,permission_changes:permissionChanges.length},logs:{login_history:loginHistory,failed_login:failedLogin,document_access:documentAccess,download_log:downloadLog,delete_log:deleteLog,payment_verification:paymentVerification,token_changes:tokenChanges,admin_activity:adminActivity,staff_activity:staffActivity,permission_changes:permissionChanges}});
    }
    if(p==='/api/admin/preflight'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const collections=Object.keys(STORAGE.COLLECTION_DEFAULTS).filter(k=>k!=='settings');const missing=collections.filter(k=>!Array.isArray(db[k]));const catalogCategories=Object.keys(SERVICE_INFO);const catalogServices=catalogCategories.reduce((n,k)=>n+(SERVICE_INFO[k].services||[]).length,0);const checks=[
      {key:'production_env',label:'Production environment variables',ok:!IS_PRODUCTION||!PRODUCTION_CONFIG_ERROR,detail:IS_PRODUCTION?(PRODUCTION_CONFIG_ERROR?'Set strong secret/admin credentials and an explicit CORS origin.':'Configured'):'Local mode'},
      {key:'auth_secret',label:'Auth secret strength',ok:!IS_PRODUCTION||(AUTH_SECRET&&AUTH_SECRET.length>=32),detail:IS_PRODUCTION?'At least 32 characters required':'Local development secret'},
      {key:'cors',label:'CORS origin restricted',ok:!IS_PRODUCTION||VALID_PRODUCTION_ORIGIN,detail:FRONTEND_ORIGIN},
      {key:'database',label:'Database file present',ok:fs.existsSync(DATA),detail:DATA},
      {key:'backup_dir',label:'Backup directory writable',ok:fs.existsSync(BACKUP_DIR)&&(()=>{try{fs.accessSync(BACKUP_DIR,fs.constants.W_OK);return true}catch{return false}})(),detail:BACKUP_DIR},
      {key:'schema',label:'Schema collections available',ok:missing.length===0,detail:missing.length?('Missing: '+missing.join(', ')):'All expected collections present'},
      {key:'catalog',label:'Service catalog loaded',ok:catalogServices>0,detail:`${catalogCategories.length} categories / ${catalogServices} sub-services`},
      {key:'sessions',label:'Session stores available',ok:Array.isArray(db.admin_sessions)&&Array.isArray(db.staff_sessions)&&Array.isArray(db.customer_sessions),detail:'Admin/staff/customer sessions'},
      {key:'payment_flow',label:'Manual payment verification flow',ok:true,detail:'UPI/Bank require UTR + proof and admin verification'},
      {key:'qc_gate',label:'Staff completion QC gate',ok:true,detail:'Assigned staff tasks require passed quality review'}
    ];return json(res,200,{ok:checks.every(x=>x.ok),generated_at:now(),checks,summary:{passed:checks.filter(x=>x.ok).length,total:checks.length}})}
    if(p==='/api/staff/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown';if(!staffLoginAllowed(ip))return json(res,429,{error:'बहुत अधिक staff login attempts. 15 मिनट बाद फिर कोशिश करें।'});
      const x=await body(req),identifier=String(x.identifier||'').trim(),pin=String(x.pin||'');
      if(!identifier||!validPin(pin))return json(res,400,{error:'Employee ID/mobile और 4–6 digit PIN जरूरी है'});
      const st=staffByIdentifier(identifier); const pinOk=st&&st.pin_hash&&st.pin_salt?pinVerify(pin,st.pin_salt,st.pin_hash):pinVerify(pin,dummyPinCredential().salt,dummyPinCredential().hash); if(!st||st.status==='inactive'||!pinOk){failStaffLogin(ip);return json(res,401,{error:'Staff credentials गलत हैं'});}
      clearLoginAttempts('staff_login_attempts',ip);cleanupSessions();const sid=crypto.randomBytes(18).toString('hex'); db.staff_sessions.push({sid,staff_id:st.staff_id,created_at:now(),expires_at:new Date(Date.now()+12*60*60*1000).toISOString()});
      db.audit.unshift({id:newId(),action:'STAFF_LOGIN',staff_id:st.staff_id,by:st.employee_id,at:now()}); save();setAuthCookies(res,req,{staffToken:staffSessionFor(st,sid)});return json(res,200,{staff:staffPublic(st)})
    }
    if(p==='/api/staff/logout'&&req.method==='POST'){const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});const row=db.staff_sessions.find(z=>z.sid===s.sid);if(row)row.revoked_at=now();save();setAuthCookies(res,req,{clear:true});return json(res,200,{ok:true})}
    if(p==='/api/staff/me'&&req.method==='GET'){const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});return json(res,200,{staff:staffPublic(s.record)})}
    if(p==='/api/sops'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const service=u.searchParams.get('service')||'';
      if(service)return json(res,200,{sop:sopFor(service)});
      const all=[];for(const cat of Object.keys(SERVICE_INFO)){for(const sub of (SERVICE_INFO[cat].services||[])){const serviceName=cat+' — '+sub.name;all.push(sopFor(serviceName))}}
      return json(res,200,{sops:all});
    }
    if(p==='/api/sops'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),service=String(x.service||'').trim();if(!serviceExists(service))return json(res,400,{error:'Valid service जरूरी है'});
      const documents=Array.isArray(x.documents)?x.documents.map(v=>String(v).trim()).filter(Boolean):[];const steps=Array.isArray(x.steps)?x.steps.map(v=>String(v).trim()).filter(Boolean):[];const checks=Array.isArray(x.checks)?x.checks.map((v,i)=>({id:String(v.id||('check_'+(i+1))),label:String(v.label||'').trim(),required:v.required!==false})).filter(v=>v.label):[];
      let r=db.service_sops.find(z=>z.service===service);if(!r){r={id:newId(),service,created_at:now()};db.service_sops.unshift(r)}
      Object.assign(r,{documents,steps,checks,note:String(x.note||'').trim(),updated_at:now(),updated_by:a.user||'admin'});db.audit.unshift({id:newId(),action:'SOP_UPDATED',service,by:a.user||'admin',at:now()});save();return json(res,200,{sop:sopFor(service)});
    }
    if(p==='/api/token-workflow'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(u.searchParams.get('token_id')||0),t=db.tokens.find(z=>Number(z.id)===id);if(!t)return json(res,404,{error:'Token नहीं मिला'});return json(res,200,{token:publicToken(t),workflow:t.workflow||{}});
    }
    if(p==='/api/token-workflow'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),id=Number(x.token_id||0),t=db.tokens.find(z=>Number(z.id)===id);if(!t)return json(res,404,{error:'Token नहीं मिला'});
      const allowed=['pending','received','verified','not_required'];const old=t.workflow||{};const workflow={...old,photo:allowed.includes(String(x.photo))?String(x.photo):(old.photo||'pending'),signature:allowed.includes(String(x.signature))?String(x.signature):(old.signature||'pending'),documents:allowed.includes(String(x.documents))?String(x.documents):(old.documents||'pending'),uploads:allowed.includes(String(x.uploads))?String(x.uploads):(old.uploads||'pending'),data:allowed.includes(String(x.data))?String(x.data):(old.data||'pending'),submission:allowed.includes(String(x.submission))?String(x.submission):(old.submission||'pending'),reference_no:String(x.reference_no??old.reference_no??'').trim().slice(0,120),notes:String(x.notes??old.notes??'').trim().slice(0,1000),updated_at:now(),updated_by:a.user||'admin'};
      t.workflow=workflow;t.last_action_at=workflow.updated_at;db.audit.unshift({id:newId(),action:'TOKEN_WORKFLOW_UPDATED',token_id:t.id,workflow,by:a.user||'admin',at:workflow.updated_at});save();return json(res,200,{token:publicToken(t),workflow});
    }
    if(p==='/api/workflow/documents'&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'view_assigned'))return json(res,403,{error:'इस staff role को assigned documents देखने की अनुमति नहीं है'});
      const tokenId=Number(u.searchParams.get('token_id')||0),applicationId=Number(u.searchParams.get('application_id')||0);
      let t=tokenId?db.tokens.find(z=>Number(z.id)===tokenId):null;
      if(sa&&t&&String(t.staff_id)!==String(sa.staff_id))return json(res,403,{error:'यह token आपके लिए assigned नहीं है'});
      const aid=applicationId||t?.application_id||null;
      if(t&&!aid)return json(res,200,{token_id:t.id,application_id:null,documents:[]});
      if(sa&&!t&&aid){const assigned=db.tokens.find(z=>Number(z.application_id)===aid&&String(z.staff_id)===String(sa.staff_id));if(!assigned)return json(res,403,{error:'यह application आपके assigned task में नहीं है'});t=assigned}
      const rows=db.documents.filter(d=>!aid||Number(d.application_id)===Number(aid)).map(d=>({id:d.id,document_id:d.document_id,application_id:d.application_id,name:d.name,mime_type:d.mime_type,size:d.size,status:d.status||'uploaded',ocr_status:d.ocr_status||'not_run',ocr_fields:maskedPiiFields(d),created_at:d.created_at,created_by:d.created_by}));
      return json(res,200,{token_id:t?.id||tokenId||null,application_id:aid,documents:rows});
    }
    if(p.startsWith('/api/documents/')&&p.endsWith('/file')&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req);const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);const access=documentAccess(d,{aa,sa});if(!access.ok)return json(res,access.status,{error:access.error});
      const file=path.basename(String(d.path||''));if(!file||!DOCUMENT_FILE_RE.test(file))return json(res,404,{error:'Document file नहीं मिला'});const fp=path.join(DOCUMENT_UPLOAD_DIR,file);if(!fs.existsSync(fp))return json(res,404,{error:'Document file नहीं मिला'});
      d.viewed_at=now();d.viewed_by=aa?.user||sa?.employee_id||'staff';db.audit.unshift({id:newId(),action:'DOCUMENT_VIEWED',document_id:d.id,application_id:d.application_id,by:d.viewed_by,at:d.viewed_at});save();
      const ct={'application/pdf':'application/pdf','image/png':'image/png','image/webp':'image/webp','image/jpeg':'image/jpeg'}[String(d.mime_type||'').toLowerCase()]||'application/octet-stream';const b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':ct,'Content-Disposition':`inline; filename="${String(d.name||'document').replace(/[^A-Za-z0-9._ -]/g,'_')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p.startsWith('/api/documents/')&&p.endsWith('/download')&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req),cs=customerSession(req);const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);const access=documentAccess(d,{aa,sa,cs});if(!access.ok)return json(res,access.status,{error:access.error});const app=access.app;const t=access.t;
      const file=path.basename(String(d.path||''));if(!file||!DOCUMENT_FILE_RE.test(file))return json(res,404,{error:'Document file नहीं मिला'});const fp=path.join(DOCUMENT_UPLOAD_DIR,file);if(!fs.existsSync(fp))return json(res,404,{error:'Document file नहीं मिला'});
      const by=aa?.user||sa?.employee_id||cs?.customer_id||'customer';d.downloaded_at=now();d.downloaded_by=by;db.audit.unshift({id:newId(),action:'DOCUMENT_DOWNLOADED',document_id:d.id,application_id:d.application_id,by,at:d.downloaded_at});save();
      const ct={'application/pdf':'application/pdf','image/png':'image/png','image/webp':'image/webp','image/jpeg':'image/jpeg'}[String(d.mime_type||'').toLowerCase()]||'application/octet-stream';const b=fs.readFileSync(fp);const safeName=String(d.name||'document').replace(/[^A-Za-z0-9._ -]/g,'_');res.writeHead(200,{'Content-Type':ct,'Content-Disposition':`attachment; filename="${safeName}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p.startsWith('/api/documents/')&&req.method==='DELETE'){
      const aa=admin(req),sa=staffAuth(req),cs=customerSession(req);const id=Number(p.split('/')[3]||0),idx=db.documents.findIndex(x=>Number(x.id)===id);if(idx<0)return json(res,404,{error:'Document नहीं मिला'});
      const d=db.documents[idx],access=documentAccess(d,{aa,sa,cs});if(!access.ok)return json(res,access.status,{error:access.error});const app=access.app;const t=access.t;
      if(sa&&!staffHasPermission(sa.record,'document_review'))return json(res,403,{error:'इस staff role को document delete करने की अनुमति नहीं है'});
      if(!aa&&d.status==='verified')return json(res,409,{error:'Verified document को Staff/Customer delete नहीं कर सकते। Admin से delete करवाएँ।'});
      const file=path.basename(String(d.path||''));
      if(file&&DOCUMENT_FILE_RE.test(file)){const fp=path.join(DOCUMENT_UPLOAD_DIR,file);if(fs.existsSync(fp)){try{fs.unlinkSync(fp)}catch(e){return json(res,500,{error:'Document file delete नहीं हो सका'})}}}
      const by=aa?.user||sa?.employee_id||cs?.customer_id||'unknown';
      db.documents.splice(idx,1);
      db.audit.unshift({id:newId(),action:'DOCUMENT_DELETED',document_id:d.id,application_id:d.application_id,customer_id:d.customer_id||app?.customer_id||null,name:d.name,by,role:aa?'admin':sa?'staff':'customer',at:now()});
      save();
      return json(res,200,{ok:true,deleted:{id:d.id,document_id:d.document_id,name:d.name}});
    }
    if(p.startsWith('/api/documents/')&&p.endsWith('/status')&&req.method==='POST'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'document_review'))return json(res,403,{error:'इस staff role को document review की अनुमति नहीं है'});const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);if(!d)return json(res,404,{error:'Document नहीं मिला'});const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id));if(sa&&(!t||String(t.staff_id)!==String(sa.staff_id)))return json(res,403,{error:'यह document आपके assigned task में नहीं है'});
      const x=await body(req),status=String(x.status||'').toLowerCase();if(!['uploaded','verified','rejected'].includes(status))return json(res,400,{error:'Status uploaded, verified या rejected होना चाहिए'});if(d.status==='verified'&&status!=='verified')return json(res,409,{error:'Verified document को वापस नहीं बदला जा सकता'});
      d.status=status;d.reviewed_at=now();d.verified_at=status==='verified'?d.reviewed_at:(d.verified_at||null);d.reviewed_by=aa?.user||sa?.employee_id||'staff';d.review_note=String(x.note||'').trim().slice(0,500);const docApp=applicationFor(d.application_id);const docMobile=docApp?.mobile||db.customers.find(c=>c.customer_id===d.customer_id)?.mobile;if(status==='rejected')notifyCustomer(docMobile,'document','error','Document Rejected',`${d.name} reject हुआ है। ${d.review_note||'कृपया document फिर से upload करें।'}`,{document_id:d.id,application_id:d.application_id});if(status==='uploaded'&&d.review_note)notifyCustomer(docMobile,'correction','warning','Correction Required',d.review_note,{document_id:d.id,application_id:d.application_id});syncApplicationStatusForDocuments(docApp);db.audit.unshift({id:newId(),action:'DOCUMENT_STATUS_UPDATED',document_id:d.id,application_id:d.application_id,status,by:d.reviewed_by,at:d.reviewed_at});save();return json(res,200,{document:{id:d.id,document_id:d.document_id,name:d.name,status:d.status,reviewed_at:d.reviewed_at,reviewed_by:d.reviewed_by,review_note:d.review_note}});
    }
    if(p==='/api/service-quality'&&req.method==='GET'){
      const sa=staffAuth(req);const aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'quality_view'))return json(res,403,{error:'इस staff role को Quality Review देखने की अनुमति नहीं है'});const id=Number(u.searchParams.get('token_id')||0),t=db.tokens.find(z=>Number(z.id)===id);if(!t)return json(res,404,{error:'Token नहीं मिला'});if(sa&&t.staff_id!==sa.staff_id)return json(res,403,{error:'यह token आपके लिए assigned नहीं है'});const sop=sopFor(t.service),q=qualityForToken(t);return json(res,200,{token:staffTask(t),sop,quality:q?{...q}:null});
    }
    if(p==='/api/service-quality'&&req.method==='POST'){
      const sa=staffAuth(req);const aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'quality_submit'))return json(res,403,{error:'इस staff role को Quality Review submit करने की अनुमति नहीं है'});
      const x=await body(req),id=Number(x.token_id||0),t=db.tokens.find(z=>Number(z.id)===id);if(!t)return json(res,404,{error:'Token नहीं मिला'});
      if(sa&&t.staff_id!==sa.staff_id)return json(res,403,{error:'यह token आपके लिए assigned नहीं है'});
      if(sa&&['पूर्ण','रद्द','स्किप'].includes(t.status))return json(res,409,{error:'Completed/cancelled/skipped token की Quality Review बदली नहीं जा सकती।'});
      const sop=sopFor(t.service),incoming=Array.isArray(x.checks)?x.checks:[],checks=sop.checks.map(c=>({id:c.id,label:c.label,required:c.required,checked:Boolean(incoming.find(v=>String(v.id)===c.id)?.checked)}));
      const requiredOk=checks.filter(c=>c.required).every(c=>c.checked),app=applicationFor(t.application_id),payment=t.payment_id?db.payments.find(z=>Number(z.id)===Number(t.payment_id)):null;
      const appDocs=app?db.documents.filter(d=>Number(d.application_id)===Number(app.id)):[],requiredDocs=(sop.documents||[]).map(String).filter(Boolean);
      const docGate=documentGate(app,requiredDocs),verifiedDocs=docGate.verified;
      const docsOk=docGate.ok,missingRequiredDocs=docGate.missing;
      const paymentOk=!payment||payment.status==='Verified',note=String(x.notes||'').trim().slice(0,1000),previous=qualityForToken(t);
      const gate={checklist:{required:checks.filter(c=>c.required).length,completed:checks.filter(c=>c.required&&c.checked).length,ok:requiredOk},documents:{required:requiredDocs.length,verified:verifiedDocs.length,ok:docsOk,missing:missingRequiredDocs},payment:{required:!!payment,verified:!payment||payment.status==='Verified',ok:paymentOk},ready:requiredOk&&docsOk&&paymentOk};
      if(aa&&x.action==='reject'){
        const reason=String(x.reason||'').trim().slice(0,500);if(!reason)return json(res,400,{error:'Quality Review reject करने के लिए reason जरूरी है'});
        const q={id:previous?.id||newId(),token_id:t.id,service:t.service,staff_id:t.staff_id||null,checks,status:'rejected',review_stage:'admin',notes:note,rejection_reason:reason,reviewed_at:now(),reviewed_by:aa.user||'admin',updated_at:now(),updated_by:aa.user||'admin'};
        const idx=db.service_quality.findIndex(z=>Number(z.token_id)===Number(t.id));if(idx>=0)db.service_quality[idx]=q;else db.service_quality.unshift(q);t.quality_status='rejected';t.quality_reviewed_at=now();t.quality_rejection_reason=reason;if(app)app.status='Correction Required';notifyCustomer(t.mobile,'correction','warning','Correction Required',reason,{token_id:t.id,application_id:t.application_id,event_key:'quality-correction:'+t.id});
        db.audit.unshift({id:newId(),action:'QUALITY_CHECK_REJECTED',token_id:t.id,application_id:t.application_id||null,staff_id:t.staff_id||null,reason,by:aa.user||'admin',at:now()});save();return json(res,200,{quality:q,token:staffTask(t)});
      }
      if(sa){
        const q={id:previous?.id||newId(),token_id:t.id,service:t.service,staff_id:t.staff_id||sa.staff_id,checks,status:requiredOk?'submitted':'needs_review',review_stage:'staff_submitted',notes:note,rejection_reason:null,submitted_at:now(),updated_at:now(),updated_by:sa.employee_id||'staff'};
        const idx=db.service_quality.findIndex(z=>Number(z.token_id)===Number(t.id));if(idx>=0)db.service_quality[idx]=q;else db.service_quality.unshift(q);t.quality_status=requiredOk?'submitted':'needs_review';t.quality_reviewed_at=null;
        db.audit.unshift({id:newId(),action:requiredOk?'QUALITY_REVIEW_SUBMITTED':'QUALITY_CHECK_UPDATED',token_id:t.id,staff_id:t.staff_id||sa.staff_id,by:sa.employee_id||'staff',at:now()});save();return json(res,200,{quality:q,token:staffTask(t),message:requiredOk?'Review submitted to Admin.':'Required checklist पूरा नहीं हुआ।'});
      }
      if(aa&&x.action==='save'){
        const q={id:previous?.id||newId(),token_id:t.id,service:t.service,staff_id:t.staff_id||null,checks,status:requiredOk?'admin_review':'needs_review',review_stage:'admin_review',notes:note,rejection_reason:null,updated_at:now(),updated_by:aa.user||'admin'};
        const idx=db.service_quality.findIndex(z=>Number(z.token_id)===Number(t.id));if(idx>=0)db.service_quality[idx]=q;else db.service_quality.unshift(q);t.quality_status=q.status;t.quality_reviewed_at=null;
        db.audit.unshift({id:newId(),action:'QUALITY_CHECKS_SAVED_BY_ADMIN',token_id:t.id,application_id:t.application_id||null,staff_id:t.staff_id||null,by:aa.user||'admin',at:q.updated_at});save();return json(res,200,{quality:q,gate,token:staffTask(t),message:'Quality checks saved. Final PASS के लिए अलग action जरूरी है।'});
      }
      if(aa&&x.action==='pass'){
        if(!gate.ready)return json(res,409,{error:'Final PASS के लिए सभी Quality Gate पूरे करें।',gate,missing:{checklist:!requiredOk,documents:missingRequiredDocs,payment:!paymentOk}});
        const q={id:previous?.id||newId(),token_id:t.id,service:t.service,staff_id:t.staff_id||null,checks,status:'passed',review_stage:'admin',notes:note,rejection_reason:null,reviewed_at:now(),reviewed_by:aa.user||'admin',updated_at:now(),updated_by:aa.user||'admin'};
        const idx=db.service_quality.findIndex(z=>Number(z.token_id)===Number(t.id));if(idx>=0)db.service_quality[idx]=q;else db.service_quality.unshift(q);t.quality_status='passed';t.quality_reviewed_at=q.reviewed_at;t.quality_rejection_reason=null;if(app&&app.status==='Correction Required')app.status='Processing';
        db.audit.unshift({id:newId(),action:'QUALITY_CHECK_PASSED',token_id:t.id,application_id:t.application_id||null,staff_id:t.staff_id||null,by:aa.user||'admin',at:q.reviewed_at});save();return json(res,200,{quality:q,gate,token:staffTask(t),message:'Final Quality Review PASS हो गया।'});
      }
      if(aa)return json(res,400,{error:'Admin quality action must be save, pass or reject'});

    }
    if(p==='/api/admin/quality-review'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const rows=db.tokens.filter(t=>t.staff_id&&!['पूर्ण','रद्द','स्किप'].includes(t.status)).map(t=>({token:staffTask(t),quality:qualityForToken(t),application:applicationFor(t.application_id)}));
      return json(res,200,{items:rows,counts:{pending:rows.filter(x=>x.token.quality_status!=='passed').length,passed:rows.filter(x=>x.token.quality_status==='passed').length}});
    }

    if(p==='/api/staff/dashboard'&&req.method==='GET'){
      const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});
      const rows=db.tokens.filter(t=>t.staff_id===s.staff_id).map(staffTask); const active=rows.filter(t=>!['पूर्ण','रद्द','स्किप'].includes(t.status)); const completed=rows.filter(t=>t.status==='पूर्ण');
      const visits=db.home_services.filter(h=>h.staff_id===s.staff_id); const deliveries=db.deliveries.filter(d=>d.staff_id===s.staff_id); const commission=money(db.commissions.filter(x=>x.staff_id===s.staff_id).reduce((a,x)=>a+Number(x.amount||0),0)); const home_allowance=money(visits.reduce((a,x)=>a+Number(x.staff_allowance||0),0)); const delivery_allowance=money(deliveries.reduce((a,x)=>a+Number(x.staff_allowance||0),0));
      return json(res,200,{staff:staffPublic(s.record),summary:{assigned:rows.length,active:active.length,completed:completed.length,home_visits:visits.length,deliveries:deliveries.length,commission,home_allowance,delivery_allowance,total_earned:money(commission+home_allowance+delivery_allowance)},tasks:rows.sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,100),home_services:visits.slice(-50),deliveries:deliveries.slice(-50)})
    }
    if(p==='/api/staff/tasks'&&req.method==='POST'){
      const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});if(!staffHasPermission(s.record,'task_update'))return json(res,403,{error:'इस staff role को task update करने की अनुमति नहीं है'});const x=await body(req),t=db.tokens.find(z=>Number(z.id)===Number(x.id)&&z.staff_id===s.staff_id);if(!t)return json(res,404,{error:'Assigned task नहीं मिला'});
      const beforeTokenState=tokenAuditSnapshot(t);
      const tokenRequestId=String(x.request_id||'').trim().slice(0,120);if(tokenRequestId&&t.last_action_request_id===tokenRequestId)return json(res,200,staffTask(t));if(x.expected_state_revision!==undefined&&x.expected_state_revision!==null&&Number(x.expected_state_revision)!==Number(t.state_revision||0))return json(res,409,{error:'Token state बदल चुका है। Staff task list refresh करके फिर action करें।',current_state_revision:Number(t.state_revision||0)});
      const beforeStatus=t.status; let customerEvent=null;
      if(x.action==='start'){if(!tokenTransitionAllowed(t.status,'प्रगति'))return json(res,400,{error:'इस task state से Start allowed नहीं है'});t.status='प्रगति';t.started_at=t.started_at||now();const startApp=applicationFor(t.application_id);if(startApp)startApp.status='Processing';customerEvent={severity:'info',title:'Service Processing Started',message:`Token ${t.token} की service processing शुरू हो गई है।`}}
      else if(x.action==='resume'){if(t.status!=='होल्ड')return json(res,400,{error:'Hold state से ही Resume किया जा सकता है'});const holdStarted=t.hold_started_at?new Date(t.hold_started_at).getTime():null;const durationMs=holdStarted?Math.max(0,Date.now()-holdStarted):0;const history=Array.isArray(t.hold_history)?t.hold_history:[];if(holdStarted)history.push({reason:t.hold_reason||'Other',owner:t.hold_owner||s.employee_id,duration_ms:durationMs,started_at:t.hold_started_at,resumed_at:now()});t.hold_history=history;t.total_hold_ms=history.reduce((n,h)=>n+Math.max(0,Number(h.duration_ms||0)),0);t.total_hold_minutes=Math.floor(t.total_hold_ms/60000);t.hold_reason=null;t.hold_owner=null;t.hold_delay_minutes=null;t.hold_started_at=null;t.hold_deadline=null;t.status='प्रगति';t.resumed_at=now();customerEvent={severity:'info',title:'Token Resumed',message:`Token ${t.token} की service फिर से शुरू कर दी गई है।`}}
      else if(x.action==='complete'){if(!tokenCanComplete(t))return json(res,400,{error:'Final Quality Review पहले पूरा करें। Required checklist पूरा होना जरूरी है।'});t.status='पूर्ण';t.completed_at=now();const pay=t.payment_id?db.payments.find(z=>Number(z.id)===Number(t.payment_id)):null;const app=applicationFor(t.application_id);if(app)app.status='Completed';const receiptResult=generateReceiptForCompletion(t,s.employee_id);if(pay&&!receiptResult?.generated){db.audit.unshift({id:newId(),action:'SERVICE_COMPLETED_WITHOUT_VERIFIED_PAYMENT',payment_id:pay.id,token_id:t.id,by:s.employee_id,at:t.completed_at})};customerEvent={severity:'success',title:'Service Completed',message:`Token ${t.token} की service complete हो गई है।`}}
      else if(x.action==='hold'){if(!tokenTransitionAllowed(t.status,'होल्ड'))return json(res,400,{error:'इस task state से Hold allowed नहीं है'});const reason=String(x.hold_reason||'').trim().slice(0,120);if(!reason)return json(res,400,{error:'Hold reason जरूरी है'});const delay=Number(x.hold_delay_minutes||0);if(!Number.isFinite(delay)||delay<0||delay>1440)return json(res,400,{error:'Hold delay 0 से 1440 minutes के बीच होना चाहिए'});t.status='होल्ड';t.hold_reason=reason;t.hold_owner=s.employee_id;t.hold_delay_minutes=delay||null;t.hold_started_at=now();t.hold_deadline=delay?new Date(Date.now()+delay*60000).toISOString():null;customerEvent={severity:'warning',title:'Token On Hold',message:`Token ${t.token} को hold किया गया है। Reason: ${reason}`}}
      else return json(res,400,{error:'Unknown task action'});
      t.last_action_at=now();t.state_revision=Number(t.state_revision||0)+1;if(tokenRequestId)t.last_action_request_id=tokenRequestId;if(customerEvent)notifyCustomer(t.mobile,'token',customerEvent.severity,customerEvent.title,customerEvent.message,{token_id:t.id,application_id:t.application_id||null,event_key:`staff-token:${t.id}:${t.state_revision}:${x.action}`,from_status:beforeStatus,to_status:t.status});
      const afterTokenState=tokenAuditSnapshot(t);const tokenAuditId=newId();
      db.audit.unshift({id:tokenAuditId,action:'STAFF_TASK_'+String(x.action).toUpperCase(),token_id:t.id,staff_id:s.staff_id,by:s.employee_id,state_revision:t.state_revision,request_id:tokenRequestId||null,from_status:beforeStatus,before:beforeTokenState,after:afterTokenState,at:now()});save();return json(res,200,staffTask(t))
    }
    if(p==='/api/staff'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{staff:db.staff.map(staffPublic)})}
    if(p==='/api/staff'&&req.method==='POST'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),pin=String(x.pin||''),role=String(x.role||'staff').trim().toLowerCase();
      if(!STAFF_ROLE_PERMISSIONS[role])return json(res,400,{error:'Invalid staff role. Allowed: viewer, staff, senior_staff, supervisor, manager'});
      if(!name||!validMobile(mobile)||!validPin(pin))return json(res,400,{error:'नाम, 10 digit mobile और 4–6 digit PIN जरूरी है'});if(db.staff.some(z=>z.mobile===mobile))return json(res,409,{error:'इस mobile से staff पहले से मौजूद है'});
      const h=pinHash(pin), seq=db.staff.length+1, st={id:newId(),staff_id:nextCode('staff','staff_id','STF',4),employee_id:nextCode('staff','employee_id','EMP',4),name,mobile,role,status:'active',daily_rate:Number(x.daily_rate||0),pin_hash:h.hash,pin_salt:h.salt,created_at:now(),updated_at:now()};db.staff.push(st);save();return json(res,200,staffPublic(st))
    }
    if(p.startsWith('/api/staff/')&&req.method==='POST'&&p!='/api/staff/login'&&p!='/api/staff/logout'&&p!='/api/staff/attendance'&&p!='/api/staff/commission'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const id=p.split('/').pop(),st=db.staff.find(z=>z.staff_id===id||String(z.id)===id);if(!st)return json(res,404,{error:'Staff नहीं मिला'});const x=await body(req);
      if(x.action==='deactivate'){st.status='inactive';db.staff_sessions.filter(z=>z.staff_id===st.staff_id&&!z.revoked_at).forEach(z=>z.revoked_at=now())}
      else if(x.action==='activate')st.status='active';
      else if(x.action==='assign'){const availability=staffAvailabilityToday(st);if(!availability.available)return json(res,409,{error:`Staff आज ${availability.label} है। किसी available staff को assign करें या Admin खुद token handle करें。`,availability:availability.label});const t=db.tokens.find(z=>Number(z.id)===Number(x.token_id));if(!t)return json(res,404,{error:'Token नहीं मिला'});if(!['लंबित','बुलाया','प्रगति','होल्ड'].includes(t.status))return json(res,400,{error:'Closed/skipped token assign नहीं किया जा सकता'});if(t.staff_id&&t.staff_id!==st.staff_id)return json(res,409,{error:'Token पहले से दूसरे staff को assigned है'});t.staff_id=st.staff_id;t.assigned_at=t.assigned_at||now();db.audit.unshift({id:newId(),action:'TOKEN_ASSIGNED',token_id:t.id,staff_id:st.staff_id,by:'admin',at:now()})}
      else if(x.action==='rate'){const r=Number(x.daily_rate);if(!Number.isFinite(r)||r<0||r>100000)return json(res,400,{error:'Invalid daily rate'});st.daily_rate=r;st.updated_at=now()}
      else if(x.action==='change_role'){const previous=staffRoleName(st),nextRole=String(x.role||'staff').trim().toLowerCase();if(!STAFF_ROLE_PERMISSIONS[nextRole])return json(res,400,{error:'Invalid staff role. Allowed: viewer, staff, senior_staff, supervisor, manager'});st.role=nextRole;st.updated_at=now();db.audit.unshift({id:newId(),action:'PERMISSION_ROLE_CHANGED',staff_id:st.staff_id,employee_id:st.employee_id,previous_role:previous,new_role:nextRole,by:'admin',at:now(),reason:String(x.reason||'').trim().slice(0,300)})}
      else return json(res,400,{error:'Unknown staff action'});
      db.audit.unshift({id:newId(),action:'ADMIN_STAFF_ACTIVITY',staff_id:st.staff_id,employee_id:st.employee_id,activity:String(x.action||'').toUpperCase(),by:'admin',at:now()});
      save();return json(res,200,{staff:staffPublic(st)})
    }


    if(p==='/api/customer/home-services'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});return json(res,200,{home_services:db.home_services.filter(x=>x.customer_id===c.customer_id).map(publicHome)});
    }
    if(p==='/api/customer/home-services'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const x=await body(req),service=String(x.service||'').trim(),address=String(x.address||'').trim(),preferredDate=String(x.preferred_date||'').trim(),preferredTime=String(x.preferred_time||'').trim();if(!serviceExists(service)||!address)return json(res,400,{error:'Valid service और address जरूरी हैं'});if(preferredDate){const d=new Date(preferredDate+'T'+(preferredTime||'00:00'));if(Number.isNaN(d.getTime())||d<new Date(Date.now()-60000))return json(res,400,{error:'Past home-service date/time allowed नहीं है'});}const st=costSettings();const h={id:newId(),home_service_id:nextCode('home_services','home_service_id','HOME',5),customer_id:c.customer_id,name:c.name,mobile:c.mobile,service,address,preferred_date:preferredDate,preferred_time:preferredTime,status:'Requested',staff_id:null,home_service_fee:money(x.home_service_fee??st.default_home_fee),travel_cost:money(x.travel_cost??0),staff_allowance:money(x.staff_allowance??st.default_home_staff_allowance),created_at:now(),assigned_at:null,completed_at:null};db.home_services.unshift(h);db.audit.unshift({id:newId(),action:'CUSTOMER_HOME_SERVICE_REQUESTED',home_service_id:h.home_service_id,customer_id:c.customer_id,by:c.mobile,at:now()});save();return json(res,201,publicHome(h));
    }
    if(p==='/api/customer/deliveries'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});return json(res,200,{deliveries:db.deliveries.filter(x=>x.customer_id===c.customer_id).map(publicDelivery)});
    }
    if(p==='/api/staff/proof'&&req.method==='POST'){
      const sa=staffAuth(req),aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'task_update'))return json(res,403,{error:'इस staff role को proof upload करने की अनुमति नहीं है'});
      const x=await body(req);let proof;try{proof=safeImageToDir(x.proof_data,STAFF_PROOF_UPLOAD_DIR)}catch(e){return json(res,400,{error:e.message})}
      const by=aa?.user||sa?.employee_id||'staff';db.audit.unshift({id:newId(),action:'STAFF_PROOF_UPLOADED',proof_file:proof.filename,sha256:proof.sha256,size:proof.size,mime:proof.mime,context:String(x.context||'').slice(0,40),entity_id:String(x.entity_id||'').slice(0,80),by,at:now()});save();return json(res,201,{proof_reference:proof.url,proof_file:proof.filename,sha256:proof.sha256,size:proof.size,mime:proof.mime});
    }
    if(p==='/api/staff/signature'&&req.method==='POST'){
      const sa=staffAuth(req),aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'task_update'))return json(res,403,{error:'इस staff role को signature upload करने की अनुमति नहीं है'});
      const x=await body(req);let sig;try{sig=safeImageToDir(x.signature_data,STAFF_PROOF_UPLOAD_DIR)}catch(e){return json(res,400,{error:e.message})}
      const by=aa?.user||sa?.employee_id||'staff';db.audit.unshift({id:newId(),action:'STAFF_SIGNATURE_UPLOADED',signature_file:sig.filename,sha256:sig.sha256,size:sig.size,mime:sig.mime,context:String(x.context||'').slice(0,40),entity_id:String(x.entity_id||'').slice(0,80),by,at:now()});save();return json(res,201,{signature_reference:sig.url,signature_file:sig.filename,sha256:sig.sha256,size:sig.size,mime:sig.mime});
    }
    if(p.startsWith('/api/staff/proof/')&&req.method==='GET'){
      const sa=staffAuth(req),aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'task_update'))return json(res,403,{error:'इस staff role को proof देखने की अनुमति नहीं है'});const name=path.basename(decodeURIComponent(p.slice('/api/staff/proof/'.length)));if(!/^[0-9a-f-]+\.(?:png|jpg|webp)$/.test(name))return json(res,400,{error:'Invalid proof file'});const fp=path.join(STAFF_PROOF_UPLOAD_DIR,name);if(!fs.existsSync(fp))return json(res,404,{error:'Proof not found'});const ext=path.extname(fp).toLowerCase(),ct=ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b)
    }
    if(p==='/api/home-services'&&req.method==='GET'){
      const a=admin(req); if(!a)return json(res,401,{error:'Unauthorized'});
      return json(res,200,{home_services:db.home_services.map(publicHome).sort((a,b)=>Number(b.id)-Number(a.id))});
    }
    if(p==='/api/home-services'&&req.method==='POST'){
      const a=admin(req); if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),address=String(x.address||'').trim();
      if(!name||!validMobile(mobile)||!serviceExists(service)||!address)return json(res,400,{error:'Name, valid mobile, valid service और address जरूरी हैं'});
      const c=ensureCustomer(name,mobile), st=costSettings();
      const fee=money(x.home_service_fee??st.default_home_fee), travel=money(x.travel_cost??0), allowance=money(x.staff_allowance??st.default_home_staff_allowance);
      const h={id:newId(),home_service_id:nextCode('home_services','home_service_id','HOME',5),customer_id:c.customer_id,name,mobile,service,address,preferred_date:String(x.preferred_date||''),preferred_time:String(x.preferred_time||''),status:'Requested',staff_id:null,home_service_fee:fee,travel_cost:travel,staff_allowance:allowance,created_at:now(),assigned_at:null,completed_at:null};
      db.home_services.unshift(h);db.audit.unshift({id:newId(),action:'HOME_SERVICE_CREATED',home_service_id:h.home_service_id,customer_id:c.customer_id,by:a.user||'admin',at:now()});save();return json(res,201,publicHome(h));
    }
    if(p.startsWith('/api/home-services/')&&req.method==='POST'){
      const id=Number(p.split('/').pop()),x=await body(req),h=db.home_services.find(z=>Number(z.id)===id);if(!h)return json(res,404,{error:'Home service नहीं मिला'});
      const sa=staffAuth(req); const aa=admin(req); if(!sa&&!aa)return json(res,401,{error:'Authentication required'});
      if(sa&&!staffHasPermission(sa.record,'task_update'))return json(res,403,{error:'इस staff role को home service update करने की अनुमति नहीं है'});
      if(x.action==='assign'){if(!aa)return json(res,403,{error:'Admin only'});if(!['Requested','Assigned'].includes(h.status))return json(res,400,{error:'इस home service state में assignment allowed नहीं है'});const st=db.staff.find(z=>z.staff_id===String(x.staff_id)&&z.status==='active');if(!st)return json(res,400,{error:'Active staff नहीं मिला'});h.staff_id=st.staff_id;h.assigned_at=h.assigned_at||now();h.status='Assigned'}
      else if(x.action==='start'){if(!sa||h.staff_id!==sa.staff_id)return json(res,403,{error:'यह home service आपके लिए assigned नहीं है'});if(h.status!=='Assigned')return json(res,400,{error:'Start के लिए home service Assigned होना चाहिए'});h.status='In Progress'}
      else if(x.action==='complete'){if(!sa||h.staff_id!==sa.staff_id)return json(res,403,{error:'यह home service आपके लिए assigned नहीं है'});if(h.status!=='In Progress')return json(res,400,{error:'Complete के लिए home service In Progress होना चाहिए'});const note=String(x.completion_note||'').trim(),proof=String(x.proof_reference||'').trim();if(note.length<5||note.length>500)return json(res,400,{error:'Completion note 5 से 500 characters जरूरी है'});if(proof.length>200)return json(res,400,{error:'Proof reference अधिकतम 200 characters हो सकता है'});h.completion_note=note;h.proof_reference=proof||null;h.completed_by=sa.employee_id||sa.staff_id;h.status='Completed';h.completed_at=now()}
      else if(x.action==='cancel'){if(!aa)return json(res,403,{error:'Admin only'});if(['Completed','Cancelled'].includes(h.status))return json(res,400,{error:'Completed/Cancelled home service को cancel नहीं किया जा सकता'});h.status='Cancelled'}
      else return json(res,400,{error:'Unknown action'});
      db.audit.unshift({id:newId(),action:'HOME_SERVICE_'+String(x.action).toUpperCase(),home_service_id:h.home_service_id,staff_id:h.staff_id||null,by:aa?.user||sa?.employee_id||'system',at:now()});save();return json(res,200,publicHome(h));
    }
    if(p==='/api/deliveries'&&req.method==='GET'){
      const a=admin(req); if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{deliveries:db.deliveries.map(publicDelivery).sort((a,b)=>Number(b.id)-Number(a.id))});
    }
    if(p==='/api/deliveries'&&req.method==='POST'){
      const a=admin(req); if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),address=String(x.address||'').trim();if(!name||!validMobile(mobile)||!address)return json(res,400,{error:'Name, valid mobile और address जरूरी हैं'});
      const c=ensureCustomer(name,mobile),st=costSettings(),d={id:newId(),delivery_id:nextCode('deliveries','delivery_id','DEL',5),customer_id:c.customer_id,name,mobile,token_id:x.token_id?Number(x.token_id):null,address,status:'Ready',delivery_fee:money(x.delivery_fee??st.default_delivery_fee),actual_cost:money(x.actual_cost??0),staff_allowance:money(x.staff_allowance??st.default_delivery_staff_allowance),staff_id:null,created_at:now(),assigned_at:null,delivered_at:null};db.deliveries.unshift(d);db.audit.unshift({id:newId(),action:'DELIVERY_CREATED',delivery_id:d.delivery_id,customer_id:c.customer_id,by:a.user||'admin',at:now()});save();return json(res,201,publicDelivery(d));
    }
    if(p.startsWith('/api/deliveries/')&&req.method==='POST'){
      const id=Number(p.split('/').pop()),x=await body(req),d=db.deliveries.find(z=>Number(z.id)===id);if(!d)return json(res,404,{error:'Delivery नहीं मिली'});const sa=staffAuth(req),aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'task_update'))return json(res,403,{error:'इस staff role को delivery update करने की अनुमति नहीं है'});
      if(x.action==='assign'){if(!aa)return json(res,403,{error:'Admin only'});if(!['Ready','Assigned'].includes(d.status))return json(res,400,{error:'इस delivery state में assignment allowed नहीं है'});const st=db.staff.find(z=>z.staff_id===String(x.staff_id)&&z.status==='active');if(!st)return json(res,400,{error:'Active staff नहीं मिला'});d.staff_id=st.staff_id;d.assigned_at=d.assigned_at||now();d.status='Assigned'}
      else if(['pickup','out_for_delivery','deliver'].includes(x.action)){if(!sa||d.staff_id!==sa.staff_id)return json(res,403,{error:'यह delivery आपके लिए assigned नहीं है'});const expected={pickup:'Assigned',out_for_delivery:'Picked Up',deliver:'Out for Delivery'}[x.action];if(d.status!==expected)return json(res,400,{error:`${x.action} के लिए current status ${expected} होना चाहिए`});if(x.action==='deliver'){const note=String(x.delivery_note||'').trim(),proof=String(x.proof_reference||'').trim(),signature=String(x.signature_reference||'').trim();if(note.length<5||note.length>500)return json(res,400,{error:'Delivery note 5 से 500 characters जरूरी है'});if(proof.length>200)return json(res,400,{error:'Proof reference अधिकतम 200 characters हो सकता है'});if(signature.length>200)return json(res,400,{error:'Signature reference अधिकतम 200 characters हो सकता है'});d.delivery_note=note;d.proof_reference=proof||null;d.signature_reference=signature||null;d.delivered_by=sa.employee_id||sa.staff_id;d.delivered_at=now()}d.status={pickup:'Picked Up',out_for_delivery:'Out for Delivery',deliver:'Delivered'}[x.action]}
      else if(x.action==='cancel'){if(!aa)return json(res,403,{error:'Admin only'});if(['Delivered','Cancelled'].includes(d.status))return json(res,400,{error:'Delivered/Cancelled delivery को cancel नहीं किया जा सकता'});d.status='Cancelled'}
      else return json(res,400,{error:'Unknown action'});
      db.audit.unshift({id:newId(),action:'DELIVERY_'+String(x.action).toUpperCase(),delivery_id:d.delivery_id,staff_id:d.staff_id||null,by:aa?.user||sa?.employee_id||'system',at:now()});save();return json(res,200,publicDelivery(d));
    }
    if(p==='/api/staff/attendance'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const staffId=u.searchParams.get('staff_id')||'',from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{attendance:staffAttendanceRows(staffId,from,to)});
    }
    if(p==='/api/staff/attendance'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),staffId=String(x.staff_id||''),date=String(x.date||today()).slice(0,10),status=String(x.status||'present');
      if(!db.staff.some(z=>z.staff_id===staffId))return json(res,404,{error:'Staff नहीं मिला'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['present','absent','half_day','leave','holiday'].includes(status))return json(res,400,{error:'Valid staff, date और attendance status जरूरी है'});
      let r=db.staff_attendance.find(z=>z.staff_id===staffId&&z.date===date);if(r){r.status=status;r.updated_at=now();r.updated_by=a.user||'admin'}else{r={id:newId(),staff_id:staffId,date,status,created_at:now(),updated_at:now(),updated_by:a.user||'admin'};db.staff_attendance.unshift(r)}
      db.audit.unshift({id:newId(),action:'STAFF_ATTENDANCE_'+status.toUpperCase(),staff_id:staffId,date,by:a.user||'admin',at:now()});save();return json(res,200,r);
    }
    if(p==='/api/staff/commission'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),staffId=String(x.staff_id||''),amount=Number(x.amount||0);if(!db.staff.some(z=>z.staff_id===staffId))return json(res,404,{error:'Staff नहीं मिला'});if(!Number.isFinite(amount)||amount<0)return json(res,400,{error:'Valid commission amount जरूरी है'});
      const sourceType=String(x.source_type||'manual'),sourceId=x.source_id||null;if(sourceId&&db.commissions.some(z=>z.staff_id===staffId&&String(z.source_type||'')===sourceType&&String(z.source_id||'')===String(sourceId)))return json(res,409,{error:'इस source के लिए commission पहले से मौजूद है'});const c={id:newId(),staff_id:staffId,amount:money(amount),source_type:sourceType,source_id:sourceId,note:String(x.note||'').slice(0,300),created_at:now(),created_by:a.user||'admin'};db.commissions.unshift(c);db.audit.unshift({id:newId(),action:'STAFF_COMMISSION_CREATED',commission_id:c.id,staff_id:staffId,amount:c.amount,by:a.user||'admin',at:c.created_at});save();return json(res,201,c);
    }
    if(p==='/api/finance/staff-summary'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{period:{from,to},staff:financeStaffSummary(from,to)});
    }
    if(p==='/api/finance/settlements'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{settlements:db.settlements.filter(x=>(!from||x.from===from)&&(!to||x.to===to))});
    }
    if(p==='/api/finance/settlements'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),from=String(x.from||'').slice(0,10),to=String(x.to||'').slice(0,10),staffId=String(x.staff_id||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return json(res,400,{error:'Valid from/to date जरूरी है'});const rows=staffId?[settlementForStaff(staffId,from,to)].filter(Boolean):financeStaffSummary(from,to);if(staffId&&!rows.length)return json(res,404,{error:'Staff नहीं मिला'});
      const created=[];for(const r of rows){const existing=db.settlements.find(z=>z.staff_id===r.staff_id&&z.from===from&&z.to===to&&['pending','paid'].includes(z.status));if(existing)continue;const s={id:newId(),settlement_id:'SET-'+String(newId()).slice(-10)+'-'+String(r.staff_id).replace(/\W/g,''),staff_id:r.staff_id,from,to,base_salary:r.base_salary,commission:r.commission,home_allowance:r.home_allowance,delivery_allowance:r.delivery_allowance,advances:r.advances,net_payable:r.net_payable,status:'pending',created_at:now(),created_by:a.user||'admin'};db.settlements.unshift(s);created.push(s)}save();return json(res,201,{settlements:created});
    }
    if(p.startsWith('/api/finance/settlements/')&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),s=db.settlements.find(z=>Number(z.id)===id);if(!s)return json(res,404,{error:'Settlement नहीं मिला'});const x=await body(req);if(x.action==='paid'){if(s.status==='paid')return json(res,409,{error:'Settlement पहले ही paid है'});s.status='paid';s.paid_at=now();s.paid_by=a.user||'admin'}else if(x.action==='cancel'){if(s.status==='paid')return json(res,409,{error:'Paid settlement cancel नहीं किया जा सकता'});s.status='cancelled';s.cancelled_at=now()}else return json(res,400,{error:'Unknown settlement action'});db.audit.unshift({id:newId(),action:'SETTLEMENT_'+s.status.toUpperCase(),settlement_id:s.settlement_id,staff_id:s.staff_id,by:a.user||'admin',at:now()});save();return json(res,200,s);
    }
    if(p==='/api/finance/expenses'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{expenses:db.expenses.filter(x=>inDateRange(x.created_at,from,to)).sort((a,b)=>Number(b.id)-Number(a.id))});
    }
    if(p==='/api/finance/expenses'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),amount=Number(x.amount||0),type=String(x.type||'operating').slice(0,50),note=String(x.note||'').slice(0,300),staffId=x.staff_id?String(x.staff_id):null;if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Valid expense amount जरूरी है'});if(staffId&&!db.staff.some(z=>z.staff_id===staffId))return json(res,404,{error:'Staff नहीं मिला'});const e={id:newId(),type,amount:money(amount),note,staff_id:staffId,created_at:now(),created_by:a.user||'admin'};db.expenses.unshift(e);db.audit.unshift({id:newId(),action:'EXPENSE_CREATED',expense_id:e.id,type:e.type,amount:e.amount,by:a.user||'admin',at:e.created_at});save();return json(res,201,e);
    }
    if(p==='/api/finance/summary'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{period:{from,to},summary:financeSummary(from,to),defaults:costSettings()});
    }
    if(p==='/api/finance/settings'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),keys=['default_home_fee','default_delivery_fee','default_home_staff_allowance','default_delivery_staff_allowance'];for(const k of keys){if(x[k]!==undefined){const v=Number(x[k]);if(!Number.isFinite(v)||v<0||v>100000)return json(res,400,{error:'Invalid '+k});db.settings[k]=money(v)}}save();return json(res,200,{defaults:costSettings()});
    }
    if(p==='/api/staff/earnings'&&req.method==='GET'){
      const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});const sid=s.staff_id;const home=db.home_services.filter(x=>x.staff_id===sid),del=db.deliveries.filter(x=>x.staff_id===sid),tokens=db.tokens.filter(x=>x.staff_id===sid);const commission=money(db.commissions.filter(x=>x.staff_id===sid).reduce((a,x)=>a+Number(x.amount||0),0));const homeAllowance=money(home.reduce((a,x)=>a+Number(x.staff_allowance||0),0)),deliveryAllowance=money(del.reduce((a,x)=>a+Number(x.staff_allowance||0),0));return json(res,200,{staff:staffPublic(s.record),summary:{token_count:tokens.length,commission,home_allowance:homeAllowance,delivery_allowance:deliveryAllowance,total_earned:money(commission+homeAllowance+deliveryAllowance)}});
    }
    if(p==='/api/customer/register'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown', key='r:'+ip; const nowMs=Date.now(), a=customerLoginAttempts.get(key)||{n:0,at:nowMs}; if(nowMs-a.at>15*60*1000){a.n=0;a.at=nowMs} if(a.n>=10)return json(res,429,{error:'बहुत अधिक attempts. 15 मिनट बाद फिर कोशिश करें।'}); const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),pin=String(x.pin||''),claimToken=String(x.claim_token||'').trim();
      if(!name||!validMobile(mobile)||!validPin(pin))return json(res,400,{error:'नाम, 10 digit mobile और 4–6 digit PIN जरूरी है'});
      let c=db.customers.find(z=>z.mobile===mobile); if(c&&c.pin_hash)return json(res,409,{error:'इस mobile से customer account पहले से बना है। Login करें।'});
      if(c&&!c.pin_hash){if(!claimToken)return json(res,403,{error:'यह mobile Guest Application से जुड़ा है। Account बनाने के लिए Guest Application token जरूरी है।'});let claim;try{claim=verify(claimToken,'customer')}catch{claim=null}if(!claim||claim.kind!=='customer'||claim.mobile!==mobile||claim.name!==name||!claim.application_id)return json(res,403,{error:'Guest Application claim token invalid है।'});const claimedApp=db.applications.find(a=>Number(a.id)===Number(claim.application_id)&&a.mobile===mobile);if(!claimedApp)return json(res,403,{error:'Guest Application claim token expired/invalid है।'});}
      const h=pinHash(pin); if(!c){const id=STORAGE.customerIdFor(mobile);c={id:newId(),customer_id:id,name,mobile,status:'active',pin_hash:h.hash,pin_salt:h.salt,pin_set:true,created_at:now(),updated_at:now()};db.customers.push(c)}else{c.name=c.name||name;c.pin_hash=h.hash;c.pin_salt=h.salt;c.pin_set=true;c.status=c.status||'active';c.updated_at=now()}
      const sid=crypto.randomBytes(18).toString('hex');const session=customerSessionFor(c,sid);db.customer_sessions.unshift({id:newId(),sid,customer_id:c.customer_id,mobile:c.mobile,created_at:now(),expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'CUSTOMER_REGISTERED',customer_id:c.customer_id,by:c.mobile,at:now()});save();setAuthCookies(res,req,{customerToken:session});return json(res,201,{customer:customerPublic(c),qr_payload:qrPayloadFor(c)})
    }
    if(p==='/api/customer/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown', key='l:'+ip, nowMs=Date.now(), a=customerLoginAttempts.get(key)||{n:0,at:nowMs}; if(nowMs-a.at>15*60*1000){a.n=0;a.at=nowMs} if(a.n>=10)return json(res,429,{error:'बहुत अधिक login attempts. 15 मिनट बाद फिर कोशिश करें।'}); const x=await body(req),identifier=String(x.identifier||x.mobile||x.customer_id||'').trim(),pin=String(x.pin||''); const c=customerRecordByIdentifier(identifier); const pinOk=c&&c.pin_hash&&c.pin_salt?pinVerify(pin,c.pin_salt,c.pin_hash):pinVerify(pin,dummyPinCredential().salt,dummyPinCredential().hash); if(!c||!pinOk){a.n++;a.at=nowMs;customerLoginAttempts.set(key,a);return json(res,401,{error:'Customer ID/mobile या PIN गलत है'})} customerLoginAttempts.delete(key); const sid=crypto.randomBytes(18).toString('hex');const session=customerSessionFor(c,sid);db.customer_sessions.unshift({id:newId(),sid,customer_id:c.customer_id,mobile:c.mobile,created_at:now(),expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'CUSTOMER_LOGIN',customer_id:c.customer_id,by:c.mobile,at:now()});save();setAuthCookies(res,req,{customerToken:session});return json(res,200,{customer:customerPublic(c),qr_payload:qrPayloadFor(c)})
    }
    if(p==='/api/customer/me'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const row=db.customers.find(z=>z.customer_id===c.customer_id&&z.mobile===c.mobile);if(!row)return json(res,404,{error:'Customer account नहीं मिला'});return json(res,200,{customer:customerPublic(row),qr_payload:qrPayloadFor(row)})
    }
    if(p==='/api/customer/logout'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});db.customer_sessions.forEach(s=>{if(s.customer_id===c.customer_id&&!s.revoked_at)s.revoked_at=now()});db.audit.unshift({id:newId(),action:'CUSTOMER_LOGOUT',customer_id:c.customer_id,by:c.mobile,at:now()});save();setAuthCookies(res,req,{clear:true});return json(res,200,{ok:true})
    }
    if(p==='/api/auth/logout'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const row=db.admin_sessions.find(x=>x.sid===a.sid);if(row)row.revoked_at=now();db.audit.unshift({id:newId(),action:'ADMIN_LOGOUT',by:a.user||'admin',at:now()});save();setAuthCookies(res,req,{clear:true});return json(res,200,{ok:true});
    }
    if(p==='/api/admin/financial-report'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const from=String(u.searchParams.get('from')||'').trim(),to=String(u.searchParams.get('to')||'').trim();
      if(from&&to&&from>to)return json(res,400,{error:'From date cannot be after To date'});
      return json(res,200,unifiedFinancialReport(from,to));
    }
    if(p==='/api/admin/financial-report.pdf'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const from=String(u.searchParams.get('from')||'').trim(),to=String(u.searchParams.get('to')||'').trim();
      if(from&&to&&from>to)return json(res,400,{error:'From date cannot be after To date'});
      const report=unifiedFinancialReport(from,to),pdf=financialReportPdf(report);
      res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="angelstore-financial-report.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':pdf.length});return res.end(pdf);
    }
    if(p==='/api/admin/settlement.pdf'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const id=Number(u.searchParams.get('id')||0);const row=(db.staff_settlements||[]).find(x=>Number(x.id)===id);
      if(!row)return json(res,404,{error:'Settlement नहीं मिला'});
      const pdf=settlementPdf(row);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${String(row.settlement_id||'settlement').replace(/[^A-Za-z0-9_-]/g,'_')}.pdf"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':pdf.length});return res.end(pdf);
    }
    if(p==='/api/admin/financial-ledger'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const audit=financialLedgerAudit();
      const limit=Math.min(300,Math.max(1,Number(u.searchParams.get('limit')||100)));
      return json(res,200,{...audit,entries:(db.financial_ledger||[]).slice(0,limit)});
    }
    if(p==='/api/admin/payment-lifecycle'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      return json(res,200,globalPaymentLifecycleAudit());
    }
    if(p==='/api/admin/payment-lifecycle/transition'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),domain=String(x.domain||'payment').trim(),id=Number(x.id),next=String(x.status||'').trim();
      if(!Number.isFinite(id)||!next)return json(res,400,{error:'Valid lifecycle id और target status जरूरी है'});
      if(domain==='payment'){
        const pay=db.payments.find(z=>Number(z.id)===id);if(!pay)return json(res,404,{error:'Payment नहीं मिला'});
        if(!lifecycleCanMove(PAYMENT_LIFECYCLE,pay.status,next))return json(res,409,{error:`Payment transition ${pay.status} → ${next} allowed नहीं है।`});
        return json(res,409,{error:'Payment lifecycle transition केवल existing verification workflow से perform करें। Direct transition endpoint audit-only है।'});
      }
      if(domain==='recharge'){
        const row=(db.recharge_transactions||[]).find(z=>Number(z.id)===id);if(!row)return json(res,404,{error:'Recharge नहीं मिला'});
        if(!lifecycleCanMove(RECHARGE_LIFECYCLE,row.status,next))return json(res,409,{error:`Recharge transition ${row.status} → ${next} allowed नहीं है।`});
        return json(res,409,{error:'Recharge lifecycle transition केवल controlled recharge workflow से perform करें। Direct transition endpoint audit-only है।'});
      }
      return json(res,400,{error:'Unsupported lifecycle domain'});
    }
    if(p==='/api/admin/payment-reconciliation'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      return json(res,200,globalPaymentReconciliation());
    }
    if(p==='/api/admin/payment-reconciliation/review'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),type=String(x.type||'').trim().slice(0,100),note=String(x.note||'').trim().slice(0,300);
      if(!type)return json(res,400,{error:'Issue type जरूरी है'});
      const at=now();db.audit.unshift({id:newId(),action:'GLOBAL_RECONCILIATION_REVIEWED',issue_type:type,payment_id:Number(x.payment_id)||null,recharge_id:Number(x.recharge_id)||null,application_id:Number(x.application_id)||null,note,by:a.user||db.settings.operator||'Admin',at});save();
      return json(res,200,{ok:true,message:'Issue review audit में दर्ज हो गया।'});
    }

    if(p==='/api/admin/payment-reconciliation/recover'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),action=String(x.action||'').trim(),paymentId=Number(x.payment_id)||null,rechargeId=Number(x.recharge_id)||null,applicationId=Number(x.application_id)||null;
      const allowed=new Set(['repair_uppcl_receipt','sync_application_payment_status','link_recharge_application']);
      if(!allowed.has(action))return json(res,400,{error:'Unsupported global recovery action'});
      const pay=paymentId?db.payments.find(z=>Number(z.id)===paymentId):null;
      const rec=rechargeId?db.recharge_transactions.find(z=>Number(z.id)===rechargeId):null;
      const app=applicationId?db.applications.find(z=>Number(z.id)===applicationId):null;
      const before={payment:pay?JSON.parse(JSON.stringify(pay)):null,recharge:rec?JSON.parse(JSON.stringify(rec)):null,application:app?JSON.parse(JSON.stringify(app)):null};
      const at=now();let changed=false,message='';
      if(action==='repair_uppcl_receipt'){
        if(!pay||pay.service!=='UPPCL Bill Payment')return json(res,404,{error:'UPPCL payment नहीं मिला'});
        if(pay.status!=='Verified'||pay.uppcl_processing_status!=='Completed')return json(res,409,{error:'केवल Verified + Completed UPPCL payment की receipt repair की जा सकती है'});
        if(pay.receipt_no)return json(res,409,{error:'Receipt पहले से मौजूद है'});
        pay.receipt_no='RCP-UPPCL-'+String(pay.id).slice(-8);pay.receipt_generated_at=pay.receipt_generated_at||pay.completed_at||at;pay.completed_by=pay.completed_by||a.user||db.settings.operator||'Admin';
        db.audit.unshift({id:newId(),action:'RECEIPT_AUTO_GENERATED',payment_id:pay.id,receipt_no:pay.receipt_no,by:a.user||'Admin',at});changed=true;message='UPPCL receipt number repaired.';
      } else if(action==='sync_application_payment_status'){
        if(!pay||!app)return json(res,404,{error:'Payment/Application नहीं मिला'});
        if(Number(pay.application_id)!==Number(app.id))return json(res,409,{error:'Payment और application link match नहीं करता'});
        if(pay.status!=='Verified')return json(res,409,{error:'Payment Verified होना जरूरी है'});
        if(!['Payment Pending','Payment Verification Pending'].includes(String(app.status||'')))return json(res,409,{error:'Application current status controlled sync के लिए eligible नहीं है'});
        app.status='Payment Verified';app.payment_reconciled_at=at;app.payment_reconciled_by=a.user||'Admin';changed=true;message='Application payment status synchronized.';
      } else if(action==='link_recharge_application'){
        if(!rec||!pay)return json(res,404,{error:'Recharge/Payment नहीं मिला'});
        if(Number(rec.payment_id)!==Number(pay.id))return json(res,409,{error:'Recharge और payment link match नहीं करता'});
        if(!pay.application_id)return json(res,409,{error:'Linked payment में application reference नहीं है'});
        if(rec.application_id)return json(res,409,{error:'Recharge application link पहले से मौजूद है'});
        if(!db.applications.some(z=>Number(z.id)===Number(pay.application_id)))return json(res,409,{error:'Payment application reference invalid है'});
        rec.application_id=Number(pay.application_id);rec.reconciliation_linked_at=at;rec.reconciliation_linked_by=a.user||'Admin';changed=true;message='Recharge application link repaired.';
      }
      if(!changed)return json(res,409,{error:'No controlled change was made'});
      const auditId=newId();db.audit.unshift({id:auditId,action:'GLOBAL_RECONCILIATION_REPAIRED',recovery_action:action,payment_id:paymentId,recharge_id:rechargeId,application_id:applicationId,before,after:{payment:pay?JSON.parse(JSON.stringify(pay)):null,recharge:rec?JSON.parse(JSON.stringify(rec)):null,application:app?JSON.parse(JSON.stringify(app)):null},by:a.user||db.settings.operator||'Admin',at});save();
      return json(res,200,{ok:true,audit_id:auditId,message,repair:{action,payment_id:paymentId,recharge_id:rechargeId,application_id:applicationId}});
    }
    if(p==='/api/admin/payment-reconciliation/rollback'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req),auditId=String(x.audit_id||'').trim();
      const entry=(db.audit||[]).find(z=>String(z.id)===auditId&&z.action==='GLOBAL_RECONCILIATION_REPAIRED');
      if(!entry||!entry.before)return json(res,404,{error:'Recovery snapshot नहीं मिला'});
      if((db.audit||[]).some(z=>z.action==='GLOBAL_RECONCILIATION_ROLLED_BACK'&&String(z.source_audit_id)===auditId))return json(res,409,{error:'यह recovery पहले ही rollback हो चुकी है'});
      const restore=(collection,id,snapshot)=>{if(!snapshot)return;const rows=db[collection];const idx=rows.findIndex(z=>Number(z.id)===Number(id));if(idx<0)throw new Error(collection+' record नहीं मिला');rows[idx]=snapshot;};
      try{if(entry.before.payment)restore('payments',entry.payment_id,entry.before.payment);if(entry.before.recharge)restore('recharge_transactions',entry.recharge_id,entry.before.recharge);if(entry.before.application)restore('applications',entry.application_id,entry.before.application)}catch(e){return json(res,409,{error:'Rollback validation failed: '+e.message})}
      const at=now();db.audit.unshift({id:newId(),action:'GLOBAL_RECONCILIATION_ROLLED_BACK',source_audit_id:auditId,recovery_action:entry.recovery_action,payment_id:entry.payment_id||null,recharge_id:entry.recharge_id||null,application_id:entry.application_id||null,by:a.user||'Admin',at});save();return json(res,200,{ok:true,message:'Recovery rollback completed.',source_audit_id:auditId});
    }
    if(p==='/api/admin/backup'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const b=await createManagedBackup('manual');return json(res,201,{backup:{name:b.name,created_at:b.created_at,proof_files:b.proof_files||0,offsite:b.offsite,pruned_local:b.pruned_local}});
    }
    if(p==='/api/admin/backup-status'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const backups=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x)).sort().reverse();return json(res,200,{scheduled_enabled:SCHEDULED_BACKUP_ENABLED,interval_hours:SCHEDULED_BACKUP_HOURS,retention:BACKUP_RETENTION,offsite_configured:!!OFFSITE_BACKUP_URL,backup_count:backups.length,last_backup:backups[0]||null,checked_at:now()});
    }
    if(p==='/api/admin/backups'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const backups=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x)).map(name=>{const st=fs.statSync(path.join(BACKUP_DIR,name));let proof_files=0;try{const m=JSON.parse(fs.readFileSync(path.join(BACKUP_DIR,name+'.uploads','manifest.json'),'utf8'));proof_files=Array.isArray(m.payment_proofs)?m.payment_proofs.length:(Array.isArray(m.files)?m.files.length:0)}catch{}return {name,created_at:st.birthtime.toISOString(),size:st.size,proof_files}}).sort((a,b)=>b.created_at.localeCompare(a.created_at));return json(res,200,{backups});
    }
    if(p==='/api/admin/backup/verify'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req);try{const result=verifyManagedBackup(path.basename(String(x.name||'')));db.audit.unshift({id:newId(),action:'BACKUP_VERIFIED',file:result.name,database_sha256:result.database_sha256,by:a.user||'admin',at:result.verified_at});save();return json(res,200,result)}catch(e){db.audit.unshift({id:newId(),action:'BACKUP_VERIFY_FAILED',file:String(x.name||'').slice(0,160),reason:String(e.message||e).slice(0,300),by:a.user||'admin',at:now()});save();return json(res,400,{ok:false,error:e.message})}
    }
    if(p.startsWith('/api/admin/backups/')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const name=path.basename(decodeURIComponent(p.slice('/api/admin/backups/'.length)));if(!/^angelstore-[\w.-]+\.json$/.test(name))return json(res,400,{error:'Invalid backup name'});const fp=path.join(BACKUP_DIR,name);if(!fs.existsSync(fp))return json(res,404,{error:'Backup नहीं मिला'});const b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p==='/api/admin/restore'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),name=path.basename(String(x.name||'')),currentPassword=String(x.current_password||'');const cred=adminCredential();if(!currentPassword||!cred||!adminPasswordVerify(currentPassword,cred.salt,cred.hash))return json(res,403,{error:'Restore के लिए current Admin password दोबारा verify करना जरूरी है'});if(!/^angelstore-[\w.-]+\.json$/.test(name))return json(res,400,{error:'Valid backup name जरूरी है'});const fp=path.join(BACKUP_DIR,name);if(!fs.existsSync(fp))return json(res,404,{error:'Backup नहीं मिला'});try{verifyManagedBackup(name)}catch(e){return json(res,400,{error:'Backup integrity verification failed: '+e.message})}let parsed;try{parsed=JSON.parse(fs.readFileSync(fp,'utf8'))}catch{return json(res,400,{error:'Backup file invalid है'})}let validated;try{validated=STORAGE.migrate(parsed)}catch{return json(res,400,{error:'Backup structure invalid है'})}
      const before=backupFile();
      const snapshotDir=path.join(BACKUP_DIR,name+'.uploads');
      let manifest={version:1,files:[]};
      const manifestPath=path.join(snapshotDir,'manifest.json');
      if(fs.existsSync(manifestPath)){try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{return json(res,400,{error:'Backup upload manifest invalid है'})}}
      const paymentItems=manifest.version===2?(Array.isArray(manifest.payment_proofs)?manifest.payment_proofs:[]):(Array.isArray(manifest.files)?manifest.files:[]);
      const documentItems=manifest.version===2?(Array.isArray(manifest.documents)?manifest.documents:[]):[];
      const validateItems=(items,subdir,pattern,label)=>{
        const out=[];for(const item of items){
          if(!item||typeof item.name!=='string'||!pattern.test(item.name))throw new Error('Backup contains invalid '+label+' filename');
          const src=path.join(snapshotDir,subdir,path.basename(item.name));if(!fs.existsSync(src))throw new Error('Backup '+label+' missing है');
          const bytes=fs.readFileSync(src),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==String(item.sha256).toLowerCase())throw new Error('Backup '+label+' checksum mismatch');out.push({name:path.basename(item.name),bytes});
        }return out;
      };
      let validatedProofs,validatedDocuments;
      try{
        validatedProofs=validateItems(paymentItems,manifest.version===2?'payments':'',PAYMENT_PROOF_FILE_RE,'payment proof');
        validatedDocuments=validateItems(documentItems,'documents',/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|png|webp)$/i,'document');
      }catch(e){return json(res,400,{error:e.message})}
      for(const file of fs.readdirSync(UPLOAD_DIR)){if(PAYMENT_PROOF_FILE_RE.test(file))fs.rmSync(path.join(UPLOAD_DIR,file),{force:true});}
      for(const file of fs.readdirSync(DOCUMENT_UPLOAD_DIR)){if(/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|png|webp)$/i.test(file))fs.rmSync(path.join(DOCUMENT_UPLOAD_DIR,file),{force:true});}
      for(const item of validatedProofs)fs.writeFileSync(path.join(UPLOAD_DIR,item.name),item.bytes);
      for(const item of validatedDocuments)fs.writeFileSync(path.join(DOCUMENT_UPLOAD_DIR,item.name),item.bytes);
      const restoredProofs=validatedProofs.length,restoredDocuments=validatedDocuments.length;
      validated.meta={...(validated.meta||{}),write_revision:STORAGE.currentRevision()};
      db=validated;
      db.admin_sessions=[];db.staff_sessions=[];db.customer_sessions=[];
      db.audit=db.audit||[];
      db.audit.unshift({id:newId(),action:'BACKUP_RESTORED',file:name,pre_restore_backup:before.name,restored_payment_proofs:restoredProofs,by:a.user||'admin',at:now()});
      save();return json(res,200,{ok:true,restored:name,pre_restore_backup:before.name,restored_payment_proofs:restoredProofs,restored_documents:restoredDocuments});
    }
    if(p==='/api/auth/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown';if(!loginAllowed(ip))return json(res,429,{error:'बहुत अधिक login attempts. 15 मिनट बाद फिर कोशिश करें।'});
      const x=await body(req),username=String(x.username||'').trim(),password=String(x.password||'');
      // Migrate the legacy environment credentials into the hashed credential store before validation.
      // Without this, a fresh local install with an empty admin_credentials array could never log in.
      if(!adminCredential())ensureAdminCredential();
      if(!adminCredentialsValid(username,password)){failLogin(ip);db.audit.unshift({id:newId(),action:'FAILED_ADMIN_LOGIN',by:username||'unknown',ip,at:now(),reason:'Invalid username or password'});save();return json(res,401,{error:'Invalid username or password'})}
      clearLoginAttempts('login_attempts',ip);cleanupSessions();const activeUser=adminCredential()?.username||ADMIN_USER;const sid=crypto.randomBytes(18).toString('hex');db.admin_sessions.push({sid,user:activeUser,created_at:now(),expires_at:new Date(Date.now()+8*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'ADMIN_LOGIN',by:activeUser,ip,user_agent:String(req.headers['user-agent']||'').slice(0,300),at:now()});const access_token=sign({kind:'admin',sid,role:'admin',user:activeUser,exp:Date.now()+8*60*60*1000});save();setAuthCookies(res,req,{adminToken:access_token});return json(res,200,{user:{name:db.settings.operator||'Admin',role:'admin'}})
    }
    if(p==='/api/auth/password'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Admin session required'});const x=await body(req),current=String(x.current_password||''),next=String(x.new_password||''),confirm=String(x.confirm_password||'');
      if(next.length<12)return json(res,400,{error:'नया password कम-से-कम 12 characters का होना चाहिए'});
      if(next!==confirm)return json(res,400,{error:'New password और confirmation match नहीं करते'});
      if(current===next)return json(res,400,{error:'नया password पुराने password से अलग होना चाहिए'});
      const c=adminCredential();const currentOk=c?adminPasswordVerify(current,c.salt,c.hash):(String(a.user)===String(ADMIN_USER)&&current===String(ADMIN_PASS));if(!currentOk)return json(res,401,{error:'Current password गलत है'});
      const h=adminPasswordHash(next);db.admin_credentials=[{username:c?.username||a.user||ADMIN_USER,salt:h.salt,hash:h.hash,created_at:c?.created_at||now(),updated_at:now(),source:'admin-password-change'}];
      db.admin_sessions.forEach(s=>{s.revoked_at=now()});db.audit.unshift({id:newId(),action:'ADMIN_PASSWORD_CHANGED',by:a.user||'admin',at:now()});save();return json(res,200,{ok:true,relogin_required:true})
    }
    if(p==='/api/services'&&req.method==='GET'){const rows=Object.entries(SERVICE_INFO).map(([category,v])=>({category,services:(v.services||[]).map(x=>publicService(category,x))}));for(const x of (db.custom_services||[]).filter(x=>x.published!==false && x.status!=='archived')){let g=rows.find(z=>z.category===x.category);if(!g){g={category:x.category,services:[]};rows.push(g)}g.services.push(publicCustomService(x))}return json(res,200,{services:rows});}
    if(p==='/api/service-configs'&&req.method==='GET'){const all=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[]))all.push(getServiceConfig(category,sub.name));}return json(res,200,{configs:all});}
    if(p==='/api/admin/service-configs'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const all=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[]))all.push(getServiceConfig(category,sub.name));}for(const x of (db.custom_services||[]).filter(x=>x.published!==false && x.status!=='archived'))all.push(getServiceConfig(x.category,x.name));return json(res,200,{configs:all});}
    if(p==='/api/admin/service-configs'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),service=String(x.service||'').trim();if(!serviceExists(category+' — '+service))return json(res,400,{error:'Valid category/sub-service जरूरी है'});const keys=['paymentRequired','manualVerification','tokenRequired','appointmentRequired','documentsRequired','qualityReview','receiptRequired','notifications','applicationTracking','staffAssignment'];let row=(db.service_configs||[]).find(r=>r.key===category+' — '+service);if(!row){row={id:newId(),key:category+' — '+service,category,service,created_at:now()};db.service_configs.unshift(row)}for(const k of keys)if(x[k]!==undefined)row[k]=x[k]===true||x[k]==='true';row.updated_at=now();db.audit.unshift({id:newId(),action:'SERVICE_WORKFLOW_CONFIG_CHANGED',service:row.key,changes:Object.fromEntries(keys.filter(k=>x[k]!==undefined).map(k=>[k,row[k]])),by:a.user||'admin',at:now()});save();return json(res,200,{config:getServiceConfig(category,service)})}
    if(p==='/api/admin/custom-services'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{services:(db.custom_services||[]).map(publicCustomService)});}
    if(p==='/api/admin/custom-services'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),name=String(x.name||'').trim(),fee=Number(x.fee||0);if(!category||!name||!Object.prototype.hasOwnProperty.call(SERVICE_INFO,category))return json(res,400,{error:'Valid category और service name जरूरी है'});if(SERVICE_INFO[category].services?.some(z=>z.name===name)||(db.custom_services||[]).some(z=>z.category===category&&z.name===name))return json(res,409,{error:'इस category में यह service पहले से मौजूद है'});if(!Number.isFinite(fee)||fee<=0)return json(res,400,{error:'Customer fee ₹0 से अधिक होना चाहिए'});const row={id:newId(),category,name,fee,govt:String(x.govt||'Portal/department अनुसार').trim(),documents:Array.isArray(x.documents)?x.documents.map(String).map(v=>v.trim()).filter(Boolean):[],process:Array.isArray(x.process)?x.process.map(String).map(v=>v.trim()).filter(Boolean):[],description:String(x.description||'').trim(),time:Number(x.time||0),appointment:x.appointment===true,priority:x.priority===true,published:x.published!==false,created_at:now(),updated_at:now(),created_by:a.user||'admin'};db.custom_services.unshift(row);db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_CREATED',service:category+' — '+name,by:a.user||'admin',at:now()});save();return json(res,201,{service:publicCustomService(row)});}
    if(p.startsWith('/api/admin/custom-services/')&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),row=(db.custom_services||[]).find(x=>Number(x.id)===id);if(!row)return json(res,404,{error:'Custom service नहीं मिला'});const x=await body(req);if(x.action==='delete'){row.published=false;row.deleted_at=now();row.deleted_by=a.user||db.settings.operator||'Admin';row.status='archived';db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_ARCHIVED',service:row.category+' — '+row.name,by:a.user||'admin',at:now()});save();return json(res,200,{ok:true,archived:true,service:publicCustomService(row)});}if(x.action==='publish')row.published=true;else if(x.action==='unpublish')row.published=false;else {const nextName=String(x.name??row.name).trim(),nextFee=Number(x.fee??row.fee);if(!nextName||!Number.isFinite(nextFee)||nextFee<=0)return json(res,400,{error:'Valid name और fee जरूरी है'});if(nextName!==row.name)return json(res,409,{error:'Custom service name immutable है। Consistent pricing/workflow के लिए नया service बनाएं।'});Object.assign(row,{name:nextName,fee:nextFee,govt:String(x.govt??row.govt),documents:Array.isArray(x.documents)?x.documents:row.documents,process:Array.isArray(x.process)?x.process:row.process,description:String(x.description??row.description),time:Number(x.time??row.time),appointment:x.appointment??row.appointment,priority:x.priority??row.priority,published:x.published??row.published,updated_at:now()});}db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_UPDATED',service:row.category+' — '+row.name,by:a.user||'admin',at:now()});save();return json(res,200,{service:publicCustomService(row)});}
    if(p==='/api/service-charges'&&req.method==='GET'){
      const category=String(u.searchParams.get('category')||'').trim(),service=String(u.searchParams.get('service')||'').trim();
      if(category||service){const row=serviceRow(category,service);if(row)return json(res,200,{charge:row});const total=category&&service?chargeFor(category+' — '+service):null;return json(res,200,{charge:total===null?null:{category,service,govt_fee:Math.max(0,total),csc_fee:0,other_fee:0,total}})}
      const rows=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[])){const saved=serviceRow(category,sub.name);const govt=Number(String(sub.govt||'').replace(/,/g,'').match(/₹\s*([0-9]+(?:\.[0-9]+)?)/)?.[1]||0),csc=Number(sub.csc||0);rows.push(saved||{category,service:sub.name,govt_fee:govt,csc_fee:csc,other_fee:0,total:Number((govt+csc).toFixed(2)),default:true})}}for(const x of (db.custom_services||[])){const saved=serviceRow(x.category,x.name);rows.push(saved||{category:x.category,service:x.name,govt_fee:0,csc_fee:Number(x.fee||0),other_fee:0,total:Number(x.fee||0),default:true,custom:true})}return json(res,200,{charges:rows})
    }
    if(p==='/api/service-charges'&&req.method==='POST'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),service=String(x.service||'').trim();if(!category||!service||!serviceExists(category+' — '+service))return json(res,400,{error:'Valid category/sub-service जरूरी है'});
      const vals=[Number(x.govt_fee),Number(x.csc_fee),Number(x.other_fee)];if(vals.some(v=>!Number.isFinite(v)||v<0))return json(res,400,{error:'Charges valid non-negative numbers होने चाहिए'});const total=Number((vals[0]+vals[1]+vals[2]).toFixed(2));if(total<=0)return json(res,400,{error:'Service charge total ₹0 नहीं हो सकता। हर service का payable amount ₹0 से अधिक होना चाहिए।'});let row=serviceRow(category,service);if(!row){row={id:newId(),category,service};db.service_charges.unshift(row)}Object.assign(row,{govt_fee:vals[0],csc_fee:vals[1],other_fee:vals[2],total,updated_at:now()});const custom=customServiceRow(category,service);if(custom)custom.fee=total;save();return json(res,200,row)
    }
    if(p==='/api/offers'&&req.method==='GET'){const all=u.searchParams.get('all')==='1';if(all&&!admin(req))return json(res,401,{error:'Unauthorized'});const n=new Date();let rows=(all?db.offers:db.offers.filter(x=>x.archived!==true&&x.published!==false)).filter(x=>all||((!x.starts_at||new Date(x.starts_at)<=n)&&(!x.expires_at||new Date(x.expires_at)>n))).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(b.id||0)-Number(a.id||0));return json(res,200,{offers:rows})}
    if(p==='/api/offers'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),o={id:newId(),title:String(x.title||'').trim(),service:String(x.service||''),subtitle:String(x.subtitle||''),description:String(x.description||''),type:x.type==='OFFER'?'OFFER':'UPDATE',update_category:String(x.update_category||''),published:x.published===true,valid:String(x.valid||''),last_date:String(x.last_date||''),original_price:x.original_price||'',offer_price:x.offer_price||'',discount:x.discount||'',save_amount:x.save_amount||'',image:String(x.image||''),ticker:String(x.ticker||''),priority:Number(x.priority||0),starts_at:String(x.starts_at||''),expires_at:String(x.expires_at||''),created_at:now(),updated_at:now()};if(!o.title)return json(res,400,{error:'Title required'});if(o.type==='OFFER'){if(!o.service||!serviceExists(o.service))return json(res,400,{error:'Offer के लिए valid service जरूरी है'});if(!Number.isFinite(Number(o.offer_price))||Number(o.offer_price)<=0)return json(res,400,{error:'Offer price ₹0 से अधिक होना चाहिए'});if(Number(o.original_price)>0&&Number(o.offer_price)>Number(o.original_price))return json(res,400,{error:'Offer price original price से अधिक नहीं हो सकता'});}db.offers.unshift(o);save();return json(res,200,o)}
    if(p.startsWith('/api/offers/')&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),o=db.offers.find(z=>Number(z.id)===id);if(!o)return json(res,404,{error:'Offer नहीं मिला'});const x=await body(req);if(x.action==='delete'){o.archived=true;o.published=false;o.archived_at=now();o.archived_by=a.user||db.settings.operator||'admin';o.updated_at=now();db.audit.unshift({id:newId(),action:'ADMIN_OFFER_ARCHIVED',offer_id:o.id,title:o.title,by:a.user||'admin',at:now()});save();return json(res,200,{ok:true,archived:true,offer:o})}if(x.action==='restore'){o.archived=false;delete o.archived_at;delete o.archived_by;o.updated_at=now();db.audit.unshift({id:newId(),action:'ADMIN_OFFER_RESTORED',offer_id:o.id,title:o.title,by:a.user||'admin',at:now()});save();return json(res,200,{ok:true,restored:true,offer:o})}if(x.action==='publish'){if(o.archived)return json(res,409,{error:'Archived offer पहले restore करें'});o.published=true;o.updated_at=now();db.audit.unshift({id:newId(),action:'ADMIN_OFFER_PUBLISHED',offer_id:o.id,title:o.title,by:a.user||'admin',at:now()})}else if(x.action==='unpublish'){o.published=false;o.updated_at=now();db.audit.unshift({id:newId(),action:'ADMIN_OFFER_UNPUBLISHED',offer_id:o.id,title:o.title,by:a.user||'admin',at:now()})}else {if(o.archived)return json(res,409,{error:'Archived offer पहले restore करें'});const next={...o,title:String(x.title??o.title).trim(),service:String(x.service??o.service??''),subtitle:String(x.subtitle??o.subtitle),description:String(x.description??o.description),type:x.type==='OFFER'?'OFFER':(x.type??o.type),update_category:String(x.update_category??o.update_category),valid:String(x.valid??o.valid),last_date:String(x.last_date??o.last_date),original_price:x.original_price??o.original_price,offer_price:x.offer_price??o.offer_price,discount:x.discount??o.discount,save_amount:x.save_amount??o.save_amount,image:String(x.image??o.image),ticker:String(x.ticker??o.ticker),priority:Number(x.priority??o.priority),starts_at:String(x.starts_at??o.starts_at),expires_at:String(x.expires_at??o.expires_at),published:x.published??o.published,updated_at:now()};if(next.type==='OFFER'){if(!next.service||!serviceExists(next.service))return json(res,400,{error:'Offer के लिए valid service जरूरी है'});if(!Number.isFinite(Number(next.offer_price))||Number(next.offer_price)<=0)return json(res,400,{error:'Offer price ₹0 से अधिक होना चाहिए'});if(Number(next.original_price)>0&&Number(next.offer_price)>Number(next.original_price))return json(res,400,{error:'Offer price original price से अधिक नहीं हो सकता'});}Object.assign(o,next);db.audit.unshift({id:newId(),action:'ADMIN_OFFER_UPDATED',offer_id:o.id,title:o.title,by:a.user||'admin',at:now()})}save();return json(res,200,o)}

    if(p==='/api/customer/track'&&req.method==='GET'){
      const ref=String(u.searchParams.get('ref')||'').trim().slice(0,80);
      if(!ref)return json(res,400,{error:'Application ID जरूरी है'});
      const session=customerSession(req),trackingToken=String(u.searchParams.get('token')||'').trim();let trackedMobile=null;if(session)trackedMobile=session.mobile;else if(trackingToken){try{const claim=verify(trackingToken,'customer');if(claim?.kind==='customer')trackedMobile=claim.mobile}catch{}}if(!trackedMobile)return json(res,401,{error:'Customer login or valid tracking token required'});
      const app=db.applications.find(x=>String(x.application_id||'').toLowerCase()===ref.toLowerCase()&&x.mobile===trackedMobile);
      const tokenRefRow=db.tokens.find(x=>String(x.token||'').toLowerCase()===ref.toLowerCase()&&x.mobile===trackedMobile);
      const resolvedApp=app||((tokenRefRow?.application_id!=null)?db.applications.find(x=>Number(x.id)===Number(tokenRefRow.application_id)):null);
      if(resolvedApp){
        const payment=db.payments.filter(x=>Number(x.application_id)===Number(resolvedApp.id)).slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
        const docs=db.documents.filter(x=>Number(x.application_id)===Number(resolvedApp.id));
        const requiredDocs=sopFor(resolvedApp.service).documents||[];
        const token=db.tokens.filter(x=>Number(x.application_id)===Number(resolvedApp.id)).slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
        const docVerified=documentGate(resolvedApp,requiredDocs).ok;
        const status=String(resolvedApp.status||'').toLowerCase();
        const completed=['completed','complete','पूर्ण','service completed'].some(x=>status.includes(x)) || token?.status==='पूर्ण';
        const processing=completed || token || ['processing','in progress','प्रगति','quality review','submitted'].some(x=>status.includes(x));
        const paymentVerified=payment?.status==='Verified' || ['payment verified','verified'].some(x=>status===x);
        const cfg=getServiceConfig(resolvedApp.category,resolvedApp.service); const steps=[{id:'submitted',label:'Application Submitted',done:true,date:resolvedApp.created_at}]; if(cfg.paymentRequired)steps.push({id:'payment',label:'Payment Verified',done:!!paymentVerified,date:payment?.verified_at||null}); if(cfg.documentsRequired)steps.push({id:'documents',label:'Documents Verified',done:!!docVerified,date:docs.length?docs.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]?.verified_at||null:null}); if(cfg.applicationTracking)steps.push({id:'processing',label:'Processing',done:!!processing,date:token?.started_at||null}); steps.push({id:'completed',label:'Completed',done:!!completed,date:token?.completed_at||null});
        let currentIndex=0; for(let i=0;i<steps.length;i++) if(steps[i].done) currentIndex=i;
        return json(res,200,{result:{type:tokenRefRow?'token':'application',reference:tokenRefRow?.token||resolvedApp.application_id,service:resolvedApp.service,status:resolvedApp.status,created_at:resolvedApp.created_at,current_step:steps[currentIndex].id,steps}});
      }
      return json(res,404,{error:'Application ID नहीं मिला'});
    }
    if(p==='/api/customer/application'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown', nowMs=Date.now(), atry=guestApplicationAttempts.get(ip)||{n:0,at:nowMs};
      if(nowMs-atry.at>15*60*1000){atry.n=0;atry.at=nowMs}
      if(atry.n>=20)return json(res,429,{error:'बहुत अधिक application requests. 15 मिनट बाद फिर कोशिश करें।'});
      atry.n++;guestApplicationAttempts.set(ip,atry);
      const x=await body(req),name=String(x.name||'').trim().slice(0,120),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),address=String(x.address||'').trim().slice(0,500),note=String(x.note||'').trim().slice(0,500); const servicePartsForApp=serviceParts(service), appCfg=getServiceConfig(servicePartsForApp.category,servicePartsForApp.service);
      if(!name||!validMobile(mobile)||!serviceExists(service))return json(res,400,{error:'नाम, valid mobile और valid sub-service जरूरी हैं'});
      let c=db.customers.find(z=>z.mobile===mobile);if(!c){c={id:newId(),customer_id:STORAGE.customerIdFor(mobile),name,mobile,status:'active',pin_set:false,created_at:now(),updated_at:now()};db.customers.push(c)}else{c.name=c.name||name;c.updated_at=now()}
      const a={id:newId(),application_id:nextCode('applications','application_id','APP',4),name,mobile,service,category:serviceParts(service).category,address,note,status:appCfg.paymentRequired?'Payment Pending':'Application Submitted',created_at:now(),customer_id:c.customer_id};
      db.applications.push(a);save();return json(res,200,{...a,customer_id:c.customer_id,customer_token:customerTokenFor(name,mobile,a.id)})
    }
    if(p==='/api/customer/complaints'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const rows=(db.complaints||[]).filter(x=>String(x.mobile||'')===String(c.mobile||'')).slice(0,50).map(x=>({id:x.id,complaint_id:x.complaint_id,title:x.title,category:x.category,description:x.description,status:x.status,priority:x.priority,created_at:x.created_at,updated_at:x.updated_at||x.created_at,resolution:x.resolution||''}));return json(res,200,{complaints:rows});}
    if(p==='/api/customer/complaints'&&req.method==='POST'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const x=await body(req);const title=String(x.title||'').trim().slice(0,120),category=String(x.category||'General').trim().slice(0,60),description=String(x.description||'').trim().slice(0,2000);if(title.length<3)return json(res,400,{error:'Support request title जरूरी है'});if(description.length<10)return json(res,400,{error:'समस्या का विवरण कम से कम 10 characters का होना चाहिए'});const open=(db.complaints||[]).filter(z=>String(z.mobile||'')===String(c.mobile||'')&&!['closed','resolved'].includes(String(z.status||'').toLowerCase()));if(open.length>=5)return json(res,429,{error:'एक समय में अधिकतम 5 open support requests रख सकते हैं'});const row={id:newId(),complaint_id:'CMP-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase(),customer_id:c.customer_id||null,mobile:c.mobile,name:c.name||'',title,category,description,status:'open',priority:['payment','document'].includes(category.toLowerCase())?'high':'normal',created_at:now(),updated_at:now(),resolution:'',source:'customer'};db.complaints.unshift(row);db.notifications.unshift({id:newId(),mobile:c.mobile,type:'support',severity:'info',title:'Support request submitted',message:`${row.complaint_id} submit हो गया है।`,read_at:null,created_at:now(),event_key:'complaint-created-'+row.complaint_id});save();return json(res,201,{ok:true,complaint:{id:row.id,complaint_id:row.complaint_id,status:row.status,created_at:row.created_at}});}
    if(p==='/api/admin/complaints'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const status=String(u.searchParams.get('status')||'').trim().toLowerCase();const rows=(db.complaints||[]).filter(x=>!status||String(x.status||'').toLowerCase()===status).slice(0,200).map(x=>({id:x.id,complaint_id:x.complaint_id,customer_id:x.customer_id,mobile:x.mobile,name:x.name,title:x.title,category:x.category,description:x.description,status:x.status,priority:x.priority,created_at:x.created_at,updated_at:x.updated_at,resolution:x.resolution||''}));return json(res,200,{complaints:rows});}
    if(p==='/api/admin/complaints/update'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),id=Number(x.id)||0,status=String(x.status||'').trim().toLowerCase(),resolution=String(x.resolution||'').trim().slice(0,2000);if(!['open','in_progress','resolved','closed'].includes(status))return json(res,400,{error:'Invalid complaint status'});const row=(db.complaints||[]).find(z=>Number(z.id)===id);if(!row)return json(res,404,{error:'Support request नहीं मिला'});row.status=status;row.resolution=resolution;row.updated_at=now();db.notifications.unshift({id:newId(),mobile:row.mobile,type:'support',severity:status==='resolved'||status==='closed'?'success':'info',title:'Support request updated',message:`${row.complaint_id}: ${status==='in_progress'?'processing में है':status==='resolved'?'resolve कर दिया गया है':status==='closed'?'close कर दिया गया है':'open है'}${resolution?' — '+resolution:''}`,read_at:null,created_at:now(),complaint_id:row.id,event_key:'complaint-update-'+row.id+'-'+row.updated_at});save();return json(res,200,{ok:true,complaint:{id:row.id,complaint_id:row.complaint_id,status:row.status,updated_at:row.updated_at}});}
    if(p==='/api/customer/applications'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});return json(res,200,{applications:db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at,address,note,customer_id})=>({id,application_id,service,category,status,created_at,address,note,customer_id}))})}
    if(p==='/api/customer/application'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const id=Number(u.searchParams.get('id')||0),a=db.applications.find(x=>Number(x.id)===id&&x.mobile===c.mobile);if(!a)return json(res,404,{error:'Application नहीं मिला'});return json(res,200,{application:{id:a.id,application_id:a.application_id,service:a.service,category:a.category,status:a.status,created_at:a.created_at,address:a.address,note:a.note,customer_id:a.customer_id},documents:db.documents.filter(x=>Number(x.application_id)===a.id).map(x=>({id:x.id,document_id:x.document_id,name:x.name,mime_type:x.mime_type,size:x.size,status:x.status,sha256:x.sha256,ocr_status:x.ocr_status||'not_run',created_at:x.created_at}))})}
    if(p==='/api/customer/payment'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),utr=String(x.utr||'').trim(),method=String(x.method||'UPI').trim(),amount=Number(x.amount),sp=serviceParts(service),cfg=getServiceConfig(sp.category,sp.service);if(!cfg.paymentRequired)return json(res,409,{error:'इस service के लिए payment workflow लागू नहीं है।'});if(c.mobile!==mobile||c.name!==name)return json(res,403,{error:'Customer session और payment details match नहीं करते'});if(!validMobile(mobile)||!serviceExists(service)||!Number.isFinite(amount)||amount<=0||!['Cash','UPI','QR','Bank Transfer'].includes(method))return json(res,400,{error:'Valid name, mobile, service, amount और payment method जरूरी है'});if(method!=='Cash'&&!utr&&!x.screenshot)return json(res,400,{error:'UPI/Bank payment के लिए UTR या payment screenshot में से कम-से-कम एक जरूरी है'});
      const offerId=Number(x.offer_id||0)||null;
      const expected=payableAmountFor(service,offerId);if(!Number.isFinite(expected)||expected<=0)return json(res,400,{error:'Payable amount configured नहीं है या selected offer अब valid नहीं है।'});if(Math.abs(amount-expected)>0.009)return json(res,400,{error:'Payable amount गलत है। निर्धारित amount ₹'+expected.toFixed(2)+' है।'});if(db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      let app=applicationFor(x.application_id);if(app&& (app.mobile!==mobile||app.service!==service))return json(res,400,{error:'Selected application और customer/service match नहीं करते'});if(!app){app=db.applications.filter(z=>z.mobile===mobile&&z.service===service&&z.status!=='Token Generated').sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;}if(!app)return json(res,400,{error:'इस service के लिए valid application नहीं मिला। पहले application create करें।'});if(!c.sid&&Number(c.application_id)!==Number(app.id))return json(res,403,{error:'Guest application token और application match नहीं करते'});let proof=null;if(x.screenshot){try{proof=safeImage(x.screenshot)}catch(e){return json(res,400,{error:e.message})}}
      if(utr&&db.payments.some(existing=>String(existing.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      if(proof){const duplicateProof=db.payments.some(existing=>{if(!existing.screenshot)return false;let h=String(existing.proof_sha256||'').toLowerCase();if(!h){const fp=path.join(UPLOAD_DIR,path.basename(existing.screenshot));try{if(fs.existsSync(fp))h=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}catch{h=''}}return h===proof.sha256});if(duplicateProof){try{if(proof?.filename)fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}return json(res,409,{error:'यह payment screenshot पहले से किसी payment में दर्ज है। नया payment proof इस्तेमाल करें।'})}}
      const id=newId(),pay={id,txn_id:'PAY-'+String(id).slice(-8),name,mobile,service,amount,payable_amount_snapshot:expected,offer_id:offerId,offer_title:offerId?activeOfferById(offerId)?.title||null:null,method,utr:method==='Cash'?'':utr,screenshot:proof?.url||null,status:'Pending Verification',created_at:now(),receipt_no:null,application_id:app.id,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null,verified_by:null,verified_at:null,reject_reason:null};db.payments.push(pay);app.status='Payment Verification Pending';db.audit.unshift({id:newId(),action:'PAYMENT_SUBMITTED',payment_id:id,by:mobile,at:now()});save();return json(res,200,{id,status:pay.status,message:'Payment verification pending'})
    }
    if(p==='/api/customer/payment/status'&&req.method==='GET'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const id=Number(u.searchParams.get('id')),pay=db.payments.find(z=>z.id===id);if(!pay||pay.mobile!==c.mobile||(!c.sid&&Number(c.application_id)!==Number(pay.application_id)))return json(res,404,{error:'Payment request नहीं मिला'});return json(res,200,{payment:customerPayment(pay)})
    }
    if(p==='/api/customer/live-queue'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const requestedService=String(u.searchParams.get('service')||'').trim();
      const ownServices=new Set(db.tokens.filter(x=>x.mobile===c.mobile&&x.date===today()).map(x=>x.service));
      const scopedService=requestedService&&ownServices.has(requestedService)?requestedService:'';
      const queueRows=db.tokens.filter(x=>x.date===today()&&(!scopedService||x.service===scopedService));
      const queueCtx=tokenQueueContext(queueRows);
      const rows=queueRows.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id||0)-Number(b.id||0)).map(x=>{const q=tokenQueueMeta(x,queueCtx);const staff=x.staff_id?db.staff.find(s=>s.staff_id===x.staff_id):null;return {id:x.id,token:x.token,service:x.service,status:x.status,created_at:x.created_at,date:x.date,priority:Number(x.priority||0),queue_position:q.queue_position,waiting_count:q.waiting_count,ahead_count:q.ahead_count,estimated_wait_minutes:q.estimated_wait_minutes,start_wait_minutes:q.start_wait_minutes,completion_wait_minutes:q.completion_wait_minutes,estimated_start_at:q.estimated_start_at,estimated_completion_at:q.estimated_completion_at,staff_id:x.staff_id||null,staff_name:staff?.name||null,last_action_at:x.last_action_at||null}});
      const current=rows.find(x=>['बुलाया','प्रगति'].includes(x.status))||null;
      return json(res,200,{tokens:rows,current,total:rows.length,service:scopedService||null,scoped:!!scopedService})
    }
    if(p==='/api/customer/tokens'&&req.method==='GET'){
      const c=customerSession(req); if(!c)return json(res,401,{error:'Customer login required'});
      const customerRows=db.tokens.filter(x=>x.mobile===c.mobile&&(!c.application_id||Number(x.application_id)===Number(c.application_id)));
      const queueCtx=tokenQueueContext(db.tokens);
      const rows=customerRows.map(x=>publicToken(x,queueCtx));
      const mineActive=rows.find(x=>['बुलाया','प्रगति','होल्ड','लंबित'].includes(x.status))||null;
      const currentRaw=mineActive?activeQueueToken(mineActive.service):null;
      return json(res,200,{tokens:rows,current:currentRaw?customerCurrentToken(currentRaw,queueCtx):null,total:rows.length});
    }
    if(p==='/api/customer/tokens'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});
      const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),parts=serviceParts(service),cfg=getServiceConfig(parts.category,parts.service);
      if(!cfg.tokenRequired)return json(res,409,{error:'इस service के लिए Token लागू नहीं है।'});
      if(!name||!validMobile(mobile)||c.mobile!==mobile||c.name!==name)return json(res,403,{error:'Customer session और token details match नहीं करते।'});
      if(cfg.appointmentRequired){const appt=appointmentForCustomer(service,mobile);if(!appt||!['स्वीकृत','पुष्टि'].includes(appt.status))return json(res,409,{error:'इस service के लिए पहले appointment approval/confirmation जरूरी है।'});}

      let pay=null,app=null;
      if(cfg.paymentRequired){
        pay=db.payments.find(z=>z.id===Number(x.payment_id));
        if(!pay||pay.mobile!==c.mobile||(!c.sid&&Number(c.application_id)!==Number(pay.application_id))||pay.status!=='Verified')return json(res,403,{error:'Payment अभी Admin द्वारा verify नहीं हुआ है।'});
        if(name!==pay.name||mobile!==pay.mobile||service!==pay.service)return json(res,403,{error:'Verified payment और customer/service match नहीं करते।'});
        const expected=Number(pay.payable_amount_snapshot ?? pay.amount);if(Math.abs(Number(pay.amount)-expected)>0.009)return json(res,403,{error:'Verified payment amount snapshot से match नहीं करता।'});
        if(db.tokens.some(t=>Number(t.payment_id)===pay.id))return json(res,409,{error:'इस payment का token पहले ही generate हो चुका है।'});
        app=applicationFor(pay.application_id);
      }else{
        const applicationId=Number(x.application_id||c.application_id||0);
        app=applicationId?applicationFor(applicationId):db.applications.filter(a=>a.mobile===mobile&&a.service===service&&a.status!=='Token Generated').sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
        if(!app||app.mobile!==mobile||app.service!==service)return json(res,400,{error:'इस service के लिए valid application नहीं मिला। पहले application create करें।'});
        if(c.sid&&app.mobile!==c.mobile)return json(res,403,{error:'Application और customer match नहीं करते।'});
        if(!c.sid&&Number(c.application_id)!==Number(app.id))return json(res,403,{error:'Guest application token और application match नहीं करते।'});
        if(db.tokens.some(t=>Number(t.application_id)===Number(app.id)))return json(res,409,{error:'इस application का token पहले ही generate हो चुका है।'});
      }
      const t={id:newId(),token:tokenNo(service),name,mobile,service,status:'लंबित',created_at:now(),date:today(),payment_id:pay?.id||null,application_id:app?.id||null};
      db.tokens.push(t);if(pay)pay.token_id=t.id;if(app)app.status='Token Generated';db.audit.unshift({id:newId(),action:'TOKEN_GENERATED',payment_id:pay?.id||null,token_id:t.id,application_id:app?.id||null,by:mobile,at:now()});save();return json(res,200,publicToken({...t,name,mobile}))
    }
    if(p.startsWith('/api/customer/receipts/')&&p.endsWith('.pdf')&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const id=Number(p.split('/').pop().replace(/\.pdf$/,''));const r=findCompletedReceipt(id);
      if(!r||r.pay.mobile!==c.mobile)return json(res,404,{error:'Receipt नहीं मिला'});
      const pdf=receiptPdf(r.pay,r.tok,r.app);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${r.pay.receipt_no}.pdf"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':pdf.length});return res.end(pdf);
    }
    if(p.startsWith('/api/admin/receipts/')&&p.endsWith('.pdf')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const id=Number(p.split('/').pop().replace(/\.pdf$/,''));const r=findCompletedReceipt(id);
      if(!r)return json(res,404,{error:'Receipt नहीं मिला'});
      const pdf=receiptPdf(r.pay,r.tok,r.app);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${r.pay.receipt_no}.pdf"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':pdf.length});return res.end(pdf);
    }
    if(p==='/api/customer/notifications'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||50)));const rows=(db.notifications||[]).filter(n=>n.mobile===c.mobile).slice(0,limit).map(n=>({id:n.id,type:n.type,severity:n.severity,title:n.title,message:n.message,read:!!n.read_at,created_at:n.created_at,token_id:n.token_id||null,application_id:n.application_id||null,payment_id:n.payment_id||null,receipt_no:n.receipt_no||null,document_id:n.document_id||null,event_key:n.event_key||null,state_revision:n.state_revision??null}));return json(res,200,{notifications:rows,unread:rows.filter(n=>!n.read).length});}
    if(p==='/api/customer/notifications/read'&&req.method==='POST'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const x=await body(req);const rows=(db.notifications||[]).filter(n=>n.mobile===c.mobile&&(!x.id||Number(n.id)===Number(x.id)));rows.forEach(n=>n.read_at=now());save();return json(res,200,{ok:true,count:rows.length});}
    if(p==='/api/customer/recharge/sync'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const since=Number(u.searchParams.get('since')||0);
      const rows=(db.recharge_transactions||[]).filter(x=>(x.customer_id===c.customer_id||x.mobile===c.mobile)).sort((a,b)=>Number(b.updated_at?Date.parse(b.updated_at):b.id)-Number(a.updated_at?Date.parse(a.updated_at):a.id)).map(customerRecharge);
      const changed=since?rows.filter(x=>Number(x.state_revision||0)>since):rows.slice(0,10);
      return json(res,200,{recharges:changed,latest_revision:rows.reduce((m,x)=>Math.max(m,Number(x.state_revision||0)),0),server_time:now()});
    }
    if(p==='/api/customer/records'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const tokens=db.tokens.filter(x=>x.mobile===c.mobile).map(publicToken);
      const payments=db.payments.filter(x=>x.mobile===c.mobile).map(customerPayment);
      const applications=db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at})=>({id,application_id,service,category,status,created_at}));
      const appointments=db.appointments.filter(x=>x.mobile===c.mobile).map(({id,appointment_id,service,date,time,status,created_at})=>({id,appointment_id,service,date,time,status,created_at}));
      const recharges=(db.recharge_transactions||[]).filter(x=>x.customer_id===c.customer_id||x.mobile===c.mobile).map(customerRecharge);
      const receiptPayments=payments.filter(x=>receiptEligibility(db.payments.find(z=>Number(z.id)===Number(x.id))));
      const latest= tokens.find(z=>['बुलाया','प्रगति','होल्ड','लंबित'].includes(z.status));const curRaw=latest?activeQueueToken(latest.service):null;return json(res,200,{tokens,current:curRaw?customerCurrentToken(curRaw):null,payments,receipts:receiptPayments,recharges,applications,appointments})
    }
    if(p==='/api/customer/dashboard'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const tokens=db.tokens.filter(x=>x.mobile===c.mobile).map(publicToken);
      const payments=db.payments.filter(x=>x.mobile===c.mobile).map(customerPayment);
      const applications=db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at})=>({id,application_id,service,category,status,created_at}));
      const appointments=db.appointments.filter(x=>x.mobile===c.mobile).map(({id,appointment_id,service,date,time,status,created_at})=>({id,appointment_id,service,date,time,status,created_at}));
      const recharges=(db.recharge_transactions||[]).filter(x=>x.customer_id===c.customer_id||x.mobile===c.mobile).map(customerRecharge);
      const latestActive=tokens.find(x=>['बुलाया','प्रगति','होल्ड','लंबित'].includes(x.status));
      const currentRaw=latestActive?activeQueueToken(latestActive.service):null;
      const current=currentRaw?customerCurrentToken(currentRaw):null;
      const active=tokens.filter(x=>!['पूर्ण','रद्द','स्किप'].includes(x.status));
      const latest=tokens.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
      return json(res,200,{customer:customerPublic(db.customers.find(x=>x.customer_id===c.customer_id)||c),tokens,current,latest,payments,receipts:payments.filter(x=>receiptEligibility(db.payments.find(z=>Number(z.id)===Number(x.id)))),recharges,applications,appointments,summary:{total_tokens:tokens.length,active_tokens:active.length,completed_tokens:tokens.filter(x=>x.status==='पूर्ण').length,verified_payments:payments.filter(x=>x.status==='Verified').length,pending_payments:payments.filter(x=>x.status==='Pending Verification').length,total_paid:payments.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0)}})
    }
    if(p==='/api/customer/progress'&&req.method==='GET'){const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const id=Number(u.searchParams.get('application_id')||c.application_id||0);if(id&&!db.applications.some(a=>Number(a.id)===id&&a.mobile===c.mobile))return json(res,404,{error:'Application नहीं मिला'});return json(res,200,{progress:customerProgressFor(c.mobile,id),workflow_state:id?applicationWorkflowState(db.applications.find(a=>Number(a.id)===id)):null});}
    if(p==='/api/admin/appointments'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const status=u.searchParams.get('status')||'';let rows=(db.appointments||[]).slice().sort((x,y)=>Number(y.id||0)-Number(x.id||0));if(status)rows=rows.filter(x=>x.status===status);return json(res,200,{appointments:rows});
    }
    if(p==='/api/admin/appointments'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),id=Number(x.id||0),row=(db.appointments||[]).find(z=>Number(z.id)===id);if(!row)return json(res,404,{error:'Appointment नहीं मिला'});
      const allowed=['अनुरोध','स्वीकृत','पुष्टि','अस्वीकृत','रद्द','पूर्ण','पुनर्निर्धारित'];const status=String(x.status||'').trim();if(!allowed.includes(status))return json(res,400,{error:'Invalid appointment status'});
      const nextDate=x.date!==undefined?String(x.date||'').trim().slice(0,30):String(row.date||'').trim();const nextTime=x.time!==undefined?String(x.time||'').trim().slice(0,30):String(row.time||'').trim();
      const apptDate=new Date(nextDate+'T'+(nextTime||'00:00'));if(!nextDate||Number.isNaN(apptDate.getTime()))return json(res,400,{error:'Valid appointment date जरूरी है'});
      if(['स्वीकृत','पुष्टि','पुनर्निर्धारित'].includes(status)&&apptDate<new Date(Date.now()-60000))return json(res,400,{error:'Approved/confirmed appointment past में नहीं रखा जा सकता'});
      if(['स्वीकृत','पुष्टि'].includes(status)){const conflict=db.appointments.find(z=>Number(z.id)!==id&&z.service===row.service&&z.date===nextDate&&z.time===nextTime&&['स्वीकृत','पुष्टि'].includes(z.status));if(conflict)return json(res,409,{error:'इस service और time slot पर दूसरा appointment पहले से confirmed है।',appointment_id:conflict.appointment_id});}
      row.status=status;row.date=nextDate;row.time=nextTime;row.admin_note=String(x.note||row.admin_note||'').slice(0,500);row.updated_at=now();notifyCustomer(row.mobile,'appointment',status==='अस्वीकृत'?'error':'info','Appointment '+status,`आपका ${row.appointment_id} appointment status: ${status}${row.admin_note?' — '+row.admin_note:''}`,{appointment_id:row.appointment_id,event_key:'appointment:'+row.id+':'+status});db.audit.unshift({id:newId(),action:'APPOINTMENT_STATUS_CHANGED',appointment_id:row.appointment_id,status,by:a.user||'admin',at:now()});save();return json(res,200,row);
    }
    if(p==='/api/customer/appointments'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      return json(res,200,{appointments:db.appointments.filter(x=>x.mobile===c.mobile)})
    }
    if(p==='/api/customer/appointments'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),service=String(x.service||'सामान्य सेवा').trim().slice(0,200),date=String(x.date||'').trim().slice(0,30),time=String(x.time||'').trim().slice(0,30);
      if(!service||!date||!time)return json(res,400,{error:'Service, date और time जरूरी हैं'});
      if(!serviceExists(service))return json(res,400,{error:'Valid service चुनें'});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return json(res,400,{error:'Valid appointment date/time जरूरी है'});
      const apptDate=new Date(date+'T'+time);if(Number.isNaN(apptDate.getTime())||apptDate<new Date(Date.now()+60000))return json(res,400,{error:'Past या immediate appointment time allowed नहीं है'});
      const existing=db.appointments.find(a=>a.mobile===c.mobile&&a.service===service&&a.date===date&&a.time===time&&['अनुरोध','स्वीकृत','पुष्टि'].includes(a.status));if(existing)return json(res,409,{error:'इस समय के लिए appointment request पहले से मौजूद है।',appointment:existing});
      const a={id:newId(),appointment_id:'APT-'+String(newId()).slice(-10),customer_id:c.customer_id,name:c.name,mobile:c.mobile,service,date,time,status:'अनुरोध',created_at:now()};
      db.appointments.unshift(a);notifyCustomer(c.mobile,'appointment','info','Appointment Request',`आपका ${a.appointment_id} appointment request प्राप्त हुआ है।`,{appointment_id:a.appointment_id,event_key:'appointment:'+a.id});db.audit.unshift({id:newId(),action:'CUSTOMER_APPOINTMENT_REQUESTED',customer_id:c.customer_id,appointment_id:a.appointment_id,by:c.mobile,at:now()});save();return json(res,201,a)
    }
    if(p==='/api/tokens'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const queueCtx=tokenQueueContext(db.tokens);const tokens=db.tokens.map(t=>publicToken(t,queueCtx));const liveRaw=activeQueueToken(null,today()),heldRaw=db.tokens.find(z=>z.date===today()&&z.status==='होल्ड')||null;const live=liveRaw?publicToken(liveRaw,queueCtx):null,held=heldRaw?publicToken(heldRaw,queueCtx):null;const todayRows=db.tokens.filter(t=>t.date===today());const serviceQueues={};for(const t of todayRows){const k=t.service||'Unknown';serviceQueues[k]??={service:k,current:null,waiting:0,completed:0,tokens:[]};serviceQueues[k].tokens.push(publicToken(t,queueCtx));}Object.values(serviceQueues).forEach(q=>{q.tokens.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id)-Number(b.id));q.waiting=q.tokens.filter(t=>t.status==='लंबित').length;q.completed=q.tokens.filter(t=>t.status==='पूर्ण').length;q.current=q.tokens.find(t=>['बुलाया','प्रगति'].includes(t.status))?.token||null});const service_queue_list=Object.values(serviceQueues).map(q=>({service:q.service,current:q.current,waiting:q.waiting,completed:q.completed,tokens:q.tokens}));const current_by_service=Object.fromEntries(service_queue_list.map(q=>[q.service,q.current]));return json(res,200,{tokens,current:live,control_current:live||held,current_by_service,service_queues:service_queue_list,date:today()})}
    if(p==='/api/tokens'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req);
      if(x.action==='issue'){const pay=db.payments.find(z=>z.id===Number(x.payment_id));if(!pay||pay.status!=='Verified')return json(res,403,{error:'Token के लिए Verified payment जरूरी है।'});const name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim();if(!name||!validMobile(mobile)||!service||pay.name!==name||pay.mobile!==mobile||pay.service!==service)return json(res,403,{error:'Verified payment/customer/service match नहीं करते'});if(Math.abs(Number(pay.amount)-Number(pay.payable_amount_snapshot ?? pay.amount))>0.009)return json(res,403,{error:'Verified payment amount snapshot से match नहीं करता'});if(db.tokens.some(t=>Number(t.payment_id)===pay.id))return json(res,409,{error:'इस payment का token पहले ही generate हो चुका है'});const linkedApp=applicationFor(pay.application_id);const svcParts=serviceParts(service),svcCfg=getServiceConfig(svcParts.category,svcParts.service);if(svcCfg.appointmentRequired){const appt=appointmentForCustomer(service,mobile);if(!appt||!['स्वीकृत','पुष्टि'].includes(appt.status))return json(res,409,{error:'इस service के लिए token generate करने से पहले approved/confirmed appointment जरूरी है।'});}const t={id:newId(),token:tokenNo(service),name,mobile,service,status:'लंबित',created_at:now(),date:today(),application_id:pay.application_id||null,payment_id:pay.id};db.tokens.push(t);pay.token_id=t.id;const app=applicationFor(t.application_id);if(app)app.status='Token Generated';notifyCustomer(t.mobile,'token','info','Token Generated',`आपका token ${t.token} generate हो गया है।`,{token_id:t.id,application_id:t.application_id});db.audit.unshift({id:newId(),action:'TOKEN_GENERATED',payment_id:pay.id,token_id:t.id,by:a.user||'admin',at:now()});save();return json(res,200,t)}
      let t=x.id?db.tokens.find(z=>Number(z.id)===Number(x.id)):null;if(x.id&&!t)return json(res,404,{error:'Token नहीं मिला'});
      const beforeTokenState=t?tokenAuditSnapshot(t):null;
      const tokenRequestId=String(x.request_id||'').trim().slice(0,120);
      if(t&&tokenRequestId&&t.last_action_request_id===tokenRequestId)return json(res,200,t);
      if(t&&tokenRequestId){const reused=db.tokens.find(z=>z.id!==t.id&&z.last_action_request_id===tokenRequestId);if(reused)return json(res,409,{error:'यह token action request पहले ही दूसरे token पर इस्तेमाल हो चुका है।'});}
      if(t&&x.expected_state_revision!==undefined&&x.expected_state_revision!==null&&Number(x.expected_state_revision)!==Number(t.state_revision||0))return json(res,409,{error:'Token state बदल चुका है। नवीनतम queue state refresh करके फिर action करें।',current_state_revision:Number(t.state_revision||0)});
      if(x.action==='next'){
        const requestedService=String(x.service||t?.service||'').trim();const active=activeQueueToken(requestedService||null);if(active)return json(res,409,{error:'इस service की queue में एक token पहले से active है।',active_token_id:active.id});
        const selected=t||nextQueueToken(requestedService||null,today());
        if(!selected)return json(res,404,{error:'कोई pending token उपलब्ध नहीं है'});
        if(selected.status!=='लंबित')return json(res,400,{error:'Next के लिए selected token Pending होना चाहिए'});
        t=selected;
        t.status='बुलाया';t.last_action_at=now();notifyCustomer(t.mobile,'token','info','Token Called',`Token ${t.token} अब call किया गया है।`,{token_id:t.id,application_id:t.application_id,event_key:`token-called:${t.id}:${Number(t.state_revision||0)+1}`});
      }else if(x.action==='recall'){
        // Recall is a re-call operation: an already-called token may be recalled
        // without a state transition; a skipped token may return to called.
        const recallAllowed = t.status==='बुलाया' || tokenTransitionAllowed(t.status,'बुलाया');
        if(!recallAllowed)return json(res,400,{error:'इस token state से recall allowed नहीं है'});
        const active=activeQueueToken(t.service);if(active&&active.id!==t.id)return json(res,409,{error:'इस service की queue में दूसरा token पहले से active है',active_token_id:active.id});
        t.status='बुलाया';t.recall_count=Number(t.recall_count||0)+1;t.last_action_at=now();
        notifyCustomer(t.mobile,'token','info','Token Recall',`Token ${t.token} की call दोबारा की गई है।`,{token_id:t.id,application_id:t.application_id,event_key:`token-recall:${t.id}:${t.recall_count}`});
      }else if(x.action==='processing'){
        if(!tokenTransitionAllowed(t.status,'प्रगति'))return json(res,400,{error:'इस token state से काम शुरू नहीं किया जा सकता'});
        t.status='प्रगति';t.started_at=t.started_at||now();t.last_action_at=now();const processingApp=applicationFor(t.application_id);if(processingApp)processingApp.status='Processing';notifyCustomer(t.mobile,'processing','info','Service Processing','आपकी service का processing शुरू हो गया है।',{token_id:t.id,application_id:t.application_id});
      }else if(x.action==='hold'){
        if(!tokenTransitionAllowed(t.status,'होल्ड'))return json(res,400,{error:'इस token state से Hold allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200),owner=String(x.owner||'').trim().slice(0,80),mins=Number(x.delay_minutes);
        if(!reason)return json(res,400,{error:'Hold/Pending reason जरूरी है'});
        if(!['customer','operator','portal','department','other'].includes(owner))return json(res,400,{error:'Valid delay owner चुनें'});
        if(!Number.isInteger(mins)||mins<1||mins>1440)return json(res,400,{error:'Expected delay 1 से 1440 मिनट के बीच होना चाहिए'});
        t.hold_resume_status=t.status;t.status='होल्ड';t.hold_reason=reason;t.hold_owner=owner;t.hold_delay_minutes=mins;t.hold_started_at=now();t.hold_extensions=Number(t.hold_extensions||0);t.last_action_at=now();notifyCustomer(t.mobile,'token','warning','Token On Hold',`Token ${t.token} को hold किया गया है। Reason: ${reason}`,{token_id:t.id,application_id:t.application_id,event_key:`token-hold:${t.id}:${Number(t.state_revision||0)+1}`});
      }else if(x.action==='resume'){
        if(!tokenTransitionAllowed(t.status,'प्रगति')&&!tokenTransitionAllowed(t.status,'बुलाया'))return json(res,400,{error:'इस token state से Resume allowed नहीं है'});
        const resumedAt=now(),started=t.hold_started_at?new Date(t.hold_started_at).getTime():Date.now(),duration=Math.max(0,Date.now()-started);
        t.hold_history=Array.isArray(t.hold_history)?t.hold_history:[];t.hold_history.push({started_at:t.hold_started_at||resumedAt,resumed_at:resumedAt,duration_ms:duration,reason:t.hold_reason||'',owner:t.hold_owner||'',planned_minutes:Number(t.hold_delay_minutes||0)});
        t.total_hold_ms=Number(t.total_hold_ms||0)+duration;t.status=t.hold_resume_status||'प्रगति';t.hold_started_at=null;t.hold_deadline=null;t.hold_resume_status=null;t.last_action_at=resumedAt;notifyCustomer(t.mobile,'token','info','Token Resumed',`Token ${t.token} की service फिर से शुरू कर दी गई है।`,{token_id:t.id,application_id:t.application_id,event_key:`token-resume:${t.id}:${Number(t.state_revision||0)+1}`});
      }else if(x.action==='extend_hold'){
        if(t.status!=='होल्ड')return json(res,400,{error:'सिर्फ Hold token का delay extend किया जा सकता है'});
        const mins=Number(x.delay_minutes),reason=String(x.reason||'').trim().slice(0,200);
        if(!Number.isInteger(mins)||mins<1||mins>1440)return json(res,400,{error:'Extension 1 से 1440 मिनट के बीच होना चाहिए'});
        if(!reason)return json(res,400,{error:'Extension reason जरूरी है'});
        t.hold_delay_minutes=Number(t.hold_delay_minutes||0)+mins;t.hold_extensions=Number(t.hold_extensions||0)+1;t.hold_extension_reason=reason;t.last_action_at=now();
      }else if(x.action==='skip'){
        if(!tokenTransitionAllowed(t.status,'स्किप'))return json(res,400,{error:'इस token state से skip allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200);if(!reason)return json(res,400,{error:'Skip reason जरूरी है'});
        t.status='स्किप';t.skip_reason=reason;t.last_action_at=now();notifyCustomer(t.mobile,'token','warning','Token Skipped',`Token ${t.token} को skip किया गया है। Reason: ${reason}`,{token_id:t.id,application_id:t.application_id,event_key:`token-skip:${t.id}:${Number(t.state_revision||0)+1}`});
      }else if(x.action==='assign'||x.action==='transfer'){
        const staffId=String(x.staff_id||'');const st=db.staff.find(z=>z.staff_id===staffId&&z.status==='active');
        if(!st)return json(res,400,{error:'Active staff नहीं मिला'});
        const availability=staffAvailabilityToday(st);
        if(!availability.available)return json(res,409,{error:`Staff आज ${availability.label} है। किसी available staff को assign करें या Admin खुद token handle करें。`,availability:availability.label});
        if(x.action==='transfer'&&!t.staff_id)return json(res,400,{error:'Transfer के लिए पहले staff assignment जरूरी है'});
        if(x.action==='transfer'&&String(x.from_staff_id||'')!==String(t.staff_id))return json(res,409,{error:'Transfer source staff current assignment से match नहीं करता'});
        if(x.action==='assign'&&t.staff_id&&String(t.staff_id)!==staffId)return json(res,409,{error:'Token पहले से दूसरे staff को assigned है। Transfer action इस्तेमाल करें।'});
        if(String(t.staff_id||'')===staffId)return json(res,409,{error:'Token पहले से इसी staff को assigned है'});
        const previousStaffId=t.staff_id||null,previousStaff=db.staff.find(z=>z.staff_id===previousStaffId);
        t.staff_id=st.staff_id;t.assigned_at=now();t.assignment_revision=Number(t.assignment_revision||0)+1;t.last_action_at=t.assigned_at;
        const actionLabel=x.action==='transfer'?'Token Transferred':'Token Assigned';
        const message=x.action==='transfer'?`Token ${t.token} अब ${st.name} को transfer किया गया है।`:`Token ${t.token} ${st.name} को assign किया गया है।`;
        notifyCustomer(t.mobile,'token','info',actionLabel,message,{token_id:t.id,application_id:t.application_id||null,staff_id:st.staff_id,staff_name:st.name,previous_staff_id:previousStaffId,event_key:`staff-assignment:${t.id}:${t.assignment_revision}`});
        db.audit.unshift({id:newId(),action:'TOKEN_'+x.action.toUpperCase(),token_id:t.id,from_staff_id:previousStaffId,from_staff_name:previousStaff?.name||null,staff_id:st.staff_id,staff_name:st.name,reason:String(x.reason||'').trim().slice(0,200),by:a.user||'admin',at:now()});
      }else if(x.action==='priority'){
        const enabled=Boolean(x.enabled);const reason=String(x.reason||'').trim().slice(0,200);
        if(enabled&&!reason)return json(res,400,{error:'Priority reason जरूरी है'});
        t.priority=enabled?1:0;t.priority_reason=enabled?reason:null;t.priority_set_by=a.user||'admin';t.priority_set_at=now();t.last_action_at=now();notifyCustomer(t.mobile,'token','info',enabled?'Priority Token Set':'Priority Token Removed',enabled?`Token ${t.token} को priority दिया गया है।`:`Token ${t.token} की priority हटाई गई है।`,{token_id:t.id,application_id:t.application_id,event_key:`token-priority:${t.id}:${enabled?'on':'off'}:${Number(t.state_revision||0)+1}`});
        db.audit.unshift({id:newId(),action:enabled?'TOKEN_PRIORITY_SET':'TOKEN_PRIORITY_REMOVED',token_id:t.id,reason,by:a.user||'admin',at:now()});
      }else if(x.action==='notify'){
        const title=String(x.title||'Token Update').trim().slice(0,120),message=String(x.message||'').trim().slice(0,300);
        if(!message)return json(res,400,{error:'Notification message जरूरी है'});
        db.notifications=db.notifications||[];db.notifications.unshift({id:newId(),type:'token',severity:'info',title,message,mobile:t.mobile,token_id:t.id,read:false,created_at:now()});
        db.audit.unshift({id:newId(),action:'TOKEN_NOTIFICATION_CREATED',token_id:t.id,by:a.user||'admin',at:now()});
      }else if(x.action==='cancel'){
        if(!tokenTransitionAllowed(t.status,'रद्द'))return json(res,400,{error:'इस token state से cancel allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200);if(!reason)return json(res,400,{error:'Cancel reason जरूरी है'});
        t.status='रद्द';t.cancel_reason=reason;t.cancelled_at=now();t.last_action_at=t.cancelled_at;notifyCustomer(t.mobile,'token','error','Token Cancelled',`Token ${t.token} cancel कर दिया गया है। Reason: ${reason}`,{token_id:t.id,application_id:t.application_id,event_key:`token-cancel:${t.id}`});
      }else if(x.action==='complete'){
        if(!tokenCanComplete(t))return json(res,400,{error:'Complete के लिए token In Progress और Final Quality Review Passed होना जरूरी है'});
        t.status='पूर्ण';t.completed_at=now();t.last_action_at=t.completed_at;const completedApp=applicationFor(t.application_id);if(completedApp)completedApp.status='Completed';generateReceiptForCompletion(t,a.user||'admin');notifyCustomer(t.mobile,'completion','success','Service Completed',`Token ${t.token} की service completed हो गई है।`,{token_id:t.id,application_id:t.application_id});
      }else return json(res,400,{error:'Unknown token action'});
      t.state_revision=Number(t.state_revision||0)+1;if(tokenRequestId)t.last_action_request_id=tokenRequestId;t.last_action_at=t.last_action_at||now();
      const afterTokenState=tokenAuditSnapshot(t);
      const tokenAuditId=newId();
      db.audit.unshift({id:tokenAuditId,action:'ADMIN_TOKEN_'+String(x.action).toUpperCase(),token_id:t.id,from_status:beforeTokenState?.status||null,status:t.status,state_revision:t.state_revision,request_id:tokenRequestId||null,before:beforeTokenState,after:afterTokenState,by:a.user||'admin',at:now()});save();return json(res,200,t)
    }
    if(p==='/api/payments'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const total=db.payments.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0);return json(res,200,{payments:db.payments.map(customerPayment),total_paid:total,pending_count:db.payments.filter(x=>x.status==='Pending Verification').length})}
    if(p==='/api/payments'&&req.method==='POST'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),method=String(x.method||'').trim(),service=String(x.service||'').trim(),amount=Number(x.amount),utr=String(x.utr||'').trim(),sp=serviceParts(service),cfg=getServiceConfig(sp.category,sp.service);
      const idemKey=paymentIdempotencyKey(req,x);
      const idemFingerprint=paymentFingerprint([name,mobile,method,service,amount,utr,x.application_id||'',x.offer_id||'']);
      const existingIdem=findPaymentIdempotency('manual-payment',idemKey,idemFingerprint);
      if(existingIdem?.conflict)return json(res,409,{error:'Same idempotency key different payment payload के साथ reuse नहीं हो सकता।'});
      if(existingIdem?.payment_id){const existingPayment=db.payments.find(z=>Number(z.id)===Number(existingIdem.payment_id));if(existingPayment)return json(res,200,customerPayment(existingPayment));}if(!serviceExists(service))return json(res,400,{error:'Valid service जरूरी है'});if(!cfg.paymentRequired)return json(res,409,{error:'इस service के लिए payment workflow लागू नहीं है।'});if(!name||!validMobile(mobile)||!service||!Number.isFinite(amount)||amount<=0||!['Cash','UPI','QR','Bank Transfer'].includes(method))return json(res,400,{error:'Valid name, mobile, amount और payment mode जरूरी हैं'});if(x.payment_date&&!validIsoDate(x.payment_date))return json(res,400,{error:'Payment date invalid है या future date है'});const offerId=Number(x.offer_id||0)||null;const expectedAmount=payableAmountFor(service,offerId);if(!Number.isFinite(expectedAmount)||expectedAmount<=0)return json(res,400,{error:'Service payable amount configured नहीं है या selected offer अब valid नहीं है'});if(Math.abs(amount-expectedAmount)>0.009)return json(res,400,{error:`Payment amount से match नहीं करता। Expected ₹${expectedAmount.toFixed(2)}`});if(method!=='Cash'&&(!utr&&!x.proof_data))return json(res,400,{error:'UPI/Bank payment के लिए UTR या payment screenshot/proof में से कम-से-कम एक जरूरी है'});if(utr&&db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है'});const app=x.application_id?applicationFor(x.application_id):null;if(x.application_id&&!app)return json(res,400,{error:'Application ID नहीं मिला'});let proof=null;if(method!=='Cash'&&x.proof_data){try{proof=safeImage(x.proof_data)}catch(e){return json(res,400,{error:e.message})}}const id=newId(),verified=method==='Cash',t=now(),pay={id,txn_id:'PAY-'+String(id).slice(-8),name,mobile,amount,method,utr:method==='Cash'?'':utr,status:verified?'Verified':'Pending Verification',created_at:x.payment_date||t,receipt_no:null,service,payable_amount_snapshot:expectedAmount,offer_id:offerId,offer_title:offerId?activeOfferById(offerId)?.title||null:null,application_id:app?.id||null,verified_by:verified?(db.settings.operator||'Admin'):null,verified_at:verified?t:null,reject_reason:null,screenshot:proof?.url||null,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null};db.payments.push(pay);if(app)app.status=verified?'Payment Verified':'Payment Verification Pending';if(idemKey)rememberPaymentIdempotency('manual-payment',idemKey,idemFingerprint,{payment_id:id});db.audit.unshift({id:newId(),action:'MANUAL_PAYMENT_CREATED',payment_id:id,by:db.settings.operator||'Admin',at:t});save();return json(res,200,customerPayment(pay))
    }
    if(p==='/api/payments/status'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),pay=db.payments.find(z=>z.id===Number(x.id));if(!pay)return json(res,404,{error:'Payment नहीं मिला'});if(!PAYMENT_LIFECYCLE[pay.status])return json(res,409,{error:'Payment lifecycle state invalid है'});if(!lifecycleCanMove(PAYMENT_LIFECYCLE,pay.status,x.status))return json(res,409,{error:`Payment transition ${pay.status} → ${x.status} allowed नहीं है।`});
      const at=now(),app=applicationFor(pay.application_id);if(x.status==='Verified'&&pay.status==='Verified')return json(res,409,{error:'Payment पहले से Verified है'});if(x.status==='Verified'&&pay.screenshot&&!pay.proof_viewed_at)return json(res,409,{error:'पहले payment screenshot/proof देखें, फिर Verify करें'});if(x.status==='Verified'){pay.status='Verified';pay.verified_by=a.user||db.settings.operator||'Admin';pay.verified_at=at;pay.reject_reason=null;const recharge=(db.recharge_transactions||[]).find(r=>Number(r.payment_id)===Number(pay.id));if(recharge){recharge.payment_verified_at=at;recharge.updated_at=at;recharge.state_revision=Number(recharge.state_revision||0)+1;recharge.status_history=Array.isArray(recharge.status_history)?recharge.status_history:[];if(!recharge.status_history.some(h=>h.status==='Payment Verified'))recharge.status_history.push({status:'Payment Verified',at,reason:'Admin verified payment'});}if(app)app.status='Payment Verified';notifyCustomer(pay.mobile,'payment','success','Payment Verified','आपका payment verify हो गया है।',{payment_id:pay.id,application_id:pay.application_id});db.audit.unshift({id:newId(),action:'PAYMENT_VERIFIED',payment_id:pay.id,by:pay.verified_by,at})}else if(x.status==='Rejected'){pay.status='Rejected';pay.reject_reason=String(x.reason||'Payment proof rejected').slice(0,500);const recharge=(db.recharge_transactions||[]).find(r=>Number(r.payment_id)===Number(pay.id));if(recharge){recharge.payment_rejected_at=at;recharge.failure_reason=recharge.failure_reason||pay.reject_reason;recharge.updated_at=at;recharge.state_revision=Number(recharge.state_revision||0)+1;recharge.status_history=Array.isArray(recharge.status_history)?recharge.status_history:[];if(!recharge.status_history.some(h=>h.status==='Payment Rejected'))recharge.status_history.push({status:'Payment Rejected',at,reason:pay.reject_reason});if(recharge.status==='Pending'){recharge.status='Failed';recharge.failed_at=at;recharge.failure_reason=recharge.failure_reason||'Payment verification rejected';recharge.status_history.push({status:'Failed',at,reason:recharge.failure_reason});}}pay.verified_by=a.user||db.settings.operator||'Admin';pay.verified_at=at;if(app)app.status='Payment Rejected';notifyCustomer(pay.mobile,'payment','error','Payment Rejected',`आपका payment verification reject हुआ है। कारण: ${pay.reject_reason}`,{payment_id:pay.id,application_id:pay.application_id});db.audit.unshift({id:newId(),action:'PAYMENT_REJECTED',payment_id:pay.id,reason:pay.reject_reason,by:pay.verified_by,at})}else return json(res,400,{error:'Status must be Verified or Rejected'});save();return json(res,200,customerPayment(pay))
    }
    if(p.startsWith('/api/payments/proof/')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const ref=decodeURIComponent(p.split('/').pop()||'');
      let pay=null;
      if(/^\d+$/.test(ref)) pay=db.payments.find(x=>String(x.id)===ref)||null;
      else pay=db.payments.find(x=>path.basename(String(x.screenshot||''))===path.basename(ref))||null;
      if(!pay?.screenshot)return json(res,404,{error:'Proof not found'});
      const file=path.basename(pay.screenshot);
      if(!PAYMENT_PROOF_FILE_RE.test(file))return json(res,404,{error:'Proof not found'});
      const fp=path.join(UPLOAD_DIR,file);
      if(!fs.existsSync(fp))return json(res,404,{error:'Proof file not found'});
      pay.proof_viewed_at=now();pay.proof_viewed_by=a.user||db.settings.operator||'Admin';
      db.audit.unshift({id:newId(),action:'PAYMENT_PROOF_VIEWED',payment_id:pay.id,by:pay.proof_viewed_by,at:pay.proof_viewed_at});save();
      const ext=path.extname(fp).toLowerCase(),ct=ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);
      res.writeHead(200,{'Content-Type':ct,'Content-Disposition':ct==='application/pdf'?'inline':'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b)
    }
    if(p==='/api/customers'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const q=(u.searchParams.get('q')||'').toLowerCase(),map={};for(const c of (db.customers||[])){if(!c.mobile)continue;map[c.mobile]={id:c.customer_id||c.id||c.mobile,name:c.name||c.mobile,mobile:c.mobile,services:0,last_service:'—',active:c.status!=='blocked'}}for(const x of db.payments.concat(db.tokens)){if(!x.mobile)continue;map[x.mobile]??={id:x.mobile,name:x.name||x.mobile,mobile:x.mobile,services:0,last_service:'—',active:true};if(x.service)map[x.mobile].last_service=x.service}for(const r of Object.values(map)){r.services=new Set(db.payments.concat(db.tokens).filter(x=>x.mobile===r.mobile&&x.service).map(x=>x.service)).size}return json(res,200,{customers:Object.values(map).filter(x=>!q||String(x.name).toLowerCase().includes(q)||x.mobile.includes(q))})}
    if(p==='/api/applications'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{applications:db.applications})}
    if(p==='/api/customer/documents'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),applicationId=Number(x.application_id),files=Array.isArray(x.files)?x.files:[];
      const app=db.applications.find(z=>Number(z.id)===applicationId&&z.mobile===c.mobile);if(!app)return json(res,404,{error:'Application नहीं मिला'});
      const tokenForApp=db.tokens.find(t=>Number(t.application_id)===Number(app.id)&&t.mobile===c.mobile&&!['रद्द','स्किप'].includes(t.status));if(!tokenForApp)return json(res,409,{error:'Documents upload करने से पहले Live Token generate होना जरूरी है।'});
      if(!files.length||files.length>5)return json(res,400,{error:'1 से 5 documents तक upload करें'});
      const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp']);let total=0,prepared=[];
      for(const item of files){const mime=String(item?.mime_type||'').toLowerCase(),document_type=String(item?.document_type||'').trim().slice(0,100),original=path.basename(String(item?.name||'')).slice(0,160),raw=String(item?.data||'').replace(/^data:[^;]+;base64,/,'').replace(/\s/g,'');if(!original||!allowed.has(mime)||!raw)return json(res,400,{error:'Unsupported document type or empty file'});let buf;try{buf=Buffer.from(raw,'base64')}catch{return json(res,400,{error:'Invalid document data'})}if(!buf.length||buf.length>5*1024*1024)return json(res,400,{error:'प्रत्येक document अधिकतम 5 MB हो सकता है'});if(!validateFileSignature(buf,mime))return json(res,400,{error:'File content does not match declared document type'});total+=buf.length;if(total>10*1024*1024)return json(res,400,{error:'एक application के documents कुल 10 MB तक हो सकते हैं'});const ext=mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';prepared.push({mime,document_type,original,buf,ext})}
      const created=[],written=[];
      try{for(const item of prepared){const documentId='DOC-'+crypto.randomUUID(),filename=crypto.randomUUID()+item.ext,fp=path.join(DOCUMENT_UPLOAD_DIR,filename);fs.writeFileSync(fp,item.buf,{flag:'wx'});written.push(fp);const sha256=crypto.createHash('sha256').update(item.buf).digest('hex');const ocr_status=item.mime.startsWith('image/')?'queued':'not_supported';const row={id:newId(),document_id:documentId,application_id:app.id,customer_id:c.customer_id,document_type:item.document_type||'Unspecified',name:item.original,original_name:item.original,mime_type:item.mime,size:item.buf.length,sha256,path:filename,status:'uploaded',ocr_status,created_at:now(),created_by:c.customer_id};db.documents.unshift(row);created.push({...row,path:undefined})}}
      catch(e){for(const fp of written){try{fs.unlinkSync(fp)}catch{}}return json(res,500,{error:'Document storage failed; no document records were committed'})}
      db.audit.unshift({id:newId(),action:'CUSTOMER_DOCUMENTS_UPLOADED',application_id:app.id,customer_id:c.customer_id,count:created.length,by:c.mobile,at:now()});save();for(const row of created)if(row.ocr_status==='queued')enqueueDocumentOcr(row.document_id);return json(res,201,{documents:created.map(x=>({...x,path:undefined})),ocr:'queued'});
    }
    if(p==='/api/customer/documents'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const applicationId=Number(u.searchParams.get('application_id')||0);const apps=db.applications.filter(a=>a.mobile===c.mobile).map(a=>a.id);const rows=db.documents.filter(x=>apps.includes(Number(x.application_id))&&(!applicationId||Number(x.application_id)===applicationId)).map(x=>({id:x.id,document_id:x.document_id,application_id:x.application_id,document_type:x.document_type||'Unspecified',name:x.name,mime_type:x.mime_type,size:x.size,status:x.status,sha256:x.sha256,ocr_status:x.ocr_status||'not_run',created_at:x.created_at}));return json(res,200,{documents:rows})}
    if(p==='/api/documents'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req), applicationId=Number(x.application_id), files=Array.isArray(x.files)?x.files:[];
      const app=db.applications.find(z=>Number(z.id)===applicationId);if(!app)return json(res,404,{error:'Application ID नहीं मिला'});
      if(!files.length||files.length>5)return json(res,400,{error:'1 से 5 documents तक upload करें'});
      const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
      let total=0;const prepared=[];
      for(const item of files){
        const mime=String(item?.mime_type||'').toLowerCase();
        const original=path.basename(String(item?.name||'')).slice(0,160);
        const raw=String(item?.data||'').replace(/^data:[^;]+;base64,/,'').replace(/\s/g,'');
        if(!original||!allowed.has(mime)||!raw)return json(res,400,{error:'Unsupported document type or empty file'});
        let buf;try{buf=Buffer.from(raw,'base64')}catch{return json(res,400,{error:'Invalid document data'})}
        if(!buf.length||buf.length>5*1024*1024)return json(res,400,{error:'प्रत्येक document अधिकतम 5 MB हो सकता है'});if(!validateFileSignature(buf,mime))return json(res,400,{error:'File content does not match declared document type'});
        total+=buf.length;if(total>10*1024*1024)return json(res,400,{error:'एक application के documents कुल 10 MB तक हो सकते हैं'});
        const ext=mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';
        prepared.push({mime,document_type,original,buf,ext});
      }
      const created=[],written=[];
      try{
        for(const item of prepared){
          const documentId='DOC-'+crypto.randomUUID();const filename=crypto.randomUUID()+item.ext;const fp=path.join(DOCUMENT_UPLOAD_DIR,filename);
          fs.writeFileSync(fp,item.buf,{flag:'wx'});written.push(fp);
          const sha256=crypto.createHash('sha256').update(item.buf).digest('hex');
          const ocr_status=item.mime.startsWith('image/')?'queued':'not_supported';
          const row={id:newId(),document_id:documentId,application_id:app.id,customer_id:app.customer_id||null,document_type:item.document_type||'Unspecified',name:item.original,original_name:item.original,mime_type:item.mime,size:item.buf.length,sha256,path:filename,status:'uploaded',ocr_status,created_at:now(),created_by:a.user||'admin'};
          db.documents.unshift(row);created.push({...row,path:undefined});
        }
      }catch(e){for(const fp of written){try{fs.unlinkSync(fp)}catch{}};return json(res,500,{error:'Document storage failed; no document records were committed'});}
      db.audit.unshift({id:newId(),action:'APPLICATION_DOCUMENTS_UPLOADED',application_id:app.id,count:created.length,by:a.user||'admin',at:now()});
      save();for(const row of created)if(row.ocr_status==='queued')enqueueDocumentOcr(row.document_id);return json(res,201,{documents:created.map(x=>({...x,path:undefined})),ocr:'queued'});
    }
    if(p==='/api/documents'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const applicationId=Number(u.searchParams.get('application_id'));
      const rows=db.documents.filter(x=>!applicationId||Number(x.application_id)===applicationId).map(x=>({id:x.id,document_id:x.document_id,application_id:x.application_id,document_type:x.document_type||'Unspecified',name:x.name,mime_type:x.mime_type,size:x.size,sha256:x.sha256,status:x.status,created_at:x.created_at,created_by:x.created_by}));
      return json(res,200,{documents:rows});
    }
    if(p==='/api/applications'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),sp=serviceParts(service),cfg=getServiceConfig(sp.category,sp.service);if(!name||!validMobile(mobile)||!serviceExists(service))return json(res,400,{error:'Valid name, mobile और sub-service जरूरी है'});const a={id:newId(),application_id:nextCode('applications','application_id','APP',4),name,mobile,service,category:sp.category,address:String(x.address||''),note:String(x.note||''),status:cfg.paymentRequired?'Payment Pending':'Application Submitted',created_at:now()};db.applications.push(a);save();return json(res,200,a)}
    if(p==='/api/admin/business-management'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const verified=db.payments.filter(x=>x.status==='Verified');
      const todayKey=today();
      const todayPayments=verified.filter(x=>String(x.created_at||'').slice(0,10)===todayKey);
      const completed=db.tokens.filter(x=>x.status==='पूर्ण');
      const pending=db.tokens.filter(x=>['लंबित','बुलाया','प्रगति','होल्ड'].includes(x.status));
      const staffWork={};for(const t of db.tokens){if(!t.staff_id)continue;const st=db.staff.find(x=>x.staff_id===t.staff_id);const k=t.staff_id;staffWork[k]??={staff_id:k,staff_name:st?.name||k,assigned:0,pending:0,completed:0};staffWork[k].assigned++;if(t.status==='पूर्ण')staffWork[k].completed++;else if(!['रद्द','स्किप'].includes(t.status))staffWork[k].pending++;}
      const serviceMap={};for(const pmt of verified){const k=pmt.service||'Unknown';serviceMap[k]??={service:k,applications:0,collection:0};serviceMap[k].collection+=Number(pmt.amount||0);}
      for(const app of db.applications){const k=app.service||'Unknown';if(serviceMap[k])serviceMap[k].applications++;}
      const totalCollection=verified.reduce((a,x)=>a+Number(x.amount||0),0),todayCollection=todayPayments.reduce((a,x)=>a+Number(x.amount||0),0),expenses=db.expenses.reduce((a,x)=>a+Number(x.amount||0),0),commissions=db.commissions.reduce((a,x)=>a+Number(x.amount||0),0);
      return json(res,200,{summary:{daily_collection:money(todayCollection),total_collection:money(totalCollection),service_income:money(totalCollection),customer_count:new Set(db.applications.map(x=>x.mobile).concat(db.payments.map(x=>x.mobile)).filter(Boolean)).size,pending_work:pending.length,completed_work:completed.length,expenses:money(expenses),commissions:money(commissions),net_income:money(totalCollection-expenses-commissions)},service_wise_income:Object.values(serviceMap).sort((a,b)=>b.collection-a.collection).map(x=>({...x,collection:money(x.collection)})),staff_wise_work:Object.values(staffWork),recent_completed:completed.slice().sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,50),generated_at:now()});
    }
    if(p==='/api/audit'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{audit:db.audit})}
    if(p==='/api/admin/token-lifecycle-health'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const result=tokenLifecycleHealthMonitor();db.audit.unshift({id:newId(),action:'TOKEN_LIFECYCLE_HEALTH_CHECK',ok:result.ok,issue_count:result.issue_count,by:a.user||'admin',at:result.checked_at});save();return json(res,result.ok?200:503,result);}
    if(p==='/api/admin/token-lifecycle-reconcile'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const u=new URL(req.url,'http://localhost'),tokenId=Number(u.searchParams.get('token_id')||0);
      if(!tokenId)return json(res,400,{error:'token_id जरूरी है'});
      const t=db.tokens.find(z=>Number(z.id)===tokenId);if(!t)return json(res,404,{error:'Token नहीं मिला'});
      const result=tokenLifecycleReconcile(t);return json(res,result.ok?200:409,{...result,generated_at:now()});
    }
    if(p==='/api/admin/token-history'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const u=new URL(req.url,'http://localhost'),tokenId=Number(u.searchParams.get('token_id')||0),limit=Math.min(200,Math.max(1,Number(u.searchParams.get('limit')||100)));
      if(!tokenId)return json(res,400,{error:'token_id जरूरी है'});const t=db.tokens.find(z=>Number(z.id)===tokenId);if(!t)return json(res,404,{error:'Token नहीं मिला'});
      const audit=(db.audit||[]).filter(x=>Number(x.token_id)===tokenId).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,limit);
      const notifications=(db.notifications||[]).filter(x=>Number(x.token_id)===tokenId).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,limit).map(x=>({id:x.id,type:x.type,severity:x.severity,title:x.title,message:x.message,read:!!x.read_at,created_at:x.created_at,event_key:x.event_key||null,state_revision:x.state_revision??null,application_id:x.application_id||null,payment_id:x.payment_id||null}));
      const events=audit.filter(x=>String(x.action||'').startsWith('ADMIN_TOKEN_')||String(x.action||'').startsWith('STAFF_TASK_')||String(x.action||'').startsWith('TOKEN_')).map(x=>({audit_id:x.id,action:x.action,at:x.at,by:x.by||x.employee_id||x.user||null,status:x.status||x.after?.status||x.from_status||null,state_revision:x.state_revision??x.after?.state_revision??null,request_id:x.request_id||null,before:x.before||null,after:x.after||null,reason:x.reason||x.after?.hold_reason||x.after?.cancel_reason||null}));
      return json(res,200,{token:publicToken(t),events,notifications,counts:{audit:events.length,notifications:notifications.length}});
    }
    if(p==='/api/notifications'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{notifications:db.notifications})}
    if(p==='/api/notifications/read'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req);if(!x.id)db.notifications.forEach(n=>n.read_at=now());else{const n=db.notifications.find(z=>Number(z.id)===Number(x.id));if(n)n.read_at=now()}save();return json(res,200,{ok:true})}
    if(p==='/api/admin/homepage-hero'&&req.method==='POST') {
      const a=admin(req); if(!a)return json(res,401,{error:'Unauthorized'});
      const x=await body(req); if(!x?.image_data)return json(res,400,{error:'Homepage image जरूरी है'});
      let image; try{image=safeHomepageHeroImage(x.image_data)}catch(e){return json(res,400,{error:e.message})}
      const previous=String(db.settings.homepage_hero_image||'');
      db.settings.homepage_hero_image=image.url;
      db.audit.unshift({id:newId(),action:'ADMIN_HOMEPAGE_HERO_IMAGE_UPDATED',file:image.filename,sha256:image.sha256,by:a.user||db.settings.operator||'Admin',at:now()});
      save();
      if(previous.startsWith('/api/public/homepage-hero/')){try{const old=path.basename(previous); if(/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(old))fs.rmSync(path.join(HOME_HERO_UPLOAD_DIR,old),{force:true})}catch{}}
      return json(res,200,{ok:true,homepage_hero_image:image.url,filename:image.filename});
    }
    if(p.startsWith('/api/public/homepage-hero/')&&req.method==='GET'){
      const ref=path.basename(decodeURIComponent(p.split('/').pop()||''));
      if(!/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(ref))return json(res,404,{error:'Homepage image not found'});
      const configured=String(db.settings.homepage_hero_image||'');
      if(path.basename(configured)!==ref)return json(res,404,{error:'Homepage image not found'});
      const fp=path.join(HOME_HERO_UPLOAD_DIR,ref); if(!fs.existsSync(fp))return json(res,404,{error:'Homepage image file not found'});
      const ext=path.extname(fp).toLowerCase(),ct=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);
      res.writeHead(200,{...corsHeaders(req),'Content-Type':ct,'Cache-Control':'no-store','Content-Length':b.length,'X-Content-Type-Options':'nosniff'}); return res.end(b);
    }
    if(p==='/api/public-config'&&req.method==='GET'){
      const s=db.settings||{};
      return json(res,200,{centre:String(s.centre||'Angelstore CSC'),operator:String(s.operator||''),upi_id:String(s.upi_id||''),payee_name:String(s.payee_name||''),payment_qr_path:String(s.payment_qr_path||'assets/payment-qr.jpg'),homepage_hero_image:String(s.homepage_hero_image||'assets/customer-home-reference-visual-crop.png'),bank_name:String(s.bank_name||''),bank_account_name:String(s.bank_account_name||''),bank_account_number:String(s.bank_account_number||''),bank_ifsc:String(s.bank_ifsc||''),bank_branch:String(s.bank_branch||'')});
    }
    if(p==='/api/settings'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{settings:db.settings})}
    if(p==='/api/settings'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req);if(!x||typeof x!=='object'||Array.isArray(x))return json(res,400,{error:'Invalid settings'});db.settings={...db.settings,centre:String(x.centre??db.settings.centre),operator:String(x.operator??db.settings.operator),notify:String(x.notify??db.settings.notify),counters:String(x.counters??db.settings.counters),fee:String(x.fee??db.settings.fee),footer:String(x.footer??db.settings.footer),upi_id:String(x.upi_id??db.settings.upi_id??''),payee_name:String(x.payee_name??db.settings.payee_name??''),payment_qr_path:String(x.payment_qr_path??db.settings.payment_qr_path??'assets/payment-qr.jpg'),homepage_hero_image:String(x.homepage_hero_image??db.settings.homepage_hero_image??'assets/customer-home-reference-visual-crop.png'),bank_name:String(x.bank_name??db.settings.bank_name??''),bank_account_name:String(x.bank_account_name??db.settings.bank_account_name??''),bank_account_number:String(x.bank_account_number??db.settings.bank_account_number??''),bank_ifsc:String(x.bank_ifsc??db.settings.bank_ifsc??''),bank_branch:String(x.bank_branch??db.settings.bank_branch??''),default_home_fee:money(x.default_home_fee??db.settings.default_home_fee??50),default_delivery_fee:money(x.default_delivery_fee??db.settings.default_delivery_fee??40),default_home_staff_allowance:money(x.default_home_staff_allowance??db.settings.default_home_staff_allowance??20),default_delivery_staff_allowance:money(x.default_delivery_staff_allowance??db.settings.default_delivery_staff_allowance??15)};save();return json(res,200,{settings:db.settings})}
    if(p==='/api/system/integrity'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});
      const result=integrityCheck();
      db.audit.unshift({id:newId(),action:'SYSTEM_INTEGRITY_CHECK',ok:result.ok,by:a.user||'admin',at:result.checked_at});save();
      return json(res,result.ok?200:503,result);
    }
    if(p==='/api/control-center'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const {from,to}=rangeParams(u);return json(res,200,controlCenter(from,to))}
    if(p==='/api/reports/service'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const {from,to}=rangeParams(u);return json(res,200,{services:serviceAnalytics(from,to)})}
    if(p==='/api/reports/staff'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const {from,to}=rangeParams(u);return json(res,200,{staff:staffPerformance(from,to)})}
    if(p==='/api/customer-history'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const h=customerHistory(u.searchParams.get('mobile')||'');if(!h)return json(res,400,{error:'Valid 10 digit mobile जरूरी है'});return json(res,200,h)}
    if(p==='/api/reports'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const {from,to}=rangeParams(u);const inRange=d=>inDateRange(d,from,to);const toks=db.tokens.filter(x=>inRange(x.date||String(x.created_at).slice(0,10)));const completed=toks.filter(x=>x.status==='पूर्ण').length,pending=toks.filter(x=>x.status==='लंबित').length,cancelled=toks.filter(x=>x.status==='रद्द').length;const byService={};toks.forEach(x=>byService[x.service]=(byService[x.service]||0)+1);const popular=Object.entries(byService).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';const activeForWait=toks.filter(x=>!['पूर्ण','रद्द','स्किप'].includes(x.status));const average_wait_minutes=activeForWait.length?Math.round(activeForWait.reduce((a,x)=>a+Number(tokenQueueMeta(x).estimated_wait_minutes||0),0)/activeForWait.length):0;const daily={};toks.forEach(x=>{const d=x.date||String(x.created_at).slice(0,10);daily[d]=(daily[d]||0)+1});const verified=db.payments.filter(x=>x.status==='Verified'&&inRange(String(x.created_at).slice(0,10)));return json(res,200,{summary:{total:toks.length,completed,pending,cancelled},revenue:money(verified.reduce((a,x)=>a+Number(x.amount||0),0)),popular:{service:popular},daily:Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,n])=>({d,n})),service_analytics:serviceAnalytics(from,to),staff_performance:staffPerformance(from,to),average_wait_minutes,control:controlCenter(from,to)})}
    if(p==='/api/admin/export-audit'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),type=String(x.type||'').trim().toLowerCase(),allowed=['token_report','financial_report','business_report'];if(!allowed.includes(type))return json(res,400,{error:'Invalid export type'});const {from,to}=rangeParams(new URL('http://local/?from='+encodeURIComponent(String(x.from||''))+'&to='+encodeURIComponent(String(x.to||''))));db.audit.unshift({id:newId(),action:'ADMIN_CSV_EXPORT',export_type:type,from:from||null,to:to||null,by:a.user||'admin',at:now()});save();return json(res,200,{ok:true})}
    if(p==='/api/report.csv'&&req.method==='GET'){const a=admin(req);if(!a){res.writeHead(401);return res.end('Unauthorized')}const {from,to}=rangeParams(u),inRange=d=>inDateRange(d,from,to),esc=v=>'"'+String(v??'').replaceAll('"','""')+'"',maskMobile=v=>{const m=String(v??'');return m.length>=4?'******'+m.slice(-4):'******'},maskUtr=v=>{const z=String(v??'');return z?('******'+z.slice(-4)):''};const rows=db.tokens.filter(x=>inRange(x.date||String(x.created_at).slice(0,10)));let csv='Token,Name,Mobile,Service,Status,Created,Payment,UTR,Receipt\n'+rows.map(x=>{const pay=db.payments.find(p=>p.id===x.payment_id);return [x.token,x.name,maskMobile(x.mobile),x.service,x.status,x.created_at,pay?.amount||'',maskUtr(pay?.utr),pay?.receipt_no||''].map(esc).join(',')}).join('\n');db.audit.unshift({id:newId(),action:'ADMIN_CSV_EXPORT',export_type:'token_report',from:from||null,to:to||null,row_count:rows.length,by:a.user||'admin',at:now()});save();res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="angelstore-report.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(csv)}
    if(p==='/admin') return serveStatic({...req,url:'/admin.html'},res);
    if(p==='/customer') return serveStatic({...req,url:'/customer.html'},res);
    return serveStatic(req,res)
  }catch(e){console.error(e);if(e?.message==='Invalid JSON')return json(res,400,{error:'Invalid JSON request'});if(e?.message==='Payload too large')return json(res,413,{error:'Request payload too large'});return json(res,500,{error:'Server error'})}
}

const server=http.createServer(route);
server.requestTimeout=120000;
server.headersTimeout=15000;
server.keepAliveTimeout=5000;
server.maxRequestsPerSocket=1000;
server.on('clientError',(err,socket)=>{try{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')}catch{}});
const HOST=process.env.HOST || '0.0.0.0';
const INSTANCE_LOCK_FILE=path.resolve(process.env.ANGELSTORE_INSTANCE_LOCK || path.join(STORAGE_ROOT,'angelstore.server.lock'));
let instanceLockHeld=false;
function acquireInstanceLock(){
  try{
    const fd=fs.openSync(INSTANCE_LOCK_FILE,'wx');
    fs.writeFileSync(fd,JSON.stringify({pid:process.pid,port:PORT,started_at:now()}));
    fs.closeSync(fd); instanceLockHeld=true; return;
  }catch(e){
    if(e.code!=='EEXIST')throw e;
    let stale=false;
    try{
      const raw=JSON.parse(fs.readFileSync(INSTANCE_LOCK_FILE,'utf8'));
      const pid=Number(raw?.pid||0);
      if(!pid || pid===process.pid) stale=true;
      else { try{ process.kill(pid,0); }catch(err){ stale=err.code==='ESRCH'; } }
    }catch{ stale=true; }
    if(stale){ fs.rmSync(INSTANCE_LOCK_FILE,{force:true}); return acquireInstanceLock(); }
    throw new Error(`Another Angelstore server instance is already using this storage (${INSTANCE_LOCK_FILE}). Stop the existing server before starting another instance.`);
  }
}
function releaseInstanceLock(){if(!instanceLockHeld)return;try{fs.rmSync(INSTANCE_LOCK_FILE,{force:true})}catch{}instanceLockHeld=false;}
(async()=>{
  acquireInstanceLock();
  try{
    await startMonitoring();
    server.listen(PORT,HOST,()=>{scheduleBackups();console.log(`Angelstore CSC backend listening on ${HOST}:${PORT}`);});
  }catch(e){releaseInstanceLock();throw e;}
})();
function shutdown(signal){console.log(`Received ${signal}; shutting down safely...`);releaseInstanceLock();server.close(()=>process.exit(0));setTimeout(()=>{releaseInstanceLock();process.exit(1)},10000).unref();}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('exit',releaseInstanceLock);
// Production misconfiguration already process.exit(1) at module load.

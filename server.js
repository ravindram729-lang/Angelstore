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
const AUTH_SECRET=process.env.ANGELSTORE_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USER=String(process.env.ANGELSTORE_ADMIN_USER||'').trim();
const ADMIN_PASS=String(process.env.ANGELSTORE_ADMIN_PASS||'');
const FRONTEND_ORIGIN=process.env.ANGELSTORE_CORS_ORIGIN||(IS_PRODUCTION?'':'*');
const FRONTEND_ORIGINS=String(FRONTEND_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
const VALID_PRODUCTION_ORIGIN=FRONTEND_ORIGINS.length>0 && FRONTEND_ORIGINS.every(x=>/^https:\/\/[^*\s]+$/i.test(x));
function corsOrigin(req){const origin=String(req.headers.origin||'');if(FRONTEND_ORIGINS.includes('*'))return '*';return FRONTEND_ORIGINS.includes(origin)?origin:FRONTEND_ORIGINS[0]||''}
function corsHeaders(req){return {'Access-Control-Allow-Origin':corsOrigin(req),'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Customer-Session, X-Staff-Session','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Vary':'Origin'}}
const WEAK_PASSWORDS=new Set(['Love@143','Love@143#','password','password123','admin123','admin@123','changeme','change-me','ravindram143']);
const PRODUCTION_CONFIG_ERROR=IS_PRODUCTION && (!AUTH_SECRET || AUTH_SECRET.length<32 || !ADMIN_USER || !ADMIN_PASS || ADMIN_PASS.length<12 || !VALID_PRODUCTION_ORIGIN || WEAK_PASSWORDS.has(ADMIN_PASS) || WEAK_PASSWORDS.has(ADMIN_USER));
if(PRODUCTION_CONFIG_ERROR){
  console.error('Angelstore production configuration invalid. Set ANGELSTORE_AUTH_SECRET (>=32 chars), ANGELSTORE_ADMIN_USER, ANGELSTORE_ADMIN_PASS (>=12 chars, not a known default) and ANGELSTORE_CORS_ORIGIN to one or more explicit HTTPS origins, comma-separated.');
  process.exit(1);
}
const DATA=STORAGE.DATA_FILE;
const STORAGE_ROOT=STORAGE.STORAGE_ROOT;
const UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','payments'));
const DOCUMENT_UPLOAD_DIR=path.resolve(process.env.ANGELSTORE_DOCUMENT_UPLOAD_DIR || path.join(STORAGE_ROOT,'uploads','documents'));
const DOCUMENT_FILE_RE=/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(pdf|jpg|jpeg|png|webp)$/i;
const BACKUP_DIR=path.resolve(process.env.ANGELSTORE_BACKUP_DIR || path.join(STORAGE_ROOT,'backups'));
const UUID_FILE_BASE='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const LEGACY_HEX_FILE_BASE='[a-f0-9]{36}';
const PAYMENT_PROOF_FILE_RE=new RegExp(`^(?:${UUID_FILE_BASE}|${LEGACY_HEX_FILE_BASE})\.(png|jpg|webp)$`,'i');
const OFFSITE_BACKUP_URL=String(process.env.ANGELSTORE_OFFSITE_BACKUP_URL||'').trim();
const OFFSITE_BACKUP_TOKEN=String(process.env.ANGELSTORE_OFFSITE_BACKUP_TOKEN||'').trim();
const OFFSITE_BACKUP_ENCRYPTION_KEY=String(process.env.ANGELSTORE_OFFSITE_BACKUP_ENCRYPTION_KEY||'').trim();
const OCR_MAX_CONCURRENCY=Math.max(1,Number(process.env.ANGELSTORE_OCR_MAX_CONCURRENCY||2));
let ocrActive=0;
const OCR_QUEUE=[];
function runOcrLimited(task){return new Promise((resolve,reject)=>{const run=()=>{ocrActive++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{ocrActive--;const next=OCR_QUEUE.shift();if(next)next()})};if(ocrActive<OCR_MAX_CONCURRENCY)run();else OCR_QUEUE.push(run)})}
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
db.staff_sessions=db.staff_sessions||[];
db.admin_sessions=db.admin_sessions||[];
db.incidents=db.incidents||[];

function save(){STORAGE.save(db)}
function monitorSnapshot(){
  const integrity=integrityCheck();
  const storage=storageStatus();
  let backupFiles=[]; try{backupFiles=fs.readdirSync(BACKUP_DIR).filter(x=>/^angelstore-[\w.-]+\.json$/.test(x));}catch{}
  let latest=null;
  for(const name of backupFiles){try{const st=fs.statSync(path.join(BACKUP_DIR,name));if(!latest||st.mtimeMs>latest.mtimeMs)latest={name,mtimeMs:st.mtimeMs,created_at:st.mtime.toISOString()};}catch{}}
  const backupAgeMinutes=latest?Math.max(0,(Date.now()-latest.mtimeMs)/60000):null;
  const backupOverdue=!latest || backupAgeMinutes > (SCHEDULED_BACKUP_HOURS*60*BACKUP_OVERDUE_MULTIPLIER);
  return {integrity,storage,backup:{configured:SCHEDULED_BACKUP_ENABLED,overdue:backupOverdue,age_minutes:backupAgeMinutes,last_backup:latest?.name||null},offsite:{configured:!!OFFSITE_BACKUP_URL},checked_at:now()};
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
  if(SCHEDULED_BACKUP_ENABLED && OFFSITE_BACKUP_URL && !OFFSITE_BACKUP_ENCRYPTION_KEY)checks.push({type:'OFFSITE_BACKUP_ENCRYPTION',severity:'warning',message:'Off-site backups are configured without application-level encryption'});
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
    'Access-Control-Allow-Origin':(res._corsOrigin||FRONTEND_ORIGIN),'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Customer-Session, X-Staff-Session','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'",...(IS_PRODUCTION?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{}),...extra,'Content-Length':b.length
  });res.end(b)
}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>15*1024*1024){reject(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
function b64u(v){return Buffer.from(v).toString('base64url')}
function sign(payload){const p=b64u(JSON.stringify(payload));const s=crypto.createHmac('sha256',AUTH_SECRET).update(p).digest('base64url');return p+'.'+s}
function verify(token,kind){try{const [p,s]=String(token||'').split('.');if(!p||!s)return null;const expected=crypto.createHmac('sha256',AUTH_SECRET).update(p).digest('base64url');const a=Buffer.from(s),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;const x=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));if(Number(x.exp)<=Date.now()||x.kind!==kind)return null;return x}catch{return null}}
function admin(req){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const x=verify(h.slice(7),'admin');if(!x)return null;if(x.sid){const active=db.admin_sessions.find(s=>s.sid===x.sid&&!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now());if(!active)return null}return x}
function customer(req){const h=String(req.headers['x-customer-session']||'');const a=String(req.headers.authorization||'');const raw=h||(a.startsWith('Bearer ')?a.slice(7):'');const x=verify(raw,'customer');if(!x)return null;if(x.sid){const active=db.customer_sessions.find(s=>s.sid===x.sid&&s.customer_id===x.customer_id&&!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now());if(!active)return null}return x}
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
function serviceExists(service){return chargeFor(service)!==null}
function serviceConfigDefaults(category, service){
  const raw=(String(category)+' '+String(service)).toLowerCase();
  const noToken=/(recharge|bill payment|shopping|affiliate|electronic|property|real estate|local service|delivery|pickup|transport|tractor|rotavator|farm labour|agriculture|dairy|milk collection|shuttering|repair|cleaning|ac service|cooler|ro|water purifier|furniture|solar|product)/i.test(raw);
  const paymentRequired=chargeFor(String(category)+' — '+String(service))!==null && Number(chargeFor(String(category)+' — '+String(service)))>0;
  return {paymentRequired,manualVerification:paymentRequired,tokenRequired:!noToken,appointmentRequired:/appointment|home visit|home service/i.test(raw),documentsRequired:true,qualityReview:!noToken,receiptRequired:paymentRequired,notifications:true,applicationTracking:!noToken,staffAssignment:!noToken};
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
function notifyCustomer(mobile,type,severity,title,message,extra={}){ if(!mobile)return null; db.notifications=db.notifications||[]; const eventKey=String(extra.event_key||[type,extra.application_id||'',extra.payment_id||'',extra.token_id||'',extra.document_id||'',title].join(':')); const existing=db.notifications.find(n=>n.mobile===mobile&&n.event_key===eventKey); if(existing)return existing; const n={id:newId(),type,severity,title,message,mobile,read:false,created_at:now(),event_key:eventKey,...extra}; db.notifications.unshift(n); return n; }

function tokenTransitionAllowed(from,to){return TOKEN_TRANSITIONS[from]?.has(to)===true}
function activeQueueToken(){return db.tokens.find(z=>['बुलाया','प्रगति'].includes(z.status))||null}
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
function customerTokenFor(name,mobile,applicationId){return sign({kind:'customer',name:String(name),mobile:String(mobile),application_id:applicationId||null,exp:Date.now()+30*24*60*60*1000})}
function safeImage(data){
  const s=String(data||'');const m=s.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('Valid PNG/JPEG/WEBP screenshot जरूरी है');
  const buf=Buffer.from(m[2],'base64');if(buf.length<32||buf.length>5*1024*1024)throw new Error('Screenshot 5 MB से बड़ा नहीं हो सकता');
  const ok=(m[1]==='image/png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(m[1]==='image/jpeg'&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))||(m[1]==='image/webp'&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP');
  if(!ok)throw new Error('Screenshot file content invalid है');
  const ext=m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg',name=crypto.randomUUID()+'.'+ext,sha256=crypto.createHash('sha256').update(buf).digest('hex');fs.writeFileSync(path.join(UPLOAD_DIR,name),buf,{flag:'wx'});return {url:'/api/payments/proof/'+name,filename:name,sha256}
}
function tokenQueueMeta(t){
  const activeStatuses=new Set(['पूर्ण','रद्द','स्किप']);
  const waiting=db.tokens.filter(x=>!activeStatuses.has(x.status)&&x.date===t.date&&x.service===t.service);
  const ordered=waiting.slice().sort((a,b)=>{const ap=Number(a.priority||0),bp=Number(b.priority||0);if(ap!==bp)return bp-ap;return Number(a.id||0)-Number(b.id||0)});
  const pos=Math.max(1,ordered.findIndex(x=>Number(x.id)===Number(t.id))+1);
  const ahead=ordered.slice(0,pos-1);
  const completed=db.tokens.filter(x=>x.service===t.service&&x.status==='पूर्ण'&&x.date===t.date);
  const durations=completed.map(x=>{if(!x.started_at||!x.completed_at)return 0;return Math.max(0,new Date(x.completed_at).getTime()-new Date(x.started_at).getTime()-Number(x.total_hold_ms||0))}).filter(x=>x>0);
  const avg=durations.length?Math.max(1,Math.round(durations.reduce((a,b)=>a+b,0)/durations.length/60000)):15;
  return {queue_position:pos,waiting_count:waiting.filter(x=>x.status==='लंबित').length,ahead_count:ahead.filter(x=>x.status==='लंबित').length,estimated_wait_minutes:Math.max(0,ahead.filter(x=>x.status==='लंबित').length*avg),service_average_minutes:avg};
}
function publicToken(t){
  const holdStarted=t.hold_started_at?new Date(t.hold_started_at).getTime():null;
  const delayMinutes=Math.max(0,Number(t.hold_delay_minutes||0));
  const deadline=holdStarted&&delayMinutes?holdStarted+delayMinutes*60000:null;
  const remaining=deadline?Math.ceil((deadline-Date.now())/60000):null;
  const history=Array.isArray(t.hold_history)?t.hold_history:[];
  const totalHoldMs=history.reduce((n,h)=>n+Math.max(0,Number(h.duration_ms||0)),0)+(t.status==='होल्ड'&&holdStarted?Math.max(0,Date.now()-holdStarted):0);
  const workflow=t.workflow||{};
  const qm=tokenQueueMeta(t);
  const staff=t.staff_id?db.staff.find(x=>x.staff_id===t.staff_id):null;
  const elapsedMs=t.started_at?Math.max(0,(t.completed_at?new Date(t.completed_at):new Date()).getTime()-new Date(t.started_at).getTime()-totalHoldMs):0;
  const expectedMs=Number(t.expected_duration_minutes||qm.service_average_minutes)*60000;
  return {id:t.id,token:t.token,name:t.name||'',mobile:t.mobile||'',service:t.service,status:t.status,created_at:t.created_at,date:t.date,application_id:t.application_id||null,
    priority:Number(t.priority||0),priority_reason:t.priority_reason||null,queue_position:qm.queue_position,waiting_count:qm.waiting_count,ahead_count:qm.ahead_count,estimated_wait_minutes:qm.estimated_wait_minutes,service_average_minutes:qm.service_average_minutes,
    staff_id:t.staff_id||null,staff_name:staff?.name||null,assigned_at:t.assigned_at||null,
    started_at:t.started_at||null,completed_at:t.completed_at||null,elapsed_minutes:Math.floor(elapsedMs/60000),expected_duration_minutes:Number(t.expected_duration_minutes||qm.service_average_minutes),delay_minutes:Math.max(0,Math.floor((elapsedMs-expectedMs)/60000)),
    hold_reason:t.hold_reason||null,hold_owner:t.hold_owner||null,hold_delay_minutes:delayMinutes||null,hold_started_at:t.hold_started_at||null,hold_deadline:deadline?new Date(deadline).toISOString():null,
    hold_remaining_minutes:remaining,hold_overdue:!!(deadline&&remaining<0),hold_extensions:Number(t.hold_extensions||0),hold_history_count:history.length,total_hold_minutes:Math.floor(totalHoldMs/60000),
    skip_reason:t.skip_reason||null,recall_count:Number(t.recall_count||0),last_action_at:t.last_action_at||null,quality_status:t.quality_status||'needs_review',
    work_summary:{photo:workflow.photo||'pending',signature:workflow.signature||'pending',documents:workflow.documents||'pending',uploads:workflow.uploads||'pending',data:workflow.data||'pending',submission:workflow.submission||'pending',reference_no:workflow.reference_no||'',notes:workflow.notes||'',updated_at:workflow.updated_at||null}};
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
    `Completed By: ${pay.completed_by||tok?.staff_id||'—'}`,
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
function syncApplicationStatusForDocuments(app){
  if(!app)return;
  const docs=db.documents.filter(d=>Number(d.application_id)===Number(app.id));
  if(docs.some(d=>String(d.status||'').toLowerCase()==='rejected')){app.status='Correction Required';return;}
  const required=sopFor(app.service).documents||[];
  if(documentGate(app,required).ok){
    if(!['Completed','Correction Required'].includes(String(app.status||'')) && !String(app.status||'').toLowerCase().includes('processing')) app.status='Documents Verified';
  }
}
function findCompletedReceipt(id){
  const pay=db.payments.find(x=>Number(x.id)===Number(id));
  if(!pay||pay.status!=='Verified'||!pay.receipt_no)return null;
  const tok=db.tokens.find(t=>Number(t.payment_id)===Number(pay.id)&&t.status==='पूर्ण');
  if(!tok)return null;
  return {pay,tok,app:applicationFor(tok.application_id||pay.application_id)};
}

function customerPayment(p){return {id:p.id,txn_id:p.txn_id,name:p.name,mobile:p.mobile,service:p.service,amount:p.amount,method:p.method,utr:p.utr,status:p.status,created_at:p.created_at,receipt_no:p.receipt_no,token_id:p.token_id||null,reject_reason:p.reject_reason||null,verified_at:p.verified_at||null,proof_available:!!p.screenshot,proof_viewed_at:p.proof_viewed_at||null,official_fee:money(p.official_fee),staff_commission:money(p.staff_commission),payment_charge:money(p.payment_charge)}}
function customerProgressFor(mobile, applicationId){
  const apps=db.applications.filter(a=>a.mobile===mobile);
  const app=applicationId?apps.find(a=>Number(a.id)===Number(applicationId)):apps.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0];
  const token=(app?db.tokens.filter(t=>Number(t.application_id)===Number(app.id)):db.tokens.filter(t=>t.mobile===mobile)).slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
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
  const items=[
    {id:'payment',label:'Payment Verified',weight:10,done:payment?.status==='Verified',detail:payment?.status||'Pending'},
    {id:'photo',label:'Photo',weight:10,done:done(workflow.photo),detail:workflow.photo||'pending'},
    {id:'signature',label:'Signature',weight:10,done:done(workflow.signature),detail:workflow.signature||'pending'},
    {id:'documents',label:'Documents',weight:25,done:docRatio>=1,detail:`${docs.length}/${requiredDocs.length||0} uploaded`},
    {id:'data',label:'Data Cross-check',weight:15,done:done(workflow.data),detail:workflow.data||'pending'},
    {id:'submission',label:'Submission',weight:15,done:done(workflow.submission),detail:workflow.reference_no||workflow.submission||'pending'},
    {id:'quality',label:'Quality Review',weight:10,done:quality?.status==='passed'||token?.quality_status==='passed',detail:quality?.status||token?.quality_status||'needs_review'},
    {id:'final',label:'Final Completion',weight:5,done:token?.status==='पूर्ण',detail:token?.status||'pending'}
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
  const allowed=new Set(['','.html','.js','.css','.png','.jpg','.jpeg','.webp','.svg','.ico','.woff','.woff2','.map']);
  if(!allowed.has(ext))return null;
  const p=path.normalize(path.join(ROOT,u));
  return p.startsWith(ROOT+path.sep)?p:null;
}
function serveStatic(req,res){const p=safeStaticPath(new URL(req.url,'http://localhost').pathname);if(!p)return json(res,403,{error:'Forbidden'});fs.readFile(p,(e,b)=>{if(e)return json(res,404,{error:'Not found'});const ext=path.extname(p).toLowerCase();const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'",...(IS_PRODUCTION?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{})});res.end(b)})}

let loginAttempts=new Map();
let customerLoginAttempts=new Map();
let guestApplicationAttempts=new Map();
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
  if(!ADMIN_USER||!ADMIN_PASS)return false;
  const c=adminPasswordHash(ADMIN_PASS);
  db.admin_credentials=[{username:ADMIN_USER,salt:c.salt,hash:c.hash,created_at:now(),updated_at:now(),source:'environment-bootstrap'}];
  return true;
}

function validPin(pin){return /^[0-9]{4,6}$/.test(String(pin||''))}
function customerRecordByIdentifier(identifier){const key=String(identifier||'').trim();return db.customers.find(x=>x.customer_id===key||x.mobile===key)||null}
function customerSessionFor(c,sid){return sign({kind:'customer',sid,customer_id:c.customer_id,mobile:c.mobile,name:c.name,exp:Date.now()+30*24*60*60*1000})}
function customerPublic(c){return {customer_id:c.customer_id,name:c.name,mobile:c.mobile,status:c.status||'active',pin_set:Boolean(c.pin_hash),created_at:c.created_at,updated_at:c.updated_at}}
function qrPayloadFor(c){return `ANGELSTORE|CUSTOMER|${c.customer_id}`}
function loginAllowed(ip){const x=loginAttempts.get(ip)||{n:0,at:0};if(Date.now()-x.at>15*60*1000){x.n=0;x.at=Date.now()}return x.n<10}
function failLogin(ip){const x=loginAttempts.get(ip)||{n:0,at:Date.now()};x.n++;x.at=Date.now();loginAttempts.set(ip,x)}
let staffLoginAttempts=new Map();
function staffLoginAllowed(ip){const x=staffLoginAttempts.get(ip)||{n:0,at:0};if(Date.now()-x.at>15*60*1000){x.n=0;x.at=Date.now()}return x.n<8}
function failStaffLogin(ip){const x=staffLoginAttempts.get(ip)||{n:0,at:Date.now()};x.n++;x.at=Date.now();staffLoginAttempts.set(ip,x)}
function cleanupSessions(){const t=Date.now();db.admin_sessions=db.admin_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t);db.staff_sessions=db.staff_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t);db.customer_sessions=db.customer_sessions.filter(x=>!x.revoked_at&&new Date(x.expires_at).getTime()>t)}
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
  atomicWriteFile(path.join(snapshotDir,'manifest.json'),JSON.stringify({version:2,payment_proofs:payments,documents},null,2));
  return {name,path:fp,created_at:now(),upload_snapshot:snapshotDir,proof_files:payments.length,document_files:documents.length};
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
  const rawPayload=JSON.stringify(backupBundlePayload(backup));
  const encrypted=encryptOffsitePayload(rawPayload);
  const payload=JSON.stringify(encrypted||{version:1,encrypted:false,backup:JSON.parse(rawPayload)});
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
function staffAuth(req){const raw=String(req.headers['x-staff-session']||'');const x=verify(raw,'staff');if(!x)return null;const active=db.staff_sessions?.find(z=>z.sid===x.sid&&z.staff_id===x.staff_id&&!z.revoked_at&&new Date(z.expires_at).getTime()>Date.now());if(!active)return null;const st=db.staff.find(z=>z.staff_id===x.staff_id&&z.status!=='inactive');return st?{...x,record:st}:null}
const STAFF_ROLE_PERMISSIONS={
  viewer:['dashboard','view_assigned','quality_view'],
  staff:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review'],
  senior_staff:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review'],
  supervisor:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','staff_view','queue_manage'],
  manager:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review','staff_view','queue_manage','reports_view'],
  // Legacy role aliases retained so existing staff records do not lose access during migration.
  mistri:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review'],
  operator:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review'],
  home_agent:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review'],
  delivery_agent:['dashboard','view_assigned','task_update','quality_view','quality_submit','document_review']
};
function staffRoleName(st){const role=String(st?.role||'staff').trim().toLowerCase();return STAFF_ROLE_PERMISSIONS[role]?role:'staff'}
function staffHasPermission(st,permission){return Boolean(STAFF_ROLE_PERMISSIONS[staffRoleName(st)]?.includes(permission))}
function staffPublic(st){const role=staffRoleName(st);return {staff_id:st.staff_id,employee_id:st.employee_id,name:st.name,mobile:st.mobile,role,status:st.status||'active',permissions:[...STAFF_ROLE_PERMISSIONS[role]],daily_rate:Number(st.daily_rate||0),created_at:st.created_at}}
function staffTask(t){return {id:t.id,token:t.token,name:t.name,mobile:t.mobile,service:t.service,status:t.status,created_at:t.created_at,date:t.date,staff_id:t.staff_id||null,assigned_at:t.assigned_at||null,started_at:t.started_at||null,resumed_at:t.resumed_at||null,completed_at:t.completed_at||null,last_action_at:t.last_action_at||null,hold_reason:t.hold_reason||null,hold_owner:t.hold_owner||null,hold_delay_minutes:Number(t.hold_delay_minutes||0)||null,hold_started_at:t.hold_started_at||null,hold_deadline:t.hold_deadline||null,total_hold_minutes:Number(t.total_hold_minutes||0),quality_status:t.quality_status||'needs_review',quality_reviewed_at:t.quality_reviewed_at||null}}


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
function publicHome(h){return {id:h.id,home_service_id:h.home_service_id,customer_id:h.customer_id,name:h.name,mobile:h.mobile,service:h.service,address:h.address,preferred_date:h.preferred_date,preferred_time:h.preferred_time,status:h.status,staff_id:h.staff_id||null,fee:money(h.home_service_fee),travel_cost:money(h.home_travel_cost),staff_allowance:money(h.staff_allowance),created_at:h.created_at,assigned_at:h.assigned_at||null,completed_at:h.completed_at||null}}
function publicDelivery(d){return {id:d.id,delivery_id:d.delivery_id,customer_id:d.customer_id,name:d.name,mobile:d.mobile,token_id:d.token_id||null,address:d.address,status:d.status,delivery_fee:money(d.delivery_fee),actual_cost:money(d.actual_cost),staff_allowance:money(d.staff_allowance),staff_id:d.staff_id||null,created_at:d.created_at,assigned_at:d.assigned_at||null,delivered_at:d.delivered_at||null}}
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

async function route(req,res){
  if(req.method==='OPTIONS'){res.writeHead(204,corsHeaders(req));return res.end()}
  const u=new URL(req.url,'http://localhost'),p=u.pathname;
  res._corsOrigin=corsOrigin(req);
  try{
    if(p==='/api/health')return json(res,PRODUCTION_CONFIG_ERROR?503:200,{ok:!PRODUCTION_CONFIG_ERROR,service:'angelstore-csc-backend',time:now(),environment:IS_PRODUCTION?'production':'local',configuration:PRODUCTION_CONFIG_ERROR?'invalid':'ok'});
    if(p==='/api/admin/monitoring'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const r=await reconcileIncidents('admin');return json(res,200,{ok:r.open.length===0,monitor:r.monitor,incidents:r.open,alert_webhook_configured:!!ALERT_WEBHOOK_URL,interval_minutes:MONITOR_INTERVAL_MINUTES});}
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
      staffLoginAttempts.delete(ip);cleanupSessions();const sid=crypto.randomBytes(18).toString('hex'); db.staff_sessions.push({sid,staff_id:st.staff_id,created_at:now(),expires_at:new Date(Date.now()+12*60*60*1000).toISOString()});
      db.audit.unshift({id:newId(),action:'STAFF_LOGIN',staff_id:st.staff_id,by:st.employee_id,at:now()}); save(); return json(res,200,{session:staffSessionFor(st,sid),staff:staffPublic(st)})
    }
    if(p==='/api/staff/logout'&&req.method==='POST'){const s=staffAuth(req);if(!s)return json(res,401,{error:'Staff session required'});const row=db.staff_sessions.find(z=>z.sid===s.sid);if(row)row.revoked_at=now();save();return json(res,200,{ok:true})}
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
      if(sa&&t&&Number(t.staff_id)!==Number(sa.staff_id))return json(res,403,{error:'यह token आपके लिए assigned नहीं है'});
      const aid=applicationId||t?.application_id||null;
      if(t&&!aid)return json(res,200,{token_id:t.id,application_id:null,documents:[]});
      if(sa&&!t&&aid){const assigned=db.tokens.find(z=>Number(z.application_id)===aid&&Number(z.staff_id)===Number(sa.staff_id));if(!assigned)return json(res,403,{error:'यह application आपके assigned task में नहीं है'});t=assigned}
      const rows=db.documents.filter(d=>!aid||Number(d.application_id)===Number(aid)).map(d=>({id:d.id,document_id:d.document_id,application_id:d.application_id,name:d.name,mime_type:d.mime_type,size:d.size,status:d.status||'uploaded',ocr_status:d.ocr_status||'not_run',ocr_fields:d.ocr_fields||extractOcrFields(d.ocr_text||''),created_at:d.created_at,created_by:d.created_by}));
      return json(res,200,{token_id:t?.id||tokenId||null,application_id:aid,documents:rows});
    }
    if(p.startsWith('/api/documents/')&&p.endsWith('/file')&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'view_assigned'))return json(res,403,{error:'इस staff role को document देखने की अनुमति नहीं है'});
      const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);if(!d)return json(res,404,{error:'Document नहीं मिला'});
      const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id));if(sa&&(!t||Number(t.staff_id)!==Number(sa.staff_id)))return json(res,403,{error:'यह document आपके assigned task में नहीं है'});
      const file=path.basename(String(d.path||''));if(!file||!DOCUMENT_FILE_RE.test(file))return json(res,404,{error:'Document file नहीं मिला'});const fp=path.join(DOCUMENT_UPLOAD_DIR,file);if(!fs.existsSync(fp))return json(res,404,{error:'Document file नहीं मिला'});
      d.viewed_at=now();d.viewed_by=aa?.user||sa?.employee_id||'staff';db.audit.unshift({id:newId(),action:'DOCUMENT_VIEWED',document_id:d.id,application_id:d.application_id,by:d.viewed_by,at:d.viewed_at});save();
      const ct={'application/pdf':'application/pdf','image/png':'image/png','image/webp':'image/webp','image/jpeg':'image/jpeg'}[String(d.mime_type||'').toLowerCase()]||'application/octet-stream';const b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':ct,'Content-Disposition':`inline; filename="${String(d.name||'document').replace(/[^A-Za-z0-9._ -]/g,'_')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p.startsWith('/api/documents/')&&p.endsWith('/download')&&req.method==='GET'){
      const aa=admin(req),sa=staffAuth(req),cs=customerSession(req);if(!aa&&!sa&&!cs)return json(res,401,{error:'Authentication required'});
      const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);if(!d)return json(res,404,{error:'Document नहीं मिला'});
      const app=db.applications.find(x=>Number(x.id)===Number(d.application_id));
      const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id));
      if(sa&&(!t||Number(t.staff_id)!==Number(sa.staff_id)))return json(res,403,{error:'यह document आपके assigned task में नहीं है'});
      if(cs&&(!app||((app.customer_id!=null&&Number(app.customer_id)!==Number(cs.customer_id))&&(String(app.mobile)!==String(cs.mobile)))))return json(res,403,{error:'यह document आपके account का नहीं है'});
      const file=path.basename(String(d.path||''));if(!file||!DOCUMENT_FILE_RE.test(file))return json(res,404,{error:'Document file नहीं मिला'});const fp=path.join(DOCUMENT_UPLOAD_DIR,file);if(!fs.existsSync(fp))return json(res,404,{error:'Document file नहीं मिला'});
      const by=aa?.user||sa?.employee_id||cs?.customer_id||'customer';d.downloaded_at=now();d.downloaded_by=by;db.audit.unshift({id:newId(),action:'DOCUMENT_DOWNLOADED',document_id:d.id,application_id:d.application_id,by,at:d.downloaded_at});save();
      const ct={'application/pdf':'application/pdf','image/png':'image/png','image/webp':'image/webp','image/jpeg':'image/jpeg'}[String(d.mime_type||'').toLowerCase()]||'application/octet-stream';const b=fs.readFileSync(fp);const safeName=String(d.name||'document').replace(/[^A-Za-z0-9._ -]/g,'_');res.writeHead(200,{'Content-Type':ct,'Content-Disposition':`attachment; filename="${safeName}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p.startsWith('/api/documents/')&&req.method==='DELETE'){
      const aa=admin(req),sa=staffAuth(req),cs=customerSession(req);if(!aa&&!sa&&!cs)return json(res,401,{error:'Authentication required'});
      const id=Number(p.split('/')[3]||0),idx=db.documents.findIndex(x=>Number(x.id)===id);if(idx<0)return json(res,404,{error:'Document नहीं मिला'});
      const d=db.documents[idx];
      const app=db.applications.find(x=>Number(x.id)===Number(d.application_id));
      const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id));
      if(sa&&(!t||Number(t.staff_id)!==Number(sa.staff_id)))return json(res,403,{error:'यह document आपके assigned task में नहीं है'});
      if(cs&&(!app||((app.customer_id!=null&&Number(app.customer_id)!==Number(cs.customer_id))&&(String(app.mobile)!==String(cs.mobile)))))return json(res,403,{error:'यह document आपके account का नहीं है'});
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
      const aa=admin(req),sa=staffAuth(req);if(!aa&&!sa)return json(res,401,{error:'Authentication required'});if(sa&&!staffHasPermission(sa.record,'document_review'))return json(res,403,{error:'इस staff role को document review की अनुमति नहीं है'});const id=Number(p.split('/')[3]||0),d=db.documents.find(x=>Number(x.id)===id);if(!d)return json(res,404,{error:'Document नहीं मिला'});const t=db.tokens.find(x=>Number(x.application_id)===Number(d.application_id));if(sa&&(!t||Number(t.staff_id)!==Number(sa.staff_id)))return json(res,403,{error:'यह document आपके assigned task में नहीं है'});
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
      if(x.action==='start'){if(!tokenTransitionAllowed(t.status,'प्रगति'))return json(res,400,{error:'इस task state से Start allowed नहीं है'});t.status='प्रगति';t.started_at=t.started_at||now();const startApp=applicationFor(t.application_id);if(startApp)startApp.status='Processing'}
      else if(x.action==='resume'){if(t.status!=='होल्ड')return json(res,400,{error:'Hold state से ही Resume किया जा सकता है'});t.status='प्रगति';t.resumed_at=now()}
      else if(x.action==='complete'){if(!tokenCanComplete(t))return json(res,400,{error:'Final Quality Review पहले पूरा करें। Required checklist पूरा होना जरूरी है।'});t.status='पूर्ण';t.completed_at=now();const pay=t.payment_id?db.payments.find(z=>Number(z.id)===Number(t.payment_id)):null;const app=applicationFor(t.application_id);if(app)app.status='Completed';const receiptResult=generateReceiptForCompletion(t,s.employee_id);if(pay&&!receiptResult?.generated){db.audit.unshift({id:newId(),action:'SERVICE_COMPLETED_WITHOUT_VERIFIED_PAYMENT',payment_id:pay.id,token_id:t.id,by:s.employee_id,at:t.completed_at})}}
      else if(x.action==='hold'){if(!tokenTransitionAllowed(t.status,'होल्ड'))return json(res,400,{error:'इस task state से Hold allowed नहीं है'});t.status='होल्ड'}
      else return json(res,400,{error:'Unknown task action'});
      db.audit.unshift({id:newId(),action:'STAFF_TASK_'+String(x.action).toUpperCase(),token_id:t.id,staff_id:s.staff_id,by:s.employee_id,at:now()});save();return json(res,200,staffTask(t))
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
      else if(x.action==='assign'){const t=db.tokens.find(z=>Number(z.id)===Number(x.token_id));if(!t)return json(res,404,{error:'Token नहीं मिला'});if(!['लंबित','बुलाया','प्रगति','होल्ड'].includes(t.status))return json(res,400,{error:'Closed/skipped token assign नहीं किया जा सकता'});if(t.staff_id&&t.staff_id!==st.staff_id)return json(res,409,{error:'Token पहले से दूसरे staff को assigned है'});t.staff_id=st.staff_id;t.assigned_at=t.assigned_at||now();db.audit.unshift({id:newId(),action:'TOKEN_ASSIGNED',token_id:t.id,staff_id:st.staff_id,by:'admin',at:now()})}
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
      if(x.action==='assign'){if(!aa)return json(res,403,{error:'Admin only'});if(!['Requested','Assigned'].includes(h.status))return json(res,400,{error:'इस home service state में assignment allowed नहीं है'});const st=db.staff.find(z=>z.staff_id===String(x.staff_id)&&z.status==='active');if(!st)return json(res,400,{error:'Active staff नहीं मिला'});h.staff_id=st.staff_id;h.assigned_at=h.assigned_at||now();h.status='Assigned'}
      else if(x.action==='start'){if(!sa||h.staff_id!==sa.staff_id)return json(res,403,{error:'यह home service आपके लिए assigned नहीं है'});if(h.status!=='Assigned')return json(res,400,{error:'Start के लिए home service Assigned होना चाहिए'});h.status='In Progress'}
      else if(x.action==='complete'){if(!sa||h.staff_id!==sa.staff_id)return json(res,403,{error:'यह home service आपके लिए assigned नहीं है'});if(h.status!=='In Progress')return json(res,400,{error:'Complete के लिए home service In Progress होना चाहिए'});h.status='Completed';h.completed_at=now()}
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
      const id=Number(p.split('/').pop()),x=await body(req),d=db.deliveries.find(z=>Number(z.id)===id);if(!d)return json(res,404,{error:'Delivery नहीं मिली'});const sa=staffAuth(req),aa=admin(req);if(!sa&&!aa)return json(res,401,{error:'Authentication required'});
      if(x.action==='assign'){if(!aa)return json(res,403,{error:'Admin only'});if(!['Ready','Assigned'].includes(d.status))return json(res,400,{error:'इस delivery state में assignment allowed नहीं है'});const st=db.staff.find(z=>z.staff_id===String(x.staff_id)&&z.status==='active');if(!st)return json(res,400,{error:'Active staff नहीं मिला'});d.staff_id=st.staff_id;d.assigned_at=d.assigned_at||now();d.status='Assigned'}
      else if(['pickup','out_for_delivery','deliver'].includes(x.action)){if(!sa||d.staff_id!==sa.staff_id)return json(res,403,{error:'यह delivery आपके लिए assigned नहीं है'});const expected={pickup:'Assigned',out_for_delivery:'Picked Up',deliver:'Out for Delivery'}[x.action];if(d.status!==expected)return json(res,400,{error:`${x.action} के लिए current status ${expected} होना चाहिए`});d.status={pickup:'Picked Up',out_for_delivery:'Out for Delivery',deliver:'Delivered'}[x.action];if(x.action==='deliver')d.delivered_at=now()}
      else if(x.action==='cancel'){if(!aa)return json(res,403,{error:'Admin only'});if(['Delivered','Cancelled'].includes(d.status))return json(res,400,{error:'Delivered/Cancelled delivery को cancel नहीं किया जा सकता'});d.status='Cancelled'}
      else return json(res,400,{error:'Unknown action'});
      db.audit.unshift({id:newId(),action:'DELIVERY_'+String(x.action).toUpperCase(),delivery_id:d.delivery_id,staff_id:d.staff_id||null,by:aa?.user||sa?.employee_id||'system',at:now()});save();return json(res,200,publicDelivery(d));
    }
    if(p==='/api/staff/attendance'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const staffId=u.searchParams.get('staff_id')||'',from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';return json(res,200,{attendance:staffAttendanceRows(staffId,from,to)});
    }
    if(p==='/api/staff/attendance'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),staffId=String(x.staff_id||''),date=String(x.date||today()).slice(0,10),status=String(x.status||'present');
      if(!db.staff.some(z=>z.staff_id===staffId))return json(res,404,{error:'Staff नहीं मिला'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['present','absent','half_day','leave'].includes(status))return json(res,400,{error:'Valid staff, date और attendance status जरूरी है'});
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
      const sid=crypto.randomBytes(18).toString('hex');const session=customerSessionFor(c,sid);db.customer_sessions.unshift({id:newId(),sid,customer_id:c.customer_id,mobile:c.mobile,created_at:now(),expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'CUSTOMER_REGISTERED',customer_id:c.customer_id,by:c.mobile,at:now()});save();return json(res,201,{customer:customerPublic(c),session_token:session,qr_payload:qrPayloadFor(c)})
    }
    if(p==='/api/customer/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown', key='l:'+ip, nowMs=Date.now(), a=customerLoginAttempts.get(key)||{n:0,at:nowMs}; if(nowMs-a.at>15*60*1000){a.n=0;a.at=nowMs} if(a.n>=10)return json(res,429,{error:'बहुत अधिक login attempts. 15 मिनट बाद फिर कोशिश करें।'}); const x=await body(req),identifier=String(x.identifier||x.mobile||x.customer_id||'').trim(),pin=String(x.pin||''); const c=customerRecordByIdentifier(identifier); const pinOk=c&&c.pin_hash&&c.pin_salt?pinVerify(pin,c.pin_salt,c.pin_hash):pinVerify(pin,dummyPinCredential().salt,dummyPinCredential().hash); if(!c||!pinOk){a.n++;a.at=nowMs;customerLoginAttempts.set(key,a);return json(res,401,{error:'Customer ID/mobile या PIN गलत है'})} customerLoginAttempts.delete(key); const sid=crypto.randomBytes(18).toString('hex');const session=customerSessionFor(c,sid);db.customer_sessions.unshift({id:newId(),sid,customer_id:c.customer_id,mobile:c.mobile,created_at:now(),expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'CUSTOMER_LOGIN',customer_id:c.customer_id,by:c.mobile,at:now()});save();return json(res,200,{customer:customerPublic(c),session_token:session,qr_payload:qrPayloadFor(c)})
    }
    if(p==='/api/customer/me'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const row=db.customers.find(z=>z.customer_id===c.customer_id&&z.mobile===c.mobile);if(!row)return json(res,404,{error:'Customer account नहीं मिला'});return json(res,200,{customer:customerPublic(row),qr_payload:qrPayloadFor(row)})
    }
    if(p==='/api/customer/logout'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});db.customer_sessions.forEach(s=>{if(s.customer_id===c.customer_id&&!s.revoked_at)s.revoked_at=now()});db.audit.unshift({id:newId(),action:'CUSTOMER_LOGOUT',customer_id:c.customer_id,by:c.mobile,at:now()});save();return json(res,200,{ok:true})
    }
    if(p==='/api/auth/logout'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const row=db.admin_sessions.find(x=>x.sid===a.sid);if(row)row.revoked_at=now();db.audit.unshift({id:newId(),action:'ADMIN_LOGOUT',by:a.user||'admin',at:now()});save();return json(res,200,{ok:true});
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
    if(p.startsWith('/api/admin/backups/')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const name=path.basename(decodeURIComponent(p.slice('/api/admin/backups/'.length)));if(!/^angelstore-[\w.-]+\.json$/.test(name))return json(res,400,{error:'Invalid backup name'});const fp=path.join(BACKUP_DIR,name);if(!fs.existsSync(fp))return json(res,404,{error:'Backup नहीं मिला'});const b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b);
    }
    if(p==='/api/admin/restore'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),name=path.basename(String(x.name||'')),currentPassword=String(x.current_password||'');const cred=adminCredential();if(!currentPassword||!cred||!adminPasswordVerify(currentPassword,cred.salt,cred.hash))return json(res,403,{error:'Restore के लिए current Admin password दोबारा verify करना जरूरी है'});if(!/^angelstore-[\w.-]+\.json$/.test(name))return json(res,400,{error:'Valid backup name जरूरी है'});const fp=path.join(BACKUP_DIR,name);if(!fs.existsSync(fp))return json(res,404,{error:'Backup नहीं मिला'});let parsed;try{parsed=JSON.parse(fs.readFileSync(fp,'utf8'))}catch{return json(res,400,{error:'Backup file invalid है'})}let validated;try{validated=STORAGE.migrate(parsed)}catch{return json(res,400,{error:'Backup structure invalid है'})}
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
      loginAttempts.delete(ip);cleanupSessions();const activeUser=adminCredential()?.username||ADMIN_USER;const sid=crypto.randomBytes(18).toString('hex');db.admin_sessions.push({sid,user:activeUser,created_at:now(),expires_at:new Date(Date.now()+8*60*60*1000).toISOString(),revoked_at:null});db.audit.unshift({id:newId(),action:'ADMIN_LOGIN',by:activeUser,ip,user_agent:String(req.headers['user-agent']||'').slice(0,300),at:now()});const access_token=sign({kind:'admin',sid,role:'admin',user:activeUser,exp:Date.now()+8*60*60*1000});save();return json(res,200,{access_token,user:{name:db.settings.operator||'Admin',role:'admin'}})
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
    if(p==='/api/services'&&req.method==='GET'){const rows=Object.entries(SERVICE_INFO).map(([category,v])=>({category,services:(v.services||[]).map(x=>publicService(category,x))}));for(const x of (db.custom_services||[]).filter(x=>x.published!==false)){let g=rows.find(z=>z.category===x.category);if(!g){g={category:x.category,services:[]};rows.push(g)}g.services.push(publicCustomService(x))}return json(res,200,{services:rows});}
    if(p==='/api/service-configs'&&req.method==='GET'){const all=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[]))all.push(getServiceConfig(category,sub.name));}return json(res,200,{configs:all});}
    if(p==='/api/admin/service-configs'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const all=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[]))all.push(getServiceConfig(category,sub.name));}for(const x of (db.custom_services||[]).filter(x=>x.published!==false))all.push(getServiceConfig(x.category,x.name));return json(res,200,{configs:all});}
    if(p==='/api/admin/service-configs'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),service=String(x.service||'').trim();if(!serviceExists(category+' — '+service))return json(res,400,{error:'Valid category/sub-service जरूरी है'});const keys=['paymentRequired','manualVerification','tokenRequired','appointmentRequired','documentsRequired','qualityReview','receiptRequired','notifications','applicationTracking','staffAssignment'];let row=(db.service_configs||[]).find(r=>r.key===category+' — '+service);if(!row){row={id:newId(),key:category+' — '+service,category,service,created_at:now()};db.service_configs.unshift(row)}for(const k of keys)if(x[k]!==undefined)row[k]=x[k]===true||x[k]==='true';row.updated_at=now();db.audit.unshift({id:newId(),action:'SERVICE_WORKFLOW_CONFIG_CHANGED',service:row.key,changes:Object.fromEntries(keys.filter(k=>x[k]!==undefined).map(k=>[k,row[k]])),by:a.user||'admin',at:now()});save();return json(res,200,{config:getServiceConfig(category,service)})}
    if(p==='/api/admin/custom-services'&&req.method==='GET'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});return json(res,200,{services:(db.custom_services||[]).map(publicCustomService)});}
    if(p==='/api/admin/custom-services'&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),name=String(x.name||'').trim(),fee=Number(x.fee||0);if(!category||!name||!Object.prototype.hasOwnProperty.call(SERVICE_INFO,category))return json(res,400,{error:'Valid category और service name जरूरी है'});if(SERVICE_INFO[category].services?.some(z=>z.name===name)||(db.custom_services||[]).some(z=>z.category===category&&z.name===name))return json(res,409,{error:'इस category में यह service पहले से मौजूद है'});if(!Number.isFinite(fee)||fee<=0)return json(res,400,{error:'Customer fee ₹0 से अधिक होना चाहिए'});const row={id:newId(),category,name,fee,govt:String(x.govt||'Portal/department अनुसार').trim(),documents:Array.isArray(x.documents)?x.documents.map(String).map(v=>v.trim()).filter(Boolean):[],process:Array.isArray(x.process)?x.process.map(String).map(v=>v.trim()).filter(Boolean):[],description:String(x.description||'').trim(),time:Number(x.time||0),appointment:x.appointment===true,priority:x.priority===true,published:x.published!==false,created_at:now(),updated_at:now(),created_by:a.user||'admin'};db.custom_services.unshift(row);db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_CREATED',service:category+' — '+name,by:a.user||'admin',at:now()});save();return json(res,201,{service:publicCustomService(row)});}
    if(p.startsWith('/api/admin/custom-services/')&&req.method==='POST'){const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),row=(db.custom_services||[]).find(x=>Number(x.id)===id);if(!row)return json(res,404,{error:'Custom service नहीं मिला'});const x=await body(req);if(x.action==='delete'){db.custom_services=db.custom_services.filter(z=>Number(z.id)!==id);db.service_charges=db.service_charges.filter(z=>!(z.category===row.category&&z.service===row.name));db.service_configs=db.service_configs.filter(z=>!(z.category===row.category&&z.service===row.name));db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_DELETED',service:row.category+' — '+row.name,by:a.user||'admin',at:now()});save();return json(res,200,{ok:true});}if(x.action==='publish')row.published=true;else if(x.action==='unpublish')row.published=false;else {const nextName=String(x.name??row.name).trim(),nextFee=Number(x.fee??row.fee);if(!nextName||!Number.isFinite(nextFee)||nextFee<=0)return json(res,400,{error:'Valid name और fee जरूरी है'});if(nextName!==row.name)return json(res,409,{error:'Custom service name immutable है। Consistent pricing/workflow के लिए नया service बनाएं।'});Object.assign(row,{name:nextName,fee:nextFee,govt:String(x.govt??row.govt),documents:Array.isArray(x.documents)?x.documents:row.documents,process:Array.isArray(x.process)?x.process:row.process,description:String(x.description??row.description),time:Number(x.time??row.time),appointment:x.appointment??row.appointment,priority:x.priority??row.priority,published:x.published??row.published,updated_at:now()});}db.audit.unshift({id:newId(),action:'CUSTOM_SERVICE_UPDATED',service:row.category+' — '+row.name,by:a.user||'admin',at:now()});save();return json(res,200,{service:publicCustomService(row)});}
    if(p==='/api/service-charges'&&req.method==='GET'){
      const category=String(u.searchParams.get('category')||'').trim(),service=String(u.searchParams.get('service')||'').trim();
      if(category||service){const row=serviceRow(category,service);if(row)return json(res,200,{charge:row});const total=category&&service?chargeFor(category+' — '+service):null;return json(res,200,{charge:total===null?null:{category,service,govt_fee:Math.max(0,total),csc_fee:0,other_fee:0,total}})}
      const rows=[];for(const [category,v] of Object.entries(SERVICE_INFO)){for(const sub of (v.services||[])){const saved=serviceRow(category,sub.name);const govt=Number(String(sub.govt||'').replace(/,/g,'').match(/₹\s*([0-9]+(?:\.[0-9]+)?)/)?.[1]||0),csc=Number(sub.csc||0);rows.push(saved||{category,service:sub.name,govt_fee:govt,csc_fee:csc,other_fee:0,total:Number((govt+csc).toFixed(2)),default:true})}}for(const x of (db.custom_services||[])){const saved=serviceRow(x.category,x.name);rows.push(saved||{category:x.category,service:x.name,govt_fee:0,csc_fee:Number(x.fee||0),other_fee:0,total:Number(x.fee||0),default:true,custom:true})}return json(res,200,{charges:rows})
    }
    if(p==='/api/service-charges'&&req.method==='POST'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),category=String(x.category||'').trim(),service=String(x.service||'').trim();if(!category||!service||!serviceExists(category+' — '+service))return json(res,400,{error:'Valid category/sub-service जरूरी है'});
      const vals=[Number(x.govt_fee),Number(x.csc_fee),Number(x.other_fee)];if(vals.some(v=>!Number.isFinite(v)||v<0))return json(res,400,{error:'Charges valid non-negative numbers होने चाहिए'});const total=Number((vals[0]+vals[1]+vals[2]).toFixed(2));if(total<=0)return json(res,400,{error:'Service charge total ₹0 नहीं हो सकता। हर service का payable amount ₹0 से अधिक होना चाहिए।'});let row=serviceRow(category,service);if(!row){row={id:newId(),category,service};db.service_charges.unshift(row)}Object.assign(row,{govt_fee:vals[0],csc_fee:vals[1],other_fee:vals[2],total,updated_at:now()});const custom=customServiceRow(category,service);if(custom)custom.fee=total;save();return json(res,200,row)
    }
    if(p==='/api/offers'&&req.method==='GET'){const all=u.searchParams.get('all')==='1';if(all&&!admin(req))return json(res,401,{error:'Unauthorized'});const n=new Date();let rows=(all?db.offers:db.offers.filter(x=>x.published!==false)).filter(x=>all||((!x.starts_at||new Date(x.starts_at)<=n)&&(!x.expires_at||new Date(x.expires_at)>n))).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(b.id||0)-Number(a.id||0));return json(res,200,{offers:rows})}
    if(p==='/api/offers'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),o={id:newId(),title:String(x.title||'').trim(),service:String(x.service||''),subtitle:String(x.subtitle||''),description:String(x.description||''),type:x.type==='OFFER'?'OFFER':'UPDATE',update_category:String(x.update_category||''),published:x.published===true,valid:String(x.valid||''),last_date:String(x.last_date||''),original_price:x.original_price||'',offer_price:x.offer_price||'',discount:x.discount||'',save_amount:x.save_amount||'',image:String(x.image||''),ticker:String(x.ticker||''),priority:Number(x.priority||0),starts_at:String(x.starts_at||''),expires_at:String(x.expires_at||''),created_at:now(),updated_at:now()};if(!o.title)return json(res,400,{error:'Title required'});db.offers.unshift(o);save();return json(res,200,o)}
    if(p.startsWith('/api/offers/')&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),o=db.offers.find(z=>Number(z.id)===id);if(!o)return json(res,404,{error:'Offer नहीं मिला'});const x=await body(req);if(x.action==='delete')db.offers=db.offers.filter(z=>Number(z.id)!==id);else if(x.action==='publish')o.published=true;else if(x.action==='unpublish')o.published=false;else Object.assign(o,{title:String(x.title??o.title).trim(),service:String(x.service??o.service??''),subtitle:String(x.subtitle??o.subtitle),description:String(x.description??o.description),type:x.type==='OFFER'?'OFFER':(x.type??o.type),update_category:String(x.update_category??o.update_category),valid:String(x.valid??o.valid),last_date:String(x.last_date??o.last_date),original_price:x.original_price??o.original_price,offer_price:x.offer_price??o.offer_price,discount:x.discount??o.discount,save_amount:x.save_amount??o.save_amount,image:String(x.image??o.image),ticker:String(x.ticker??o.ticker),priority:Number(x.priority??o.priority),starts_at:String(x.starts_at??o.starts_at),expires_at:String(x.expires_at??o.expires_at),published:x.published??o.published,updated_at:now()});save();return json(res,200,x.action==='delete'?{ok:true}:o)}

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
    if(p==='/api/customer/applications'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});return json(res,200,{applications:db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at,address,note,customer_id})=>({id,application_id,service,category,status,created_at,address,note,customer_id}))})}
    if(p==='/api/customer/application'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const id=Number(u.searchParams.get('id')||0),a=db.applications.find(x=>Number(x.id)===id&&x.mobile===c.mobile);if(!a)return json(res,404,{error:'Application नहीं मिला'});return json(res,200,{application:{id:a.id,application_id:a.application_id,service:a.service,category:a.category,status:a.status,created_at:a.created_at,address:a.address,note:a.note,customer_id:a.customer_id},documents:db.documents.filter(x=>Number(x.application_id)===a.id).map(x=>({id:x.id,document_id:x.document_id,name:x.name,mime_type:x.mime_type,size:x.size,status:x.status,sha256:x.sha256,ocr_status:x.ocr_status||'not_run',ocr_text:x.ocr_text||'',ocr_fields:x.ocr_fields||extractOcrFields(x.ocr_text||''),created_at:x.created_at}))})}
    if(p==='/api/customer/payment'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),utr=String(x.utr||'').trim(),amount=Number(x.amount),sp=serviceParts(service),cfg=getServiceConfig(sp.category,sp.service);if(!cfg.paymentRequired)return json(res,409,{error:'इस service के लिए payment workflow लागू नहीं है।'});if(c.mobile!==mobile||c.name!==name)return json(res,403,{error:'Customer session और payment details match नहीं करते'});if(!validMobile(mobile)||!serviceExists(service)||!Number.isFinite(amount)||amount<=0||!utr||!x.screenshot)return json(res,400,{error:'Valid name, mobile, service, amount, UTR और payment screenshot दोनों जरूरी हैं'});
      const expected=chargeFor(service);if(Math.abs(amount-expected)>0.009)return json(res,400,{error:'Payable amount गलत है। निर्धारित amount ₹'+expected.toFixed(2)+' है।'});if(db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      let app=applicationFor(x.application_id);if(app&& (app.mobile!==mobile||app.service!==service))return json(res,400,{error:'Selected application और customer/service match नहीं करते'});if(!app){app=db.applications.filter(z=>z.mobile===mobile&&z.service===service&&z.status!=='Token Generated').sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;}if(!app)return json(res,400,{error:'इस service के लिए valid application नहीं मिला। पहले application create करें।'});if(!c.sid&&Number(c.application_id)!==Number(app.id))return json(res,403,{error:'Guest application token और application match नहीं करते'});let proof=null;if(x.screenshot){try{proof=safeImage(x.screenshot)}catch(e){return json(res,400,{error:e.message})}}
      if(utr&&db.payments.some(existing=>String(existing.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है।'});
      if(proof){const duplicateProof=db.payments.some(existing=>{if(!existing.screenshot)return false;let h=String(existing.proof_sha256||'').toLowerCase();if(!h){const fp=path.join(UPLOAD_DIR,path.basename(existing.screenshot));try{if(fs.existsSync(fp))h=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}catch{h=''}}return h===proof.sha256});if(duplicateProof){try{fs.unlinkSync(path.join(UPLOAD_DIR,proof.filename))}catch{}return json(res,409,{error:'यह payment screenshot पहले से किसी payment में दर्ज है। नया payment proof इस्तेमाल करें।'})}}
      const id=newId(),pay={id,txn_id:'PAY-'+String(id).slice(-8),name,mobile,service,amount,method:'UPI',utr,screenshot:proof?.url||null,status:'Pending Verification',created_at:now(),receipt_no:null,application_id:app.id,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null,verified_by:null,verified_at:null,reject_reason:null};db.payments.push(pay);app.status='Payment Verification Pending';db.audit.unshift({id:newId(),action:'PAYMENT_SUBMITTED',payment_id:id,by:mobile,at:now()});save();return json(res,200,{id,status:pay.status,message:'Payment verification pending'})
    }
    if(p==='/api/customer/payment/status'&&req.method==='GET'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const id=Number(u.searchParams.get('id')),pay=db.payments.find(z=>z.id===id);if(!pay||pay.mobile!==c.mobile||(!c.sid&&Number(c.application_id)!==Number(pay.application_id)))return json(res,404,{error:'Payment request नहीं मिला'});return json(res,200,{payment:customerPayment(pay)})
    }
    if(p==='/api/customer/live-queue'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const rows=db.tokens.filter(x=>x.date===today()).sort((a,b)=>Number(a.id||0)-Number(b.id||0)).map(x=>({id:x.id,token:x.token,service:x.service,status:x.status,created_at:x.created_at,date:x.date}));
      return json(res,200,{tokens:rows,current:rows.find(x=>['बुलाया','प्रगति'].includes(x.status))||null,total:rows.length})
    }
    if(p==='/api/customer/tokens'&&req.method==='GET'){
      const c=customerSession(req); if(!c)return json(res,401,{error:'Customer login required'});
      const current=db.tokens.find(x=>['बुलाया','प्रगति'].includes(x.status));
      const rows=db.tokens.filter(x=>x.mobile===c.mobile&&(!c.application_id||Number(x.application_id)===Number(c.application_id))).map(publicToken);
      return json(res,200,{tokens:rows,current:current?publicToken(current):null,total:rows.length});
    }
    if(p==='/api/customer/tokens'&&req.method==='POST'){
      const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});
      const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim(),parts=serviceParts(service),cfg=getServiceConfig(parts.category,parts.service);
      if(!cfg.tokenRequired)return json(res,409,{error:'इस service के लिए Token लागू नहीं है।'});
      if(!name||!validMobile(mobile)||c.mobile!==mobile||c.name!==name)return json(res,403,{error:'Customer session और token details match नहीं करते।'});
      let pay=null,app=null;
      if(cfg.paymentRequired){
        pay=db.payments.find(z=>z.id===Number(x.payment_id));
        if(!pay||pay.mobile!==c.mobile||(!c.sid&&Number(c.application_id)!==Number(pay.application_id))||pay.status!=='Verified')return json(res,403,{error:'Payment अभी Admin द्वारा verify नहीं हुआ है।'});
        if(name!==pay.name||mobile!==pay.mobile||service!==pay.service)return json(res,403,{error:'Verified payment और customer/service match नहीं करते।'});
        const expected=chargeFor(service);if(Math.abs(Number(pay.amount)-expected)>0.009)return json(res,403,{error:'Verified payment amount service charge से match नहीं करता।'});
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
      if(cfg.documentsRequired){if(!app)return json(res,409,{error:'इस service के लिए required documents वाले application की जरूरत है।'});const gate=documentGate(app,sopFor(app.service).documents||[]);if(!gate.ok)return json(res,409,{error:'Token generate करने से पहले सभी required documents verify होना जरूरी है।',missing_documents:gate.missing});}
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
    if(p==='/api/customer/notifications'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||50)));const rows=(db.notifications||[]).filter(n=>n.mobile===c.mobile).slice(0,limit).map(n=>({id:n.id,type:n.type,severity:n.severity,title:n.title,message:n.message,read:!!n.read_at,created_at:n.created_at,token_id:n.token_id||null,application_id:n.application_id||null,payment_id:n.payment_id||null,receipt_no:n.receipt_no||null,document_id:n.document_id||null}));return json(res,200,{notifications:rows,unread:rows.filter(n=>!n.read).length});}
    if(p==='/api/customer/notifications/read'&&req.method==='POST'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const x=await body(req);const rows=(db.notifications||[]).filter(n=>n.mobile===c.mobile&&(!x.id||Number(n.id)===Number(x.id)));rows.forEach(n=>n.read_at=now());save();return json(res,200,{ok:true,count:rows.length});}
    if(p==='/api/customer/records'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const tokens=db.tokens.filter(x=>x.mobile===c.mobile).map(publicToken);
      const payments=db.payments.filter(x=>x.mobile===c.mobile).map(customerPayment);
      const applications=db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at})=>({id,application_id,service,category,status,created_at}));
      const appointments=db.appointments.filter(x=>x.mobile===c.mobile).map(({id,appointment_id,service,date,time,status,created_at})=>({id,appointment_id,service,date,time,status,created_at}));
      return json(res,200,{tokens,current:(()=>{const x=db.tokens.find(z=>['बुलाया','प्रगति'].includes(z.status));return x?publicToken(x):null})(),payments,receipts:payments.filter(x=>x.status==='Verified'&&x.receipt_no&&db.tokens.some(t=>Number(t.payment_id)===Number(x.id)&&t.status==='पूर्ण')),applications,appointments})
    }
    if(p==='/api/customer/dashboard'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const tokens=db.tokens.filter(x=>x.mobile===c.mobile).map(publicToken);
      const payments=db.payments.filter(x=>x.mobile===c.mobile).map(customerPayment);
      const applications=db.applications.filter(x=>x.mobile===c.mobile).map(({id,application_id,service,category,status,created_at})=>({id,application_id,service,category,status,created_at}));
      const appointments=db.appointments.filter(x=>x.mobile===c.mobile).map(({id,appointment_id,service,date,time,status,created_at})=>({id,appointment_id,service,date,time,status,created_at}));
      const currentRaw=db.tokens.find(x=>['बुलाया','प्रगति'].includes(x.status));
      const current=currentRaw?publicToken(currentRaw):null;
      const active=tokens.filter(x=>!['पूर्ण','रद्द','स्किप'].includes(x.status));
      const latest=tokens.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]||null;
      return json(res,200,{customer:customerPublic(db.customers.find(x=>x.customer_id===c.customer_id)||c),tokens,current,latest,payments,receipts:payments.filter(x=>x.status==='Verified'&&x.receipt_no&&db.tokens.some(t=>Number(t.payment_id)===Number(x.id)&&t.status==='पूर्ण')),applications,appointments,summary:{total_tokens:tokens.length,active_tokens:active.length,completed_tokens:tokens.filter(x=>x.status==='पूर्ण').length,verified_payments:payments.filter(x=>x.status==='Verified').length,pending_payments:payments.filter(x=>x.status==='Pending Verification').length,total_paid:payments.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0)}})
    }
    if(p==='/api/customer/progress'&&req.method==='GET'){const c=customerAccess(req);if(!c)return json(res,401,{error:'Customer login or guest application required'});const id=Number(u.searchParams.get('application_id')||c.application_id||0);if(id&&!db.applications.some(a=>Number(a.id)===id&&a.mobile===c.mobile))return json(res,404,{error:'Application नहीं मिला'});return json(res,200,{progress:customerProgressFor(c.mobile,id)});}
    if(p==='/api/customer/appointments'&&req.method==='GET'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      return json(res,200,{appointments:db.appointments.filter(x=>x.mobile===c.mobile)})
    }
    if(p==='/api/customer/appointments'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),service=String(x.service||'सामान्य सेवा').trim().slice(0,200),date=String(x.date||'').trim().slice(0,30),time=String(x.time||'').trim().slice(0,30);
      if(!service||!date)return json(res,400,{error:'Service और date जरूरी हैं'});
      if(!serviceExists(service))return json(res,400,{error:'Valid service चुनें'});
      const apptDate=new Date(date+'T'+(time||'00:00'));if(Number.isNaN(apptDate.getTime())||apptDate<new Date(Date.now()-60000))return json(res,400,{error:'Past appointment date/time allowed नहीं है'});
      const a={id:newId(),appointment_id:'APT-'+String(newId()).slice(-10),customer_id:c.customer_id,name:c.name,mobile:c.mobile,service,date,time,status:'अनुरोध',created_at:now()};
      db.appointments.unshift(a);db.audit.unshift({id:newId(),action:'CUSTOMER_APPOINTMENT_REQUESTED',customer_id:c.customer_id,appointment_id:a.appointment_id,by:c.mobile,at:now()});save();return json(res,201,a)
    }
    if(p==='/api/tokens'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const tokens=db.tokens.map(publicToken);const live=tokens.find(z=>['बुलाया','प्रगति'].includes(z.status))||null;const held=tokens.find(z=>z.status==='होल्ड')||null;const serviceQueues={};for(const t of tokens){const k=t.service||'Unknown';serviceQueues[k]??={service:k,current:null,waiting:0,completed:0,tokens:[]};serviceQueues[k].tokens.push(t);if(['लंबित','होल्ड','बुलाया','प्रगति'].includes(t.status))serviceQueues[k].waiting++;if(t.status==='पूर्ण')serviceQueues[k].completed++;if(['बुलाया','प्रगति'].includes(t.status))serviceQueues[k].current=t.token;}Object.values(serviceQueues).forEach(q=>q.tokens.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.id)-Number(b.id)));return json(res,200,{tokens,current:live,control_current:live||held,service_queues:Object.values(serviceQueues).map(q=>({service:q.service,current:q.current,waiting:q.waiting,completed:q.completed,tokens:q.tokens}))})}
    if(p==='/api/tokens'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req);
      if(x.action==='issue'){const pay=db.payments.find(z=>z.id===Number(x.payment_id));if(!pay||pay.status!=='Verified')return json(res,403,{error:'Token के लिए Verified payment जरूरी है।'});const name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),service=String(x.service||'').trim();if(!name||!validMobile(mobile)||!service||pay.name!==name||pay.mobile!==mobile||pay.service!==service)return json(res,403,{error:'Verified payment/customer/service match नहीं करते'});if(Math.abs(Number(pay.amount)-chargeFor(service))>0.009)return json(res,403,{error:'Verified payment amount service charge से match नहीं करता'});if(db.tokens.some(t=>Number(t.payment_id)===pay.id))return json(res,409,{error:'इस payment का token पहले ही generate हो चुका है'});const paymentParts=serviceParts(service),paymentCfg=getServiceConfig(paymentParts.category,paymentParts.service),linkedApp=applicationFor(pay.application_id);if(paymentCfg.documentsRequired){if(!linkedApp)return json(res,409,{error:'इस service के लिए required documents वाले application की जरूरत है।'});const gate=documentGate(linkedApp,sopFor(linkedApp.service).documents||[]);if(!gate.ok)return json(res,409,{error:'Token generate करने से पहले सभी required documents verify होना जरूरी है।',missing_documents:gate.missing});}const t={id:newId(),token:tokenNo(service),name,mobile,service,status:'लंबित',created_at:now(),date:today(),application_id:pay.application_id||null,payment_id:pay.id};db.tokens.push(t);pay.token_id=t.id;const app=applicationFor(t.application_id);if(app)app.status='Token Generated';notifyCustomer(t.mobile,'token','info','Token Generated',`आपका token ${t.token} generate हो गया है।`,{token_id:t.id,application_id:t.application_id});db.audit.unshift({id:newId(),action:'TOKEN_GENERATED',payment_id:pay.id,token_id:t.id,by:a.user||'admin',at:now()});save();return json(res,200,t)}
      let t=x.id?db.tokens.find(z=>Number(z.id)===Number(x.id)):null;if(x.id&&!t)return json(res,404,{error:'Token नहीं मिला'});
      if(x.action==='next'){
        const active=activeQueueToken();if(active)return json(res,409,{error:'एक token पहले से बुलाया/प्रगति में है। पहले उसे complete, hold या skip करें।',active_token_id:active.id});
        const selected=t||db.tokens.filter(z=>z.status==='लंबित').sort((a,b)=>Number(a.id)-Number(b.id))[0];
        if(!selected)return json(res,404,{error:'कोई pending token उपलब्ध नहीं है'});
        if(selected.status!=='लंबित')return json(res,400,{error:'Next के लिए selected token Pending होना चाहिए'});
        t=selected;
        t.status='बुलाया';t.last_action_at=now();
      }else if(x.action==='recall'){
        if(!tokenTransitionAllowed(t.status,'बुलाया'))return json(res,400,{error:'इस token state से recall allowed नहीं है'});
        const active=activeQueueToken();if(active&&active.id!==t.id)return json(res,409,{error:'दूसरा token पहले से active है',active_token_id:active.id});
        t.status='बुलाया';t.recall_count=Number(t.recall_count||0)+1;t.last_action_at=now();
      }else if(x.action==='processing'){
        if(!tokenTransitionAllowed(t.status,'प्रगति'))return json(res,400,{error:'इस token state से काम शुरू नहीं किया जा सकता'});
        t.status='प्रगति';t.started_at=t.started_at||now();t.last_action_at=now();const processingApp=applicationFor(t.application_id);if(processingApp)processingApp.status='Processing';notifyCustomer(t.mobile,'processing','info','Service Processing','आपकी service का processing शुरू हो गया है।',{token_id:t.id,application_id:t.application_id});
      }else if(x.action==='hold'){
        if(!tokenTransitionAllowed(t.status,'होल्ड'))return json(res,400,{error:'इस token state से Hold allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200),owner=String(x.owner||'').trim().slice(0,80),mins=Number(x.delay_minutes);
        if(!reason)return json(res,400,{error:'Hold/Pending reason जरूरी है'});
        if(!['customer','operator','portal','department','other'].includes(owner))return json(res,400,{error:'Valid delay owner चुनें'});
        if(!Number.isInteger(mins)||mins<1||mins>1440)return json(res,400,{error:'Expected delay 1 से 1440 मिनट के बीच होना चाहिए'});
        t.hold_resume_status=t.status;t.status='होल्ड';t.hold_reason=reason;t.hold_owner=owner;t.hold_delay_minutes=mins;t.hold_started_at=now();t.hold_extensions=Number(t.hold_extensions||0);t.last_action_at=now();
      }else if(x.action==='resume'){
        if(!tokenTransitionAllowed(t.status,'प्रगति')&&!tokenTransitionAllowed(t.status,'बुलाया'))return json(res,400,{error:'इस token state से Resume allowed नहीं है'});
        const resumedAt=now(),started=t.hold_started_at?new Date(t.hold_started_at).getTime():Date.now(),duration=Math.max(0,Date.now()-started);
        t.hold_history=Array.isArray(t.hold_history)?t.hold_history:[];t.hold_history.push({started_at:t.hold_started_at||resumedAt,resumed_at:resumedAt,duration_ms:duration,reason:t.hold_reason||'',owner:t.hold_owner||'',planned_minutes:Number(t.hold_delay_minutes||0)});
        t.total_hold_ms=Number(t.total_hold_ms||0)+duration;t.status=t.hold_resume_status||'प्रगति';t.hold_started_at=null;t.hold_deadline=null;t.hold_resume_status=null;t.last_action_at=resumedAt;
      }else if(x.action==='extend_hold'){
        if(t.status!=='होल्ड')return json(res,400,{error:'सिर्फ Hold token का delay extend किया जा सकता है'});
        const mins=Number(x.delay_minutes),reason=String(x.reason||'').trim().slice(0,200);
        if(!Number.isInteger(mins)||mins<1||mins>1440)return json(res,400,{error:'Extension 1 से 1440 मिनट के बीच होना चाहिए'});
        if(!reason)return json(res,400,{error:'Extension reason जरूरी है'});
        t.hold_delay_minutes=Number(t.hold_delay_minutes||0)+mins;t.hold_extensions=Number(t.hold_extensions||0)+1;t.hold_extension_reason=reason;t.last_action_at=now();
      }else if(x.action==='skip'){
        if(!tokenTransitionAllowed(t.status,'स्किप'))return json(res,400,{error:'इस token state से skip allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200);if(!reason)return json(res,400,{error:'Skip reason जरूरी है'});
        t.status='स्किप';t.skip_reason=reason;t.last_action_at=now();
      }else if(x.action==='assign'||x.action==='transfer'){
        const staffId=String(x.staff_id||'');const st=db.staff.find(z=>z.staff_id===staffId&&z.status==='active');
        if(!st)return json(res,400,{error:'Active staff नहीं मिला'});
        if(x.action==='transfer'&&!t.staff_id)return json(res,400,{error:'Transfer के लिए पहले staff assignment जरूरी है'});
        t.staff_id=st.staff_id;t.assigned_at=t.assigned_at||now();t.last_action_at=now();
        db.audit.unshift({id:newId(),action:'TOKEN_'+x.action.toUpperCase(),token_id:t.id,from_staff_id:x.action==='transfer'?(x.from_staff_id||null):null,staff_id:st.staff_id,reason:String(x.reason||'').trim().slice(0,200),by:a.user||'admin',at:now()});
      }else if(x.action==='priority'){
        const enabled=Boolean(x.enabled);const reason=String(x.reason||'').trim().slice(0,200);
        if(enabled&&!reason)return json(res,400,{error:'Priority reason जरूरी है'});
        t.priority=enabled?1:0;t.priority_reason=enabled?reason:null;t.priority_set_by=a.user||'admin';t.priority_set_at=now();t.last_action_at=now();
        db.audit.unshift({id:newId(),action:enabled?'TOKEN_PRIORITY_SET':'TOKEN_PRIORITY_REMOVED',token_id:t.id,reason,by:a.user||'admin',at:now()});
      }else if(x.action==='notify'){
        const title=String(x.title||'Token Update').trim().slice(0,120),message=String(x.message||'').trim().slice(0,300);
        if(!message)return json(res,400,{error:'Notification message जरूरी है'});
        db.notifications=db.notifications||[];db.notifications.unshift({id:newId(),type:'token',severity:'info',title,message,mobile:t.mobile,token_id:t.id,read:false,created_at:now()});
        db.audit.unshift({id:newId(),action:'TOKEN_NOTIFICATION_CREATED',token_id:t.id,by:a.user||'admin',at:now()});
      }else if(x.action==='cancel'){
        if(!tokenTransitionAllowed(t.status,'रद्द'))return json(res,400,{error:'इस token state से cancel allowed नहीं है'});
        const reason=String(x.reason||'').trim().slice(0,200);if(!reason)return json(res,400,{error:'Cancel reason जरूरी है'});
        t.status='रद्द';t.cancel_reason=reason;t.cancelled_at=now();t.last_action_at=t.cancelled_at;
      }else if(x.action==='complete'){
        if(!tokenCanComplete(t))return json(res,400,{error:'Complete के लिए token In Progress और Final Quality Review Passed होना जरूरी है'});
        t.status='पूर्ण';t.completed_at=now();t.last_action_at=t.completed_at;const completedApp=applicationFor(t.application_id);if(completedApp)completedApp.status='Completed';generateReceiptForCompletion(t,a.user||'admin');notifyCustomer(t.mobile,'completion','success','Service Completed',`Token ${t.token} की service completed हो गई है।`,{token_id:t.id,application_id:t.application_id});
      }else return json(res,400,{error:'Unknown token action'});
      db.audit.unshift({id:newId(),action:'ADMIN_TOKEN_'+String(x.action).toUpperCase(),token_id:t.id,from_status:x.action==='next'?'लंबित':undefined,status:t.status,by:a.user||'admin',at:now()});save();return json(res,200,t)
    }
    if(p==='/api/payments'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const total=db.payments.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0);return json(res,200,{payments:db.payments.map(customerPayment),total_paid:total,pending_count:db.payments.filter(x=>x.status==='Pending Verification').length})}
    if(p==='/api/payments'&&req.method==='POST'){
      if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req),name=String(x.name||'').trim(),mobile=String(x.mobile||'').trim(),method=String(x.method||'').trim(),service=String(x.service||'').trim(),amount=Number(x.amount),utr=String(x.utr||'').trim(),sp=serviceParts(service),cfg=getServiceConfig(sp.category,sp.service);if(!serviceExists(service))return json(res,400,{error:'Valid service जरूरी है'});if(!cfg.paymentRequired)return json(res,409,{error:'इस service के लिए payment workflow लागू नहीं है।'});if(!name||!validMobile(mobile)||!service||!Number.isFinite(amount)||amount<=0||!['Cash','UPI','Bank Transfer'].includes(method))return json(res,400,{error:'Valid name, mobile, amount और payment mode जरूरी हैं'});if(x.payment_date&&!validIsoDate(x.payment_date))return json(res,400,{error:'Payment date invalid है या future date है'});const expectedAmount=chargeFor(service);if(!Number.isFinite(expectedAmount)||expectedAmount<=0)return json(res,400,{error:'Service payable amount configured नहीं है'});if(Math.abs(amount-expectedAmount)>0.009)return json(res,400,{error:`Payment amount service charge से match नहीं करता। Expected ₹${expectedAmount.toFixed(2)}`});if(method!=='Cash'&&(!utr||!x.proof_data))return json(res,400,{error:'UPI/Bank payment के लिए UTR और payment screenshot/proof दोनों जरूरी हैं'});if(utr&&db.payments.some(p=>String(p.utr||'').toLowerCase()===utr.toLowerCase()))return json(res,409,{error:'यह UTR पहले से दर्ज है'});const app=x.application_id?applicationFor(x.application_id):null;if(x.application_id&&!app)return json(res,400,{error:'Application ID नहीं मिला'});let proof=null;if(method!=='Cash'&&x.proof_data){try{proof=safeImage(x.proof_data)}catch(e){return json(res,400,{error:e.message})}}const id=newId(),verified=method==='Cash',t=now(),pay={id,txn_id:'PAY-'+String(id).slice(-8),name,mobile,amount,method,utr:method==='Cash'?'':utr,status:verified?'Verified':'Pending Verification',created_at:x.payment_date||t,receipt_no:null,service,application_id:app?.id||null,verified_by:verified?(db.settings.operator||'Admin'):null,verified_at:verified?t:null,reject_reason:null,screenshot:proof?.url||null,proof_sha256:proof?.sha256||null,screenshot_sha256:proof?.sha256||null};db.payments.push(pay);if(app)app.status=verified?'Payment Verified':'Payment Verification Pending';db.audit.unshift({id:newId(),action:'MANUAL_PAYMENT_CREATED',payment_id:id,by:db.settings.operator||'Admin',at:t});save();return json(res,200,customerPayment(pay))
    }
    if(p==='/api/payments/status'&&req.method==='POST'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const x=await body(req),pay=db.payments.find(z=>z.id===Number(x.id));if(!pay)return json(res,404,{error:'Payment नहीं मिला'});if(!['Pending Verification','Verified','Rejected'].includes(pay.status))return json(res,409,{error:'Payment status invalid है'});if(pay.status==='Verified'&&x.status!=='Verified')return json(res,409,{error:'Verified payment को वापस बदलना allowed नहीं है'});if(pay.status==='Rejected'&&x.status!=='Rejected')return json(res,409,{error:'Rejected payment को फिर से बदलना allowed नहीं है'});if(pay.status==='Rejected'&&x.status==='Rejected')return json(res,409,{error:'Payment पहले से Rejected है'});
      const at=now(),app=applicationFor(pay.application_id);if(x.status==='Verified'&&pay.status==='Verified')return json(res,409,{error:'Payment पहले से Verified है'});if(x.status==='Verified'&&pay.screenshot&&!pay.proof_viewed_at)return json(res,409,{error:'पहले payment screenshot/proof देखें, फिर Verify करें'});if(x.status==='Verified'){pay.status='Verified';pay.verified_by=a.user||db.settings.operator||'Admin';pay.verified_at=at;pay.reject_reason=null;if(app)app.status='Payment Verified';notifyCustomer(pay.mobile,'payment','success','Payment Verified','आपका payment verify हो गया है।',{payment_id:pay.id,application_id:pay.application_id});db.audit.unshift({id:newId(),action:'PAYMENT_VERIFIED',payment_id:pay.id,by:pay.verified_by,at})}else if(x.status==='Rejected'){pay.status='Rejected';pay.reject_reason=String(x.reason||'Payment proof rejected').slice(0,500);pay.verified_by=a.user||db.settings.operator||'Admin';pay.verified_at=at;if(app)app.status='Payment Rejected';notifyCustomer(pay.mobile,'payment','error','Payment Rejected',`आपका payment verification reject हुआ है। कारण: ${pay.reject_reason}`,{payment_id:pay.id,application_id:pay.application_id});db.audit.unshift({id:newId(),action:'PAYMENT_REJECTED',payment_id:pay.id,reason:pay.reject_reason,by:pay.verified_by,at})}else return json(res,400,{error:'Status must be Verified or Rejected'});save();return json(res,200,customerPayment(pay))
    }
    if(p.startsWith('/api/payments/proof/')&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const id=Number(p.split('/').pop()),pay=db.payments.find(x=>Number(x.id)===id);if(!pay?.screenshot)return json(res,404,{error:'Proof not found'});const file=path.basename(pay.screenshot);if(!PAYMENT_PROOF_FILE_RE.test(file))return json(res,404,{error:'Proof not found'});const fp=path.join(UPLOAD_DIR,file);if(!fs.existsSync(fp))return json(res,404,{error:'Proof not found'});pay.proof_viewed_at=now();pay.proof_viewed_by=a.user||db.settings.operator||'Admin';db.audit.unshift({id:newId(),action:'PAYMENT_PROOF_VIEWED',payment_id:id,by:pay.proof_viewed_by,at:pay.proof_viewed_at});save();const ext=path.extname(fp).toLowerCase(),ct=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg',b=fs.readFileSync(fp);res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});return res.end(b)
    }
    if(p==='/api/customers'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const q=(u.searchParams.get('q')||'').toLowerCase(),map={};for(const c of (db.customers||[])){if(!c.mobile)continue;map[c.mobile]={id:c.customer_id||c.id||c.mobile,name:c.name||c.mobile,mobile:c.mobile,services:0,last_service:'—',active:c.status!=='blocked'}}for(const x of db.payments.concat(db.tokens)){if(!x.mobile)continue;map[x.mobile]??={id:x.mobile,name:x.name||x.mobile,mobile:x.mobile,services:0,last_service:'—',active:true};if(x.service)map[x.mobile].last_service=x.service}for(const r of Object.values(map)){r.services=new Set(db.payments.concat(db.tokens).filter(x=>x.mobile===r.mobile&&x.service).map(x=>x.service)).size}return json(res,200,{customers:Object.values(map).filter(x=>!q||String(x.name).toLowerCase().includes(q)||x.mobile.includes(q))})}
    if(p==='/api/applications'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{applications:db.applications})}
    if(p==='/api/customer/documents'&&req.method==='POST'){
      const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});
      const x=await body(req),applicationId=Number(x.application_id),files=Array.isArray(x.files)?x.files:[];
      const app=db.applications.find(z=>Number(z.id)===applicationId&&z.mobile===c.mobile);if(!app)return json(res,404,{error:'Application नहीं मिला'});
      if(!files.length||files.length>5)return json(res,400,{error:'1 से 5 documents तक upload करें'});
      const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp']);let total=0,prepared=[];
      for(const item of files){const mime=String(item?.mime_type||'').toLowerCase(),original=path.basename(String(item?.name||'')).slice(0,160),raw=String(item?.data||'').replace(/^data:[^;]+;base64,/,'').replace(/\s/g,'');if(!original||!allowed.has(mime)||!raw)return json(res,400,{error:'Unsupported document type or empty file'});let buf;try{buf=Buffer.from(raw,'base64')}catch{return json(res,400,{error:'Invalid document data'})}if(!buf.length||buf.length>5*1024*1024)return json(res,400,{error:'प्रत्येक document अधिकतम 5 MB हो सकता है'});if(!validateFileSignature(buf,mime))return json(res,400,{error:'File content does not match declared document type'});total+=buf.length;if(total>10*1024*1024)return json(res,400,{error:'एक application के documents कुल 10 MB तक हो सकते हैं'});const ext=mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';prepared.push({mime,original,buf,ext})}
      const created=[],written=[];
      try{for(const item of prepared){const documentId='DOC-'+crypto.randomUUID(),filename=crypto.randomUUID()+item.ext,fp=path.join(DOCUMENT_UPLOAD_DIR,filename);fs.writeFileSync(fp,item.buf,{flag:'wx'});written.push(fp);const sha256=crypto.createHash('sha256').update(item.buf).digest('hex');let ocr_status='not_supported',ocr_text='';if(item.mime.startsWith('image/')){try{await runOcrLimited(async()=>{const tmp=fp+'.ocr';childProcess.execFileSync('tesseract',[fp,tmp,'-l','eng+Devanagari','--psm','6'],{timeout:30000,stdio:'ignore'});ocr_text=fs.readFileSync(tmp+'.txt','utf8').slice(0,20000);try{fs.unlinkSync(tmp+'.txt')}catch{}ocr_status='completed'})}catch(e){ocr_status='failed'}}const row={id:newId(),document_id:documentId,application_id:app.id,customer_id:c.customer_id,name:item.original,original_name:item.original,mime_type:item.mime,size:item.buf.length,sha256,path:filename,status:'uploaded',ocr_status,ocr_text,ocr_fields:extractOcrFields(ocr_text),created_at:now(),created_by:c.customer_id};db.documents.unshift(row);created.push({...row,path:undefined})}}
      catch(e){for(const fp of written){try{fs.unlinkSync(fp)}catch{}}return json(res,500,{error:'Document storage/OCR failed; no document records were committed'})}
      db.audit.unshift({id:newId(),action:'CUSTOMER_DOCUMENTS_UPLOADED',application_id:app.id,customer_id:c.customer_id,count:created.length,by:c.mobile,at:now()});save();return json(res,201,{documents:created.map(x=>({...x,path:undefined}))});
    }
    if(p==='/api/customer/documents'&&req.method==='GET'){const c=customerSession(req);if(!c)return json(res,401,{error:'Customer login required'});const applicationId=Number(u.searchParams.get('application_id')||0);const apps=db.applications.filter(a=>a.mobile===c.mobile).map(a=>a.id);const rows=db.documents.filter(x=>apps.includes(Number(x.application_id))&&(!applicationId||Number(x.application_id)===applicationId)).map(x=>({id:x.id,document_id:x.document_id,application_id:x.application_id,name:x.name,mime_type:x.mime_type,size:x.size,status:x.status,sha256:x.sha256,ocr_status:x.ocr_status||'not_run',ocr_text:x.ocr_text||'',created_at:x.created_at}));return json(res,200,{documents:rows})}
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
        prepared.push({mime,original,buf,ext});
      }
      const created=[],written=[];
      try{
        for(const item of prepared){
          const documentId='DOC-'+crypto.randomUUID();const filename=crypto.randomUUID()+item.ext;const fp=path.join(DOCUMENT_UPLOAD_DIR,filename);
          fs.writeFileSync(fp,item.buf,{flag:'wx'});written.push(fp);
          const sha256=crypto.createHash('sha256').update(item.buf).digest('hex');
          const row={id:newId(),document_id:documentId,application_id:app.id,customer_id:app.customer_id||null,name:item.original,original_name:item.original,mime_type:item.mime,size:item.buf.length,sha256,path:filename,status:'uploaded',created_at:now(),created_by:a.user||'admin'};
          db.documents.unshift(row);created.push({...row,path:undefined});
        }
      }catch(e){for(const fp of written){try{fs.unlinkSync(fp)}catch{}};return json(res,500,{error:'Document storage failed; no document records were committed'});}
      db.audit.unshift({id:newId(),action:'APPLICATION_DOCUMENTS_UPLOADED',application_id:app.id,count:created.length,by:a.user||'admin',at:now()});
      save();return json(res,201,{documents:created.map(x=>({...x,path:undefined}))});
    }
    if(p==='/api/documents'&&req.method==='GET'){
      const a=admin(req);if(!a)return json(res,401,{error:'Unauthorized'});const applicationId=Number(u.searchParams.get('application_id'));
      const rows=db.documents.filter(x=>!applicationId||Number(x.application_id)===applicationId).map(x=>({id:x.id,document_id:x.document_id,application_id:x.application_id,name:x.name,mime_type:x.mime_type,size:x.size,sha256:x.sha256,status:x.status,created_at:x.created_at,created_by:x.created_by}));
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
    if(p==='/api/notifications'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{notifications:db.notifications})}
    if(p==='/api/notifications/read'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req);if(!x.id)db.notifications.forEach(n=>n.read_at=now());else{const n=db.notifications.find(z=>Number(z.id)===Number(x.id));if(n)n.read_at=now()}save();return json(res,200,{ok:true})}
    if(p==='/api/public-config'&&req.method==='GET'){
      const s=db.settings||{};
      return json(res,200,{centre:String(s.centre||'Angelstore CSC'),operator:String(s.operator||''),upi_id:String(s.upi_id||''),payee_name:String(s.payee_name||''),payment_qr_path:String(s.payment_qr_path||'assets/payment-qr.jpg')});
    }
    if(p==='/api/settings'&&req.method==='GET'){if(!admin(req))return json(res,401,{error:'Unauthorized'});return json(res,200,{settings:db.settings})}
    if(p==='/api/settings'&&req.method==='POST'){if(!admin(req))return json(res,401,{error:'Unauthorized'});const x=await body(req);if(!x||typeof x!=='object'||Array.isArray(x))return json(res,400,{error:'Invalid settings'});db.settings={...db.settings,centre:String(x.centre??db.settings.centre),operator:String(x.operator??db.settings.operator),notify:String(x.notify??db.settings.notify),counters:String(x.counters??db.settings.counters),fee:String(x.fee??db.settings.fee),footer:String(x.footer??db.settings.footer),upi_id:String(x.upi_id??db.settings.upi_id??''),payee_name:String(x.payee_name??db.settings.payee_name??''),payment_qr_path:String(x.payment_qr_path??db.settings.payment_qr_path??'assets/payment-qr.jpg'),default_home_fee:money(x.default_home_fee??db.settings.default_home_fee??50),default_delivery_fee:money(x.default_delivery_fee??db.settings.default_delivery_fee??40),default_home_staff_allowance:money(x.default_home_staff_allowance??db.settings.default_home_staff_allowance??20),default_delivery_staff_allowance:money(x.default_delivery_staff_allowance??db.settings.default_delivery_staff_allowance??15)};save();return json(res,200,{settings:db.settings})}
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
    if(p==='/api/report.csv'&&req.method==='GET'){if(!admin(req)){res.writeHead(401);return res.end('Unauthorized')}const {from,to}=rangeParams(u),inRange=d=>inDateRange(d,from,to),esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const rows=db.tokens.filter(x=>inRange(x.date||String(x.created_at).slice(0,10)));let csv='Token,Name,Mobile,Service,Status,Created,Payment,UTR,Receipt\n'+rows.map(x=>[x.token,x.name,x.mobile,x.service,x.status,x.created_at,db.payments.find(p=>p.id===x.payment_id)?.amount||'',db.payments.find(p=>p.id===x.payment_id)?.utr||'',db.payments.find(p=>p.id===x.payment_id)?.receipt_no||''].map(esc).join(',')).join('\n');res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="angelstore-report.csv"','Cache-Control':'no-store'});return res.end(csv)}
    return serveStatic(req,res)
  }catch(e){console.error(e);if(e?.message==='Invalid JSON')return json(res,400,{error:'Invalid JSON request'});if(e?.message==='Payload too large')return json(res,413,{error:'Request payload too large'});return json(res,500,{error:'Server error'})}
}

const server=http.createServer(route);
server.on('clientError',(err,socket)=>{try{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')}catch{}});
const HOST=process.env.HOST || '0.0.0.0';
(async()=>{
  await startMonitoring();
  server.listen(PORT,HOST,()=>{scheduleBackups();console.log(`Angelstore CSC backend listening on ${HOST}:${PORT}`);});
})();
function shutdown(signal){console.log(`Received ${signal}; shutting down safely...`);server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
// Production misconfiguration already process.exit(1) at module load.

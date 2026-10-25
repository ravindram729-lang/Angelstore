const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_ROOT = path.resolve(process.env.ANGELSTORE_STORAGE_DIR || __dirname);
const DATA_FILE = path.join(STORAGE_ROOT, 'data.json');
const SCHEMA_VERSION = 3;
const AUDIT_RETENTION = Math.max(500, Number(process.env.ANGELSTORE_AUDIT_RETENTION || 2000));

const COLLECTION_DEFAULTS = {
  tokens: [], payments: [], customers: [], applications: [], documents: [],
  notifications: [], audit: [], offers: [], service_charges: [],
  customer_sessions: [], customer_qr: [], admin_sessions: [], admin_credentials: [], staff_sessions: [], staff: [], staff_roles: [], appointments: [],
  service_orders: [], home_services: [], deliveries: [], commissions: [],
  settlements: [], expenses: [], complaints: [], staff_attendance: [],
  service_sops: [], service_checklists: [], service_quality: [], service_configs: [], incidents: [], login_attempts: [], staff_login_attempts: [],
  settings: {
    centre:'Angelstore CSC', operator:'Ravindra Maurya', notify:'On', counters:'4',
    fee:'50', footer:'धन्यवाद! फिर सेवा का अवसर दें',
    upi_id:'9580773041@kotakbank', payee_name:'RAVINDRA KUMAR MAURYA', payment_qr_path:'assets/payment-qr.jpg', homepage_hero_image:'assets/customer-home-reference-visual-crop.png'
  }
};

function cloneDefaults(){
  return JSON.parse(JSON.stringify(COLLECTION_DEFAULTS));
}

function readRaw(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return {}; }
}

function customerIdFor(mobile){
  const clean=String(mobile||'').replace(/\D/g,'').slice(-10);
  const digest=crypto.createHash('sha256').update(clean||crypto.randomUUID()).digest('hex').slice(0,8).toUpperCase();
  return `AS-CUST-${digest}`;
}

function migrate(raw){
  const previousSchemaVersion=Number(raw?.meta?.schema_version||0);
  const db={...cloneDefaults(), ...(raw&&typeof raw==='object'?raw:{})};
  db.settings={...cloneDefaults().settings,...(db.settings&&typeof db.settings==='object'?db.settings:{})};
  if(previousSchemaVersion<3){
    db.settings.upi_id='9580773041@kotakbank';
    db.settings.payee_name='RAVINDRA KUMAR MAURYA';
    db.settings.payment_qr_path='assets/payment-qr.jpg';
  }
  if(!String(db.settings.upi_id||'').trim()) db.settings.upi_id='9580773041@kotakbank';
  if(!String(db.settings.payee_name||'').trim()) db.settings.payee_name='RAVINDRA KUMAR MAURYA';
  if(!String(db.settings.payment_qr_path||'').trim()) db.settings.payment_qr_path='assets/payment-qr.jpg';
  if(!String(db.settings.homepage_hero_image||'').trim()) db.settings.homepage_hero_image='assets/customer-home-reference-visual-crop.png';
  for(const key of Object.keys(COLLECTION_DEFAULTS)){
    if(key==='settings') db.settings={...COLLECTION_DEFAULTS.settings,...(db.settings&&typeof db.settings==='object'?db.settings:{})};
    else if(!Array.isArray(db[key])) db[key]=[];
  }

  // Legacy records already contain customer identity. Build a canonical customer record
  // without creating a PIN/session automatically. Existing data is preserved verbatim.
  const byMobile=new Map();
  const sources=[...(db.customers||[]),...(db.applications||[]),...(db.payments||[]),...(db.tokens||[])];
  for(const row of sources){
    const mobile=String(row.mobile||'').trim();
    if(!/^\d{10}$/.test(mobile)) continue;
    const current=byMobile.get(mobile)||{};
    const sourceCustomer = db.customers.find(x=>x.mobile===mobile);
    const pinHash = current.pin_hash || sourceCustomer?.pin_hash;
    const pinSalt = current.pin_salt || sourceCustomer?.pin_salt;
    const credentials = pinHash ? {
      pin_hash: pinHash,
      pin_salt: pinSalt,
      pin_set: true
    } : {};
    byMobile.set(mobile,{
      ...current,
      id: current.id || row.customer_id || customerIdFor(mobile),
      customer_id: current.customer_id || row.customer_id || customerIdFor(mobile),
      name: current.name || String(row.name||'').trim(),
      mobile,
      status: current.status || 'active',
      ...credentials,
      pin_set: Boolean(pinHash),
      created_at: current.created_at || row.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  db.customers=Array.from(byMobile.values());

  // Add non-breaking schema metadata. This does not alter existing business records.
  db.meta={...(db.meta||{}),schema_version:SCHEMA_VERSION,migrated_at:db.meta?.migrated_at||new Date().toISOString()};
  return db;
}

function ensureStorageRoot(){ fs.mkdirSync(STORAGE_ROOT,{recursive:true}); }

function load(){ ensureStorageRoot(); const db=migrate(readRaw()); db.meta={...(db.meta||{}),write_revision:Number(db.meta?.write_revision||0)}; return db; }

/** Trim unbounded arrays so data.json does not grow without limit. */
function prune(db){
  if(Array.isArray(db.audit) && db.audit.length > AUDIT_RETENTION){
    db.audit = db.audit.slice(0, AUDIT_RETENTION);
  }
  if(Array.isArray(db.notifications) && db.notifications.length > AUDIT_RETENTION){
    db.notifications = db.notifications.slice(0, AUDIT_RETENTION);
  }
  return db;
}

/**
 * Atomic, cross-process guarded JSON persistence with optimistic revision checks.
 * A revision mismatch refuses to overwrite a newer writer's changes.
 */
const LOCK_FILE = DATA_FILE + '.lock';
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5000;
let writeLockDepth = 0;
function sleepSync(ms){ const end=Date.now()+ms; while(Date.now()<end){} }
function acquireLock(){
  const started=Date.now();
  while(true){
    try{
      const fd=fs.openSync(LOCK_FILE,'wx');
      fs.writeSync(fd,`${process.pid}:${Date.now()}`);
      return fd;
    }catch(e){
      if(e.code!=='EEXIST') throw e;
      try{
        const st=fs.statSync(LOCK_FILE);
        if(Date.now()-st.mtimeMs>LOCK_TIMEOUT_MS){fs.rmSync(LOCK_FILE,{force:true});continue;}
      }catch{}
      if(Date.now()-started>LOCK_TIMEOUT_MS) throw new Error('Database write lock timeout');
      sleepSync(LOCK_RETRY_MS);
    }
  }
}
function releaseLock(fd){
  try{fs.closeSync(fd)}catch{}
  try{fs.rmSync(LOCK_FILE,{force:true})}catch{}
}
function currentRevision(){
  try{
    const raw=readRaw();
    return Number(raw?.meta?.write_revision||0);
  }catch{return 0}
}
function saveSync(db){
  ensureStorageRoot();
  const lock=acquireLock();
  try{
    prune(db);
    const disk=readRaw();
    const diskRevision=Number(disk?.meta?.write_revision||0);
    const expectedRevision=Number(db?.meta?.write_revision||0);
    if(diskRevision!==expectedRevision){
      throw new Error(`Concurrent database update detected (expected revision ${expectedRevision}, current ${diskRevision})`);
    }
    db.meta={...(db.meta||{}),schema_version:SCHEMA_VERSION,write_revision:diskRevision+1,last_saved_at:new Date().toISOString()};
    const tmp = DATA_FILE + '.tmp.' + process.pid + '.' + crypto.randomBytes(4).toString('hex');
    const fd = fs.openSync(tmp, 'w');
    try{
      fs.writeFileSync(fd, JSON.stringify(db, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, DATA_FILE);
    try{const dfd=fs.openSync(STORAGE_ROOT,'r');fs.fsyncSync(dfd);fs.closeSync(dfd)}catch{}
  }finally{releaseLock(lock)}
}
function save(db){
  writeLockDepth++;
  try{saveSync(db)}finally{writeLockDepth--}
}

/** Optional async save queue for callers that can await. */
let writeChain = Promise.resolve();
function saveAsync(db){
  const run = () => {
    writeLockDepth++;
    try { saveSync(db); }
    finally { writeLockDepth--; }
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

module.exports = {
  STORAGE_ROOT, DATA_FILE, SCHEMA_VERSION, COLLECTION_DEFAULTS, AUDIT_RETENTION,
  customerIdFor, load, save, saveAsync, migrate, prune, currentRevision
};

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);const escapeHtml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');let currentMobile=localStorage.getItem('angelCustomerMobile')||'';let lastRecords={};let services=Object.keys(SERVICE_INFO||{});
const serviceMeta={
'आधार सेवाएँ':['icon-01.png','popular'],'पैन सेवाएँ':['icon-07.png','popular'],'प्रमाण पत्र सेवाएँ':['icon-12.png','gov'],'बैंकिंग सेवाएँ':['icon-08.png','popular'],'किसान सेवाएँ':['icon-11.png','gov'],'बीमा सेवाएँ':['icon-17.png','digital'],'टैक्स एवं GST':['icon-24.png','gov'],'शिक्षा एवं छात्र':['icon-28.png','digital'],'यातायात सेवाएँ':['icon-16.png','digital'],'वाहन सेवाएँ':['icon-16.png','digital'],'संपत्ति एवं भूमि':['icon-10.png','gov'],'कानूनी सेवाएँ':['icon-33.png','gov'],'स्वास्थ्य सेवाएँ':['icon-15.png','gov'],'डिजिटल सेवाएँ':['icon-32.png','digital'],'अन्य नागरिक सेवाएँ':['icon-36.png','new'],'मोबाइल रिचार्ज':['icon-19.png','digital'],'बिजली बिल भुगतान':['icon-21.png','digital'],'पानी बिल भुगतान':['icon-23.png','digital'],'यात्रा टिकट':['icon-31.png','digital'],'सरकारी योजना':['icon-11.png','gov'],'ई-गवर्नेंस सेवाएँ':['icon-32.png','new'],'डाक एवं कुरियर':['icon-35.png','digital'],'पेंशन सेवाएँ':['icon-18.png','gov'],'परिवार रजिस्टर':['icon-03.png','gov']};function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
const BACKEND_KEY='angelBackendUrl';
const BACKEND_PRODUCTION_URL='https://angelestore.onrender.com';
const host=location.hostname;
const isProductionFrontend=host.endsWith('angelcsc.in')||host.endsWith('netlify.app');
const BACKEND_DEFAULT=(location.protocol==='file:'||host==='127.0.0.1'||host==='localhost')?'http://127.0.0.1:8000':(isProductionFrontend?BACKEND_PRODUCTION_URL:location.origin);
const SAVED_BACKEND=(localStorage.getItem('angelBackendUrl')||'').trim();
let backendUrl=(location.protocol==='file:'||location.hostname==='127.0.0.1'||location.hostname==='localhost')?BACKEND_DEFAULT:(SAVED_BACKEND||BACKEND_DEFAULT);
async function api(path,opts={}){
 const headers={...(opts.headers||{})};const guest=localStorage.getItem('angelGuestSession');if(guest)headers['X-Customer-Session']=guest;const csrf=document.cookie.match(/(?:^|;\s*)angel_csrf=([^;]+)/)?.[1];if(csrf&&['POST','PUT','PATCH','DELETE'].includes(String(opts.method||'GET').toUpperCase()))headers['X-CSRF-Token']=decodeURIComponent(csrf);if(!(opts.body instanceof FormData))headers['Content-Type']='application/json';
 let r;try{r=await fetch(backendUrl.replace(/\/$/,'')+path,{...opts,headers,credentials:'include'})}catch(e){throw Error('Backend से connection नहीं हो रहा। START-CUSTOMER.bat से server चलाएँ।')}
 const d=await r.json().catch(()=>({}));if(!r.ok){const err=Error(d.error||('Request failed ('+r.status+')'));err.status=r.status;throw err}return d
}
let authBusy=false;
function setAuthMessage(msg,ok=false){const el=$('#authMessage');if(el){el.textContent=msg;el.style.color=ok?'#16834b':'#b42318'}}
function setAuthMode(mode){const login=mode==='login';$('#authTitle').textContent=login?'Customer Login':'New Customer Registration';$('#authSubtitle').textContent=login?'Customer ID या mobile number और PIN से login करें।':'नाम, mobile और 4–6 digit PIN से account बनाएं। SMS OTP की जरूरत नहीं है।';$('#authLoginTab').classList.toggle('active',login);$('#authRegisterTab').classList.toggle('active',!login);$('#authLoginForm').classList.toggle('hidden',!login);$('#authRegisterForm').classList.toggle('hidden',login);$('#customerQrCard').classList.add('hidden');setAuthMessage('')}
function hasCustomerLogin(){return !!localStorage.getItem('angelCustomerProfile')}
function hasGuestSession(){return !!localStorage.getItem('angelGuestSession')}
function openCustomerLogin(message=''){setAuthMode('login');if(message)setAuthMessage(message);$('#customerAuthOverlay').classList.remove('hidden');$('#customerAuthOverlay').setAttribute('aria-hidden','false');$('#authIdentifier')?.focus();}
function closeCustomerLogin(){$('#customerAuthOverlay').classList.add('hidden');$('#customerAuthOverlay').setAttribute('aria-hidden','true');setAuthMessage('')}
function saveCustomerAuth(d){localStorage.removeItem('angelGuestSession');localStorage.setItem('angelCustomerProfile',JSON.stringify(d.customer));localStorage.setItem('angelCustomerMobile',d.customer.mobile);localStorage.setItem('angelCustomerQrPayload',d.qr_payload||('ANGELSTORE|CUSTOMER|'+d.customer.customer_id));currentMobile=d.customer.mobile;updateCustomerHeader(d.customer);drawCustomerQr(d.qr_payload||('ANGELSTORE|CUSTOMER|'+d.customer.customer_id));closeCustomerLogin();}
function updateCustomerHeader(c){const n=$('#customerHeaderName'),login=$('#customerHeaderLogin'),logout=$('#customerHeaderLogout');if(hasCustomerLogin()&&c){if(n)n.textContent='👤 '+(c.name||'Customer')+' · '+(c.customer_id||'');if(login)login.classList.add('hidden');if(logout)logout.classList.remove('hidden');}else{if(n)n.textContent='👤 Guest Customer';if(login)login.classList.remove('hidden');if(logout)logout.classList.add('hidden');}}
async function drawCustomerQr(payload){const card=$('#customerQrCard'),canvas=$('#customerQrCanvas');if(!card||!canvas)return;card.classList.remove('hidden');if(window.QRCode?.toCanvas){try{await QRCode.toCanvas(canvas,payload,{width:110,margin:1,errorCorrectionLevel:'M'});return}catch(e){}}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,110,110);ctx.fillText('QR unavailable',8,55)}
async function ensureCustomerAuth(){if(!localStorage.getItem('angelCustomerProfile')){updateCustomerHeader(null);return false}try{const d=await api('/api/customer/me');localStorage.setItem('angelCustomerProfile',JSON.stringify(d.customer));localStorage.setItem('angelCustomerMobile',d.customer.mobile);currentMobile=d.customer.mobile;updateCustomerHeader(d.customer);return true}catch(e){localStorage.removeItem('angelCustomerProfile');updateCustomerHeader(null);return false}}
$('#authLoginTab').onclick=()=>setAuthMode('login');$('#authRegisterTab').onclick=()=>setAuthMode('register');$('#customerHeaderLogin').onclick=()=>openCustomerLogin();
$('#customerAuthClose').onclick=closeCustomerLogin;$('#customerAuthOverlay').addEventListener('click',e=>{if(e.target.id==='customerAuthOverlay')closeCustomerLogin()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#customerAuthOverlay').classList.contains('hidden'))closeCustomerLogin();closeCustomerSidebar();}});function openCustomerSidebar(){const app=$('#customerApp');if(app){app.classList.add('sidebar-open');$('#customerMobileMenu')?.setAttribute('aria-expanded','true')}}function closeCustomerSidebar(){const app=$('#customerApp');if(app){app.classList.remove('sidebar-open');$('#customerMobileMenu')?.setAttribute('aria-expanded','false')}}$('#customerMobileMenu').onclick=openCustomerSidebar;$('#customerSidebarClose').onclick=closeCustomerSidebar;$('#customerSidebarBackdrop').onclick=closeCustomerSidebar;
$('#authLoginForm').onsubmit=async e=>{e.preventDefault();if(authBusy)return;authBusy=true;try{const d=await api('/api/customer/login',{method:'POST',body:JSON.stringify({identifier:$('#authIdentifier').value.trim(),pin:$('#authLoginPin').value})});saveCustomerAuth(d);toast('Customer login सफल हुआ');refreshAll()}catch(err){setAuthMessage(err.message)}finally{authBusy=false}};
$('#authRegisterForm').onsubmit=async e=>{e.preventDefault();if(authBusy)return;const pin=$('#authRegisterPin').value,pin2=$('#authRegisterPin2').value;if(pin!==pin2)return setAuthMessage('दोनों PIN समान होने चाहिए');if(!/^[0-9]{4,6}$/.test(pin))return setAuthMessage('PIN 4–6 digit का होना चाहिए');authBusy=true;try{const d=await api('/api/customer/register',{method:'POST',body:JSON.stringify({name:$('#authName').value.trim(),mobile:$('#authMobile').value.trim(),pin,claim_token:localStorage.getItem('angelGuestSession')||''})});saveCustomerAuth(d);toast('Customer account बन गया');refreshAll()}catch(err){setAuthMessage(err.message)}finally{authBusy=false}};
$('#customerHeaderLogout').onclick=async()=>{stopPaymentStatusPolling();try{if(hasCustomerLogin())await api('/api/customer/logout',{method:'POST'})}catch{}['angelCustomerProfile','angelCustomerMobile','angelCustomerQrPayload','angelApplicationId','angelApplicationMeta','angelPaymentId','angelCurrentTokenId','angelSelectedService','angelSelectedAmount','angelSelectedOfferId','angelGuestSession'].forEach(k=>localStorage.removeItem(k));window._angelGlobalQueue=[];currentMobile='';syncTokenDocumentsGate(false);updateCustomerHeader(null);toast('Logout सफल हुआ')};
let customerHelpReady=false;
function initCustomerHelp(){
 if(customerHelpReady)return;
 const input=$("#customerHelpSearch"),btn=$("#customerHelpSearchBtn"),status=$("#customerHelpSearchStatus");
 const cards=[...document.querySelectorAll("#page-customer-help .help-card")];
 if(!input||!btn)return;
 customerHelpReady=true;
 const run=()=>{
  const q=String(input.value||"").trim().toLowerCase();
  let shown=0;
  cards.forEach(card=>{const hay=(card.textContent+" "+(card.dataset.helpTopic||"")).toLowerCase();const match=!q||hay.includes(q);card.hidden=!match;if(match)shown++;});
  if(status)status.textContent=q?(shown+" help option"+(shown===1?"":"s")+" मिला।"):(cards.length+" help options available।");
 };
 btn.addEventListener("click",run);
 input.addEventListener("input",run);
 input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();run()}});
 cards.forEach(card=>card.addEventListener("click",()=>{input.value=card.querySelector("h3")?.textContent?.replace(/^\S+\s*/,"")||"";run();input.focus()}));
 run();
}
async function loadCustomerComplaints(){
 const box=$("#customerComplaintsList");if(!box)return;
 try{const d=await customerApi('/api/customer/complaints');const rows=d.complaints||[];box.innerHTML=rows.length?rows.map(x=>`<div class="notification"><div class="nicon">${x.status==='resolved'||x.status==='closed'?'✅':'📝'}</div><div><b>${escapeHtml(x.complaint_id)} · ${escapeHtml(x.title)}</b><small>${escapeHtml(x.category)} · ${escapeHtml(x.status)} · ${escapeHtml(new Date(x.created_at).toLocaleString('en-IN'))}${x.resolution?' · '+escapeHtml(x.resolution):''}</small></div></div>`).join(''):'<p class="muted">अभी कोई support request नहीं है।</p>';}catch(e){box.innerHTML=`<p class="muted">${escapeHtml(e.message)}</p>`;}
}
function initCustomerSupport(){
 if(!hasCustomerLogin())return;
 loadCustomerComplaints();
 const form=$("#customerComplaintForm");if(form&&form.dataset.bound!=='1'){form.dataset.bound='1';form.addEventListener('submit',async e=>{e.preventDefault();const btn=$("#submitCustomerComplaint"),status=$("#customerComplaintStatus");btn.disabled=true;status.textContent='Submitting…';try{const d=await customerApi('/api/customer/complaints',{method:'POST',body:JSON.stringify({category:$("#customerComplaintCategory").value,title:$("#customerComplaintTitle").value,description:$("#customerComplaintDescription").value})});status.textContent=`${d.complaint.complaint_id} submit हो गया।`;form.reset();await loadCustomerComplaints();await refreshAll();}catch(err){status.textContent=err.message}finally{btn.disabled=false}})}
 $("#refreshCustomerComplaints")?.addEventListener('click',loadCustomerComplaints);
}

function go(page){if(history.replaceState){const url=new URL(location.href);url.hash=page;history.replaceState(null,'',url)}const protectedPages=new Set(['customer-recharge','customer-uppcl','customer-history','customer-receipts','customer-applications','customer-appointments','customer-home-service','customer-documents','customer-notifications','customer-tracking']);if(protectedPages.has(page)&&!hasCustomerLogin()){openCustomerLogin('यह section देखने के लिए Customer Login जरूरी है। Guest mode में आप service, payment और token workflow चला सकते हैं।');return}closeCustomerSidebar();$$('.page').forEach(x=>x.classList.remove('active-page'));$('#page-'+page)?.classList.add('active-page');$$('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.getElementById('customerApp')?.classList.toggle('status-reference-shell',page==='customer-status');document.getElementById('customerApp')?.classList.toggle('token-reference-shell',page==='customer-token');$('#customerCrumb').textContent={ 'customer-home':'Customer Home','customer-services':'सभी सेवाएँ','customer-recharge':'Mobile Recharge','customer-uppcl':'UPPCL Bill Payment','customer-token':'Token Generate','customer-status':'Live Token Status','customer-history':'My Token History','customer-receipts':'Receipt & Records','customer-applications':'My Applications','customer-appointments':'Appointments','customer-home-service':'Home Service','customer-help':'Help Centre','customer-documents':'Documents','customer-notifications':'Notifications','customer-tracking':'Application Tracking','customer-tracking':'Application Tracking'}[page]||page;if(page.startsWith('customer-'))refreshAll();if(page==='customer-token'){const a=localStorage.getItem('angelSelectedAmount');if(a)$('#cAmount').value=a;checkPaymentStatus()}if(page==='customer-services')renderCustomerServices();if(page==='customer-home')initCustomerQuickServices();if(page==='customer-help'){initCustomerHelp();initCustomerSupport();}if(page==='customer-recharge')initRechargePage();if(page==='customer-uppcl')initUppclPage();if(page==='customer-documents')loadDocuments();if(page==='customer-home-service'){populateHomeServiceSelect();loadHomeServices()}}
function initStatusReferenceShell(){const app=document.getElementById('customerApp');if(!app)return;const active=location.hash==='#customer-status'||document.getElementById('page-customer-status')?.classList.contains('active-page');app.classList.toggle('status-reference-shell',!!active);const search=document.getElementById('statusShellSearch');if(search&&!search.dataset.bound){search.dataset.bound='1';search.onclick=()=>{go('customer-services');setTimeout(()=>document.getElementById('customerServiceSearch')?.focus(),60)}}const notify=document.getElementById('statusShellNotifications');if(notify&&!notify.dataset.bound){notify.dataset.bound='1';notify.onclick=()=>go('customer-notifications')}const theme=document.getElementById('statusShellTheme');if(theme&&!theme.dataset.bound){theme.dataset.bound='1';const saved=localStorage.getItem('angelStatusTheme')||'light';app.classList.toggle('status-dark-preview',saved==='dark');theme.textContent=saved==='dark'?'🌙 ◐':'☀️ ◐';theme.onclick=()=>{const dark=!app.classList.contains('status-dark-preview');app.classList.toggle('status-dark-preview',dark);localStorage.setItem('angelStatusTheme',dark?'dark':'light');theme.textContent=dark?'🌙 ◐':'☀️ ◐'}}const tablet=document.getElementById('statusShellTablet');if(tablet&&!tablet.dataset.bound){tablet.dataset.bound='1';tablet.onclick=()=>{app.classList.remove('status-mobile-preview');app.classList.toggle('status-tablet-preview');tablet.classList.toggle('active',app.classList.contains('status-tablet-preview'));document.getElementById('statusShellMobile')?.classList.remove('active')}}const mobile=document.getElementById('statusShellMobile');if(mobile&&!mobile.dataset.bound){mobile.dataset.bound='1';mobile.onclick=()=>{app.classList.remove('status-tablet-preview');app.classList.toggle('status-mobile-preview');mobile.classList.toggle('active',app.classList.contains('status-mobile-preview'));document.getElementById('statusShellTablet')?.classList.remove('active')}}}
$$('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));initStatusReferenceShell();
$$('[data-home-service]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.homeService;
  if(key==='mobile-recharge'){go('customer-recharge');toast('📱 Mobile Recharge खोला गया');}
  else if(key==='uppcl-bill'){go('customer-uppcl');toast('⚡ UPPCL Bill Payment खोला गया');}
});
function populateCustomerPaymentServices(){const sel=$('#cService');if(!sel)return;const current=localStorage.getItem('angelSelectedService')||sel.value||'';const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service / Sub-category चुनें</option>'+opts.join('');if(current&&[...sel.options].some(o=>o.value===current))sel.value=current;}
let customServiceRows=[];let serviceChargeRows=[];let selectedCategory='';let selectedSub=null;
populateCustomerPaymentServices();renderCustomerServices();loadPublishedServices().then(()=>renderCustomerServices()).catch(()=>renderCustomerServices());
function money(v){return Number(v||0).toFixed(2)}
function localGovt(v){
  if(v===null||v===undefined)return 0;
  const s=String(v).trim().replace(/,/g,'');
  const m=s.match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):0;
}

async function loadPublishedServices(){try{const [svc,chg]=await Promise.all([api('/api/services'),api('/api/service-charges')]);serviceChargeRows=Array.isArray(chg.charges)?chg.charges:[];customServiceRows=[];if(Array.isArray(svc.services)){svc.services.forEach(x=>{SERVICE_INFO[x.category]={...(SERVICE_INFO[x.category]||{}),services:x.services||[]}});services=svc.services.map(x=>x.category);services=[...new Set(services)];}populateCustomerPaymentServices();populateHomeServiceSelect();populateAppointmentService();renderCustomerServices()}catch(e){serviceChargeRows=[];customServiceRows=[]}}
function categoryInfo(name){return SERVICE_INFO[name]||null}
function categoryDescription(name){const i=categoryInfo(name);return i?.note||`${name} की उपलब्ध services, eligibility, documents, charges और process देखें।`}
function categoryServices(name){const base=(categoryInfo(name)?.services||[]).map(x=>{const saved=serviceChargeRows.find(r=>r.category===name&&r.service===x.name);return {...x,csc:saved?Number(saved.csc_fee||0):Number(x.csc||0),govt:saved?('₹'+Number(saved.govt_fee||0).toFixed(2)):(x.govt||'Portal/department अनुसार'),_source:'catalog'}});const custom=customServiceRows.filter(x=>(x.category||'').trim()===name).map(x=>({name:x.Name||x.name,csc:Number(x.fee||0),govt:x.govt||'Portal/department अनुसार',docs:x.documents||x.Documents||x.documents_required||[],process:x.process||[],description:x.description||x.details||'',time:x.time||0,appointment:!!x.appointment,priority:!!x.priority,_source:'admin',_id:x.id}));return [...base,...custom]}
function initCustomerQuickServices(){const root=$('#customerQuickServices');if(!root||root.dataset.ready==='1')return;root.dataset.ready='1';const priority={'mobile-recharge':'customer-recharge',uppcl:'customer-uppcl','online-form':'customer-services',scholarship:'customer-services'};root.querySelectorAll('[data-quick-service]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.quickService;const page=priority[key]||'customer-services';go(page);if(key==='online-form'){setTimeout(()=>{const q=$('#customerServiceSearch');if(q){q.value='ऑनलाइन';renderCustomerServices('all',q.value)}},80)}if(key==='scholarship'){setTimeout(()=>{const q=$('#customerServiceSearch');if(q){q.value='शिक्षा';renderCustomerServices('all',q.value)}},80)}}))}
function renderCustomerServices(filter='all',q=''){const grid=$('#customerServiceGrid');if(!grid)return;const term=(q||'').toLowerCase();const rows=services.filter(s=>(filter==='all'||serviceMeta[s]?.[1]===filter)&&s.toLowerCase().includes(term));grid.innerHTML=rows.map(s=>{const [icon,cat]=serviceMeta[s]||['icon-32.png','digital'];const subs=categoryServices(s);const label=cat==='popular'?'लोकप्रिय':cat==='new'?'नया':cat==='gov'?'सरकारी':'डिजिटल';return `<article class="service" data-customer-service="${escapeHtml(s)}"><div class="service-icon-wrap"><img class="service-icon-img" src="assets/service-icons/${icon}" alt="${s} icon" loading="lazy" onerror="this.onerror=null;this.src='assets/service-icons/icon-32.png'"></div><h3>${escapeHtml(s)}</h3><small class="service-count">${subs.length} sub-services</small><span class="tag">${label}</span><span class="public-apply">Services और पूरी Details देखें →</span></article>`}).join('')||'<div class="panel">कोई सेवा नहीं मिली।</div>';$$('#customerServiceGrid .service').forEach(el=>el.onclick=()=>openCustomerServiceDetails(el.dataset.customerService))}
function openCustomerServiceDetails(name){selectedCategory=name;selectedSub=null;const info=categoryInfo(name)||{};const subs=categoryServices(name);$('#sdCategory').textContent='SERVICE CATEGORY';$('#sdTitle').textContent=name;$('#sdDescription').textContent=categoryDescription(name);$('#sdStats').innerHTML=[['Sub-services',subs.length],['CSC charge','Service-wise'],['Government fee','As applicable'],['Token',subs.some(x=>x.workflow?.tokenRequired)?'Applicable where configured':'Not applicable']].map(x=>`<div class="service-detail-stat"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('');$('#sdSubservices').innerHTML=subs.map((x,i)=>`<article class="subservice-card"><h3>${i+1}. ${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description||'इस service की eligibility, documents, charges और process देखें।')}</p><div class="fee-line"><span class="fee-chip">💰 CSC: ₹${money(x.csc)}</span><span class="fee-chip">🎫 Token: ${x.workflow?.tokenRequired?'Yes':'No'}</span><span class="fee-chip">🧾 Receipt: ${x.workflow?.receiptRequired?'Yes':'No'}</span><span class="fee-chip">🏛️ Govt: ${escapeHtml(x.govt||'As applicable')}</span>${x.time?`<span class="fee-chip">⏱️ ${money(x.time)} min</span>`:''}</div><p><b>📄 Documents:</b> ${(x.docs||[]).length?(x.docs||[]).map(escapeHtml).join(' · '):'Service-specific documents'}</p><button class="subservice-btn" data-sub="${i}">पूरी Details देखें →</button></article>`).join('')||'<div class="panel">इस category में अभी कोई sub-service configured नहीं है।</div>';const proc=info.process||subs[0]?.process||[];$('#sdProcess').innerHTML=proc.map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific process centre पर confirm करें।</li>';const docs=[...new Set(subs.flatMap(x=>x.docs||[]))];$('#sdDocs').innerHTML=docs.map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific documents</li>';$('#sdNote').textContent=info.note||'Government/portal charges समय, राज्य और department के अनुसार बदल सकते हैं। Final amount customer से confirm करें।';$('#sdOverview').style.display='block';$('#sdSelected').classList.remove('show');$('#serviceDetailModal').classList.remove('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','false');$$('#sdSubservices .subservice-btn').forEach(b=>b.onclick=()=>showSubserviceDetails(subs[Number(b.dataset.sub)]))}
function showSubserviceDetails(sub){
 if(!sub)return;
 selectedSub=sub;
 $('#sdOverview').style.display='none';
 $('#sdSelected').classList.add('show');
 $('#sdSelectedTitle').textContent=sub.name;
 $('#sdSelectedDescription').textContent=sub.description||'इस service की पूरी जानकारी नीचे दी गई है।';
 $('#sdTokenBtn').style.display=sub.workflow?.tokenRequired?'':'none';
 $('#sdSelectedStats').innerHTML=[['CSC Charge','₹'+money(sub.csc)],['Government/Portal',sub.govt||'As applicable'],['Processing',sub.time?sub.time+' min':'As applicable'],['Appointment',sub.workflow?.appointmentRequired?'Required':'Not required'],['Token',sub.workflow?.tokenRequired?'Required':'Not required'],['Receipt',sub.workflow?.receiptRequired?'Automatic':'Not applicable'],['Tracking',sub.workflow?.applicationTracking?'Enabled':'Not applicable']].map(x=>`<div class="service-detail-stat"><span class="muted">${escapeHtml(x[0])}</span><b>${escapeHtml(x[1])}</b></div>`).join('');
 $('#sdSelectedDocs').innerHTML=(sub.docs||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Service-specific documents</li>';
 $('#sdSelectedProcess').innerHTML=(sub.process||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>Centre/official portal process as applicable.</li>';
 $('#sdSelectedNote').textContent=categoryInfo(selectedCategory)?.note||'Government/portal charges may vary. Confirm the final payable amount before payment.';
}

function syncTokenGenerateDesign(){const amount=Number($('#cAmount')?.value||0);const service=$('#cService')?.value||'—';['tokenServiceCharge','tokenTotalPayable','tokenSideAmount','tokenSideTotal'].forEach(id=>{const el=$('#'+id);if(el)el.textContent=amount.toFixed(2).replace(/\.00$/,'')});const svc=$('#tokenBillService');if(svc)svc.textContent=service==='—'?'Selected service':service;const display=$('#paymentAmountDisplay');if(display)display.textContent=amount.toFixed(2);const gen=$('#generateToken');const submit=$('#submitPayment');if(gen){const parts=service.split(' — '),cat=parts.shift(),sub=parts.join(' — '),svcCfg=(categoryInfo(cat)?.services||[]).find(x=>x.name===sub),wf=svcCfg?.workflow||{};const paymentVerified=$('#paymentStatus')?.classList.contains('verified');const alreadyGenerated=!!Number(localStorage.getItem('angelCurrentTokenId')||0);const invalidAmount=wf.paymentRequired&&(!Number.isFinite(amount)||amount<=0);if(wf.tokenRequired){gen.disabled=invalidAmount||(wf.paymentRequired?!paymentVerified||alreadyGenerated:alreadyGenerated);gen.title=invalidAmount?'Service payable amount configured नहीं है। Admin से charge configuration check करें।':gen.disabled?(alreadyGenerated?'इस application का token पहले ही generate हो चुका है।':'Admin payment verification के बाद Live Token generate होगा।'):'Live Token generate करें';}if(submit){submit.disabled=invalidAmount;submit.title=invalidAmount?'Service payable amount configured नहीं है। Admin से charge configuration check करें।':'';}const status=$('#generatedStatus');if(status){if(alreadyGenerated)status.textContent='Token Generated · Payment Verified';else if(wf.paymentRequired&&paymentVerified)status.textContent='Payment Verified · Token Ready';else if(invalidAmount)status.textContent='⚠️ Payment amount not configured';else if(wf.paymentRequired)status.textContent='Payment verification required';else if(wf.tokenRequired)status.textContent='Application ready · Token pending';else status.textContent='Token not required';}}}

async function applySelectedServiceCharge(category,serviceName,defaultCsc,defaultGovt){
 try{
  const d=await api('/api/service-charges?category='+encodeURIComponent(category)+'&service='+encodeURIComponent(serviceName));
  const saved=d.charge||null;
  const info=categoryInfo(category),sub=(info?.services||[]).find(x=>x.name===serviceName);
  const govt=saved?Number(saved.govt_fee||0):Number(defaultGovt??localGovt(sub?.govt));
  const csc=saved?Number(saved.csc_fee??defaultCsc??0):Number(defaultCsc??sub?.csc??0);
  const other=saved?Number(saved.other_fee||0):0;
  const total=Number((govt+csc+other).toFixed(2));
  $('#cAmount').value=total;
  localStorage.setItem('angelSelectedAmount',String(total));
  const box=document.getElementById('customerChargeBreakdown');
  if(box)box.innerHTML=`Govt / Portal: ₹${govt.toFixed(2)} &nbsp; + &nbsp; CSC: ₹${csc.toFixed(2)} &nbsp; + &nbsp; Other: ₹${other.toFixed(2)} &nbsp; = &nbsp; <b>₹${total.toFixed(2)}</b>`;
  updateUpiPaymentLink();
  syncTokenGenerateDesign();
  return total;
 }catch(e){
  const total=Number((Number(defaultGovt??0)+Number(defaultCsc??0)).toFixed(2));
  $('#cAmount').value=total;
  localStorage.setItem('angelSelectedAmount',String(total));
  updateUpiPaymentLink();
  syncTokenGenerateDesign();
  throw e;
 }
}

$('#cService').onchange=async()=>{
 const v=$('#cService').value||'';
 if(!v)return;
 const parts=v.split(' — '),cat=parts.shift(),sub=parts.join(' — '),svc=(categoryInfo(cat)?.services||[]).find(x=>x.name===sub); const wf=svc?.workflow||{}; const payForm=$('#customerPaymentForm'),gen=$('#generateToken'); if(payForm)payForm.style.display=wf.paymentRequired?'':'none'; if(gen){gen.style.display=wf.tokenRequired?'':'none';gen.disabled=!wf.tokenRequired || wf.paymentRequired;} const msg=document.querySelector('#page-customer-token .page-title p'); if(msg)msg.textContent=wf.paymentRequired?(wf.tokenRequired?'पूरी service details के बाद payment करें। Admin verification के बाद Live Token मिलेगा।':'यह service payment workflow से अलग है; उपलब्ध service workflow के अनुसार आगे बढ़ें।'):(wf.tokenRequired?'इस service में payment नहीं है; Token queue उपलब्ध है।':'इस service के लिए payment/token workflow लागू नहीं है।');
 try{await applySelectedServiceCharge(cat,sub,Number(svc?.csc||0),localGovt(svc?.govt));}
 catch(e){toast(e.message||'Service charge load नहीं हुआ');}
 localStorage.setItem('angelSelectedService',v);
 const selectedOfferId=Number(localStorage.getItem('angelSelectedOfferId')||0);const selectedOffer=getLiveOffers().find(o=>Number(o.id)===selectedOfferId&&o.service===v&&Number(o.offer_price)>0);if(selectedOffer){$('#cAmount').value=Number(selectedOffer.offer_price).toFixed(2);localStorage.setItem('angelSelectedAmount',String(Number(selectedOffer.offer_price)));}else{localStorage.removeItem('angelSelectedOfferId');}
 syncTokenGenerateDesign();
 localStorage.removeItem('angelPaymentId');
 $('#paymentStatus').textContent=wf.paymentRequired?'Payment verification pending है।':(wf.tokenRequired?'इस service में payment required नहीं है। Application के बाद Token generate करें।':'इस service के लिए payment/token workflow लागू नहीं है।');
 $('#paymentStatus').className='payment-status';
 const gs=$('#generatedStatus');if(gs)gs.textContent=wf.paymentRequired?'Payment verification required':(wf.tokenRequired?'Application ready · Token pending':'Token not required');
 $('#generateToken').disabled=!wf.tokenRequired || wf.paymentRequired;
};

$('#sdTokenBtn').onclick=async()=>{
 const sub=selectedSub;
 if(!selectedCategory||!sub)return toast('पहले service/sub-service चुनें'); if(!sub.workflow?.tokenRequired)return toast('इस service के लिए Token लागू नहीं है।');
 const value=selectedCategory+' — '+sub.name;
 populateCustomerPaymentServices();
 $('#cService').value=value;
 try{await applySelectedServiceCharge(selectedCategory,sub.name,Number(sub.csc||0),localGovt(sub.govt));}
 catch(e){toast(e.message||'Service charge load नहीं हुआ');return;}
 localStorage.setItem('angelSelectedService',value);
 $('#serviceDetailModal').classList.add('hidden');
 $('#serviceDetailModal').setAttribute('aria-hidden','true');
 go('customer-token');
 toast(sub.name+' चुनी गई');
};
$('#sdClose').onclick=()=>{$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')};
// Escape closes service details modal and clicking the backdrop closes it.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#serviceDetailModal').classList.contains('hidden')){$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')}});
$('#serviceDetailModal').addEventListener('click',e=>{if(e.target.id==='serviceDetailModal'){$('#serviceDetailModal').classList.add('hidden');$('#serviceDetailModal').setAttribute('aria-hidden','true')}});
$('#sdBack').onclick=()=>{$('#sdSelected').classList.remove('show');$('#sdOverview').style.display='block'};$('#serviceDetailModal').onclick=e=>{if(e.target.id==='serviceDetailModal')$('#sdClose').click()};
$('#customerServiceSearch').oninput=e=>renderCustomerServices('all',e.target.value);$$('[data-cfilter]').forEach(b=>b.onclick=()=>{$$('[data-cfilter]').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');renderCustomerServices(b.dataset.cfilter,$('#customerServiceSearch').value)});
function syncTokenDocumentsGate(hasToken=false){const box=$('#tokenDocumentsAfterToken'),btn=$('#openCustomerDocumentsAfterToken'),note=$('#tokenDocumentsGateNote');if(!box)return;box.style.display='';if(btn){btn.disabled=!hasToken;btn.textContent=hasToken?'＋ दस्तावेज़ अपलोड करें':'🔒 दस्तावेज़ अपलोड करें';btn.title=hasToken?'Required documents upload/verification खोलें':'Live Token generate होने के बाद documents upload होंगे';}if(note){note.textContent=hasToken?'आपका Live Token generate हो चुका है। अब required documents upload/verification शुरू करें।':'Live Token generate होने के बाद required documents upload/verification शुरू होगा।';note.classList.toggle('token-doc-unlocked',hasToken);}}
function saveCustomer(){const n=$('#cName').value.trim(),m=$('#cMobile').value.trim();if(!n)return toast('नाम भरें');if(!/^\d{10}$/.test(m))return toast('सही 10 digit mobile भरें');currentMobile=m;localStorage.setItem('angelCustomerMobile',m);localStorage.setItem('angelCustomerName',n);return {name:n,mobile:m,service:$('#cService').value}}
let paymentConfig={upi_id:'',payee_name:'',payment_qr_path:'assets/payment-qr.jpg',bank_name:'',bank_account_name:'',bank_account_number:'',bank_ifsc:'',bank_branch:''};
async function loadPaymentConfig(){
  try{
    const c=await api('/api/public-config');
    paymentConfig={...paymentConfig,...c};
    const hero=document.querySelector('.c-home-hero-art img');
    if(hero&&c.homepage_hero_image){const u=String(c.homepage_hero_image);hero.src=u.startsWith('/api/')?(backendUrl.replace(/\/$/,'')+u):u;hero.setAttribute('data-homepage-hero','1');}
    const upi=$('#cUpiId'); if(upi) upi.textContent=paymentConfig.upi_id||'UPI configuration unavailable';
    const qr=$('#paymentQrImage'); if(qr&&paymentConfig.payment_qr_path) qr.src=paymentConfig.payment_qr_path;
    const rechargeQr=$('#rechargePaymentQr'); if(rechargeQr&&paymentConfig.payment_qr_path) rechargeQr.src=paymentConfig.payment_qr_path;
    const rechargeUpi=$('#rechargeUpiId'); if(rechargeUpi) rechargeUpi.textContent=paymentConfig.upi_id||'UPI configuration unavailable';
    const bank={name:paymentConfig.bank_name,accountName:paymentConfig.bank_account_name,account:paymentConfig.bank_account_number,ifsc:paymentConfig.bank_ifsc,branch:paymentConfig.bank_branch};
    const bankEl=$('#bankPaymentDetails'); if(bankEl){bankEl.innerHTML=[['Bank',bank.name],['Account Name',bank.accountName],['Account Number',bank.account],['IFSC',bank.ifsc],['Branch',bank.branch]].filter(x=>x[1]).map(x=>`<div><span>${escapeHtml(x[0])}</span><b>${escapeHtml(x[1])}</b></div>`).join('')||'<div class="muted">Bank transfer details अभी configured नहीं हैं।</div>';}
    updateUpiPaymentLink();
  }catch(e){
    const upi=$('#cUpiId'); if(upi) upi.textContent='UPI configuration unavailable';
  }
}
function updateUpiPaymentLink(){
  const amount=Number($('#cAmount').value||0);
  const service=($('#cService').value||'AngelStore CSC Service').slice(0,60);
  const upi=String(paymentConfig.upi_id||'').trim(), payee=String(paymentConfig.payee_name||'').trim();
  const params=new URLSearchParams({pa:upi,pn:payee,cu:'INR'});
  if(Number.isFinite(amount)&&amount>0) params.set('am',amount.toFixed(2));
  params.set('tn',service);
  const b=$('#upiPayButton'); if(b){b.dataset.upiUrl=upi?'upi://pay?'+params.toString():'';b.setAttribute('aria-disabled',upi?'false':'true');b.classList.toggle('disabled',!upi);b.setAttribute('tabindex',upi?'0':'-1');b.disabled=!upi;}
  const d=$('#paymentAmountDisplay'); if(d) d.textContent=(Number.isFinite(amount)?amount:0).toFixed(2);
}
$('#upiPayButton').onclick=(e)=>{const url=String(e.currentTarget?.dataset?.upiUrl||'');if(!url){e.preventDefault();toast('UPI configuration उपलब्ध नहीं है');return;}window.location.href=url;};
$('#copyUpiButton').onclick=async()=>{const upi=String(paymentConfig.upi_id||'').trim();if(!upi)return toast('UPI configuration उपलब्ध नहीं है');try{await navigator.clipboard.writeText(upi);toast('UPI ID copy हो गया')}catch(e){toast('UPI ID: '+upi)}};
$('#cService').addEventListener('change',updateUpiPaymentLink);
$('#cAmount').addEventListener('input',updateUpiPaymentLink);
updateUpiPaymentLink();
loadPaymentConfig();
let customerPaymentMethod='UPI';
function setCustomerPaymentMethod(method){
  customerPaymentMethod=['UPI','QR','Bank Transfer','Cash'].includes(method)?method:'UPI';
  const hidden=$('#cPaymentMethod'); if(hidden) hidden.value=customerPaymentMethod;
  $$('#page-customer-token .token-payment-method').forEach(b=>b.classList.toggle('active',b.dataset.method===method));
  const upiCard=document.querySelector('#page-customer-token .upi-pay-card');
  const qrCard=document.querySelector('#page-customer-token .qr-pay-card');
  const bankCard=document.querySelector('#page-customer-token .bank-pay-card');
  if(upiCard) upiCard.style.display=(method==='UPI'||method==='QR')?'':'none';
  if(qrCard) qrCard.style.display=method==='QR'?'':'none';
  if(bankCard) bankCard.style.display=method==='Bank Transfer'?'':'none';
  const cashNote=document.getElementById('customerCashPaymentNote');
  if(cashNote) cashNote.classList.toggle('hidden',method!=='Cash');
  const methodLabel=document.getElementById('selectedPaymentMethodLabel');
  if(methodLabel) methodLabel.textContent=method==='Cash'?'Cash at CSC':method==='Bank Transfer'?'Bank Transfer':method==='QR'?'QR Code':'UPI';
}
$$('#page-customer-token .token-payment-method').forEach(b=>b.addEventListener('click',()=>setCustomerPaymentMethod(b.dataset.method||'UPI')));
setCustomerPaymentMethod('UPI');

async function submitPayment(){
  const c=saveCustomer();
  if(!c)return;
  const utr=$('#cUtr').value.trim();
  const file=$('#cPaymentScreenshot').files?.[0];
  const amount=Number($('#cAmount').value||localStorage.getItem('angelSelectedAmount')||0);
  if(!c.service||!amount)return toast('Service और payable amount जरूरी है');
  if(customerPaymentMethod!=='Cash'&&!utr&&!file)return toast('कम-से-कम UTR number या Payment screenshot दें');
  if(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('केवल PNG/JPG/WEBP screenshot दें');
    if(file.size>5*1024*1024)return toast('Screenshot 5MB से छोटा रखें');
  }
  try{
    let aid=Number(localStorage.getItem('angelApplicationId')||0),session=localStorage.getItem('angelGuestSession')||'';
    let a=null,meta=null;
    try{meta=JSON.parse(localStorage.getItem('angelApplicationMeta')||'null')}catch{}
    const sameMeta=meta&&meta.name===c.name&&meta.mobile===c.mobile&&meta.service===c.service;
    // Never trust a stale localStorage application after a server/database reset.
    // For logged-in customers, validate the application against the server before reusing it.
    let reusable=false;
    if(aid&&session&&sameMeta){
      if(hasCustomerLogin()){
        try{
          const existing=await api('/api/customer/application?id='+encodeURIComponent(aid));
          const ea=existing?.application;
          reusable=!!(ea&&Number(ea.id)===aid&&ea.mobile===c.mobile&&ea.service===c.service);
        }catch{reusable=false}
      }else{
        reusable=true;
      }
    }
    if(reusable){
      a={id:aid,customer_token:session};
    }else{
      // The cached application may no longer exist (for example after a clean/test database reset).
      // Clear dependent payment/token state before creating the fresh application.
      localStorage.removeItem('angelPaymentId');
      localStorage.removeItem('angelCurrentTokenId');
      a=await api('/api/customer/application',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,category:c.service.split(' — ')[0]||'',note:'Payment + token request'})});
      localStorage.setItem('angelApplicationId',String(a.id));
      localStorage.setItem('angelApplicationMeta',JSON.stringify({id:a.id,name:c.name,mobile:c.mobile,service:c.service}));
      if(a.customer_token){localStorage.setItem('angelGuestSession',a.customer_token);updateCustomerHeader(null);}
    }
    let screenshot=null;
    if(file){screenshot=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Payment screenshot read नहीं हो सका'));reader.readAsDataURL(file)})}
    const d=await api('/api/customer/payment',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,amount,utr,screenshot,method:customerPaymentMethod,application_id:a.id,offer_id:Number(localStorage.getItem('angelSelectedOfferId')||0)||null})});
    localStorage.setItem('angelPaymentId',String(d.id));
    $('#paymentStatus').textContent='⏳ Admin payment proof verification pending है.';
    $('#paymentStatus').className='payment-status';
    $('#generateToken').disabled=true;
    startPaymentStatusPolling();
    toast(file&&utr?'Payment UTR + screenshot submit हो गए':(utr?'Payment UTR submit हो गया':'Payment screenshot submit हो गया'));
  }catch(e){toast(e.message)}
}
let paymentStatusPollTimer=null;
async function checkPaymentStatus(){let id=Number(localStorage.getItem('angelPaymentId')||0);const mobile=$('#cMobile').value.trim()||localStorage.getItem('angelCustomerMobile')||'';try{if(hasCustomerLogin()){const dash=await api('/api/customer/dashboard');const selectedService=$('#cService').value||localStorage.getItem('angelSelectedService')||'';const apps=Array.isArray(dash.applications)?dash.applications:[];const activeApps=apps.filter(a=>!['Completed','पूर्ण','Cancelled','रद्द','स्किप'].includes(String(a.status||'')));let app=(id?apps.find(a=>Array.isArray(dash.payments)&&dash.payments.some(p=>Number(p.id)===id&&Number(p.application_id)===Number(a.id))):null)||activeApps.find(a=>!selectedService||a.service===selectedService)||activeApps[0]||null;if(app){if(Number(app.id))localStorage.setItem('angelApplicationId',String(app.id));if(app.service&&(!selectedService||selectedService!==app.service)){const sel=$('#cService');if(sel&&[...sel.options].some(o=>o.value===app.service)){sel.value=app.service;localStorage.setItem('angelSelectedService',app.service);}}const candidates=(dash.payments||[]).filter(p=>Number(p.application_id)===Number(app.id)&&p.service===app.service).sort((a,b)=>Number(b.id||0)-Number(a.id||0));const linked=candidates[0]||null;if(linked){id=Number(linked.id);localStorage.setItem('angelPaymentId',String(linked.id));if(linked.token_id)localStorage.setItem('angelCurrentTokenId',String(linked.token_id));}}}if(!id){syncTokenGenerateDesign();stopPaymentStatusPolling();return null}const d=await api('/api/customer/payment/status?id='+encodeURIComponent(id)+'&mobile='+encodeURIComponent(mobile));const p=d.payment;if(p.status==='Verified'){$('#paymentStatus').textContent='✅ Payment verified by Admin. अब Live Token generate कर सकते हैं।';$('#paymentStatus').className='payment-status verified';if(p.token_id)localStorage.setItem('angelCurrentTokenId',String(p.token_id));syncTokenGenerateDesign();stopPaymentStatusPolling();return p}if(p.status==='Rejected'){$('#paymentStatus').textContent='❌ Payment rejected: '+(p.reject_reason||'Proof rejected');$('#paymentStatus').className='payment-status rejected';$('#generateToken').disabled=true;const gs=$('#generatedStatus');if(gs)gs.textContent='Payment rejected · Correction required';syncTokenGenerateDesign();stopPaymentStatusPolling();return p}$('#paymentStatus').textContent='⏳ Payment verification Admin के पास pending है।';$('#paymentStatus').className='payment-status';$('#generateToken').disabled=true;const gs=$('#generatedStatus');if(gs)gs.textContent='Payment verification pending';syncTokenGenerateDesign();startPaymentStatusPolling();return p}catch(e){$('#generateToken').disabled=true;return null}}
function stopPaymentStatusPolling(){if(paymentStatusPollTimer){clearInterval(paymentStatusPollTimer);paymentStatusPollTimer=null}}
function startPaymentStatusPolling(){if(paymentStatusPollTimer)return;paymentStatusPollTimer=setInterval(()=>checkPaymentStatus(),5000)}

async function generate(){const c=saveCustomer();if(!c)return;const selected=categoryServices(c.service.split(' — ')[0]||'').find(x=>x.name===c.service.split(' — ').slice(1).join(' — ')),wf=selected?.workflow||{};let applicationId=Number(localStorage.getItem('angelApplicationId')||0);if(wf.paymentRequired){const verifiedPayment=await checkPaymentStatus();const payment_id=Number(localStorage.getItem('angelPaymentId')||verifiedPayment?.id||0);if(!payment_id)return toast('पहले payment submit करें');if(verifiedPayment?.status!=='Verified')return toast('Payment अभी Admin द्वारा verify नहीं हुआ है।');if(verifiedPayment.token_id){localStorage.setItem('angelCurrentTokenId',String(verifiedPayment.token_id));syncTokenDocumentsGate(true);return toast('इस payment का Live Token पहले ही generate हो चुका है।');}const d=await api('/api/customer/tokens',{method:'POST',body:JSON.stringify({payment_id,name:c.name,mobile:c.mobile,service:c.service})});$('#generatedToken').textContent=d.token;$('#generatedService').textContent='सेवा: '+d.service;$('#generatedStatus').textContent='Payment Verified · Token Generated';localStorage.setItem('angelCurrentTokenId',String(d.id));syncTokenDocumentsGate(true);toast('Live Token '+d.token+' generate हो गया');await refreshAll();return;}if(!wf.tokenRequired)return toast('इस service के लिए Token लागू नहीं है।');if(!applicationId){const a=await api('/api/customer/application',{method:'POST',body:JSON.stringify({name:c.name,mobile:c.mobile,service:c.service,category:c.service.split(' — ')[0]||'',note:'Token request'})});applicationId=Number(a.id);localStorage.setItem('angelApplicationId',String(applicationId));localStorage.setItem('angelApplicationMeta',JSON.stringify({id:applicationId,name:c.name,mobile:c.mobile,service:c.service}));if(a.customer_token)localStorage.setItem('angelGuestSession',a.customer_token);}const d=await api('/api/customer/tokens',{method:'POST',body:JSON.stringify({application_id:applicationId,name:c.name,mobile:c.mobile,service:c.service})});$('#generatedToken').textContent=d.token;$('#generatedService').textContent='सेवा: '+d.service;$('#generatedStatus').textContent='Application Submitted · Token Generated';localStorage.setItem('angelCurrentTokenId',String(d.id));syncTokenDocumentsGate(true);toast('Live Token '+d.token+' generate हो गया');await refreshAll();}
function showRechargeTimeline(r,pay){const existing=document.getElementById('rechargeTimelineModal');if(existing)existing.remove();const esc=escapeHtml;const dt=v=>v?new Date(v).toLocaleString('hi-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';const events=[];if(r.created_at)events.push({status:'Recharge Request',at:r.created_at,reason:r.retry_of_recharge_id?`Retry attempt #${Number(r.attempt_no||2)} submitted`:'Recharge request submitted'});if(r.payment_verified_at)events.push({status:'Payment Verified',at:r.payment_verified_at,reason:'Admin ने payment verify किया'});(r.status_history||[]).forEach(h=>{if(!events.some(e=>e.status===h.status&&String(e.at)===String(h.at)))events.push(h)});events.sort((a,b)=>new Date(a.at||0)-new Date(b.at||0));const status=r.status==='Success'?'Completed':r.status==='Failed'?'Failed':'Pending';const retry=r.status==='Failed'&&r.retryable;const modal=document.createElement('div');modal.id='rechargeTimelineModal';modal.className='service-detail-modal';modal.setAttribute('aria-hidden','false');modal.innerHTML=`<div class="service-detail-backdrop"></div><div class="service-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="rechargeTimelineTitle"><button type="button" class="modal-close" aria-label="Close">×</button><div class="modal-eyebrow">RECHARGE LIFECYCLE</div><h2 id="rechargeTimelineTitle">${esc(r.operator||'Recharge')} · ₹${Number(r.amount||0).toFixed(2)}</h2><p class="muted">${esc(r.mobile||'')} · ${esc(r.type||'PREPAID')} · <b>${esc(status)}</b> · Attempt #${Number(r.attempt_no||1)}</p>${r.retry_of_recharge_id?`<p class="muted">Retry of failed recharge #${Number(r.retry_of_recharge_id)}</p>`:''}<div class="cr-timeline">${events.map(e=>`<div class="cr-timeline-item"><span class="cr-dot ${e.status==='Success'?'success':e.status==='Failed'||e.status==='Payment Rejected'?'failed':'blue'}"></span><div><b>${esc(e.status)}</b><span>${esc(e.reason||'')}</span><small>${dt(e.at)}</small></div></div>`).join('')||'<div class="muted">No lifecycle events.</div>'}</div>${r.failure_reason?`<div class="panel" style="margin-top:14px"><b>Failure reason</b><p>${esc(r.failure_reason)}</p></div>`:''}${r.provider_ref?`<div class="muted" style="margin-top:10px">Provider Ref: ${esc(r.provider_ref)}</div>`:''}${pay?.receipt_no?`<div class="panel" style="margin-top:14px"><b>Receipt</b><p>${esc(pay.receipt_no)} · ${dt(pay.receipt_generated_at||pay.completed_at)}</p></div>`:''}${retry?`<div class="actions" style="margin-top:16px"><button type="button" class="primary" id="rechargeRetryFromTimeline">Retry Recharge</button></div>`:''}</div>`;document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.modal-close')?.addEventListener('click',close);modal.querySelector('.service-detail-backdrop')?.addEventListener('click',close);modal.querySelector('#rechargeRetryFromTimeline')?.addEventListener('click',()=>{close();openRechargeRetry(r)})}
function openRechargeRetry(r){const existing=document.getElementById('rechargeRetryModal');if(existing)existing.remove();if(!r||r.status!=='Failed'||!r.retryable)return toast('Retry केवल Failed recharge के लिए उपलब्ध है।');const esc=escapeHtml;const modal=document.createElement('div');modal.id='rechargeRetryModal';modal.className='service-detail-modal';modal.setAttribute('aria-hidden','false');modal.innerHTML=`<div class="service-detail-backdrop"></div><div class="service-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="rechargeRetryTitle" aria-describedby="rechargeRetryHelp"><button type="button" class="modal-close" aria-label="Close retry dialog">×</button><div class="modal-eyebrow">RECHARGE CORRECTION</div><h2 id="rechargeRetryTitle">Retry ${esc(r.operator||'Recharge')} · ₹${Number(r.amount||0).toFixed(2)}</h2><p class="muted">Failed attempt #${Number(r.attempt_no||1)} · ${esc(r.mobile||'')} · ${esc(r.plan_name||'Recharge plan')}</p><div class="retry-source-card"><div><small>Previous attempt</small><b>#${Number(r.attempt_no||1)} · Failed</b></div><div><small>Failure reason</small><b>${esc(r.failure_reason||'Payment verification failed')}</b></div><div><small>Amount</small><b>₹${Number(r.amount||0).toFixed(2)}</b></div><div><small>Previous UTR</small><b>Not reused</b></div></div><form id="rechargeRetryForm" novalidate><label for="rechargeRetryUtr">New UTR / Transaction Reference <small>(Optional)</small><input id="rechargeRetryUtr" name="utr" type="text" minlength="6" maxlength="40" inputmode="text" autocomplete="off" placeholder="Enter new transaction reference"></label><label for="rechargeRetryScreenshot">New Payment Screenshot <small>(Optional)</small><input id="rechargeRetryScreenshot" name="screenshot" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="rechargeRetryHelp" class="retry-help">नया payment proof दें। पुराने failed attempt का UTR या screenshot reuse नहीं होगा। PNG/JPG/WEBP, अधिकतम 5MB.</p><p id="rechargeRetryStatus" class="retry-inline-status" role="status" aria-live="polite"></p><div class="actions"><button type="submit" class="primary" id="rechargeRetrySubmit">Submit New Payment Proof</button><button type="button" class="secondary" id="rechargeRetryCancel">Cancel</button></div></form></div>`;document.body.appendChild(modal);const dialog=modal.querySelector('.service-detail-dialog');const utrInput=modal.querySelector('#rechargeRetryUtr');const fileInput=modal.querySelector('#rechargeRetryScreenshot');const statusBox=modal.querySelector('#rechargeRetryStatus');const btn=modal.querySelector('#rechargeRetrySubmit');const previousActive=document.activeElement;const focusables=()=>[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(el=>el.offsetParent!==null);const setInvalid=(el,invalid)=>{if(!el)return;el.setAttribute('aria-invalid',invalid?'true':'false')};const setStatus=(msg,error=false)=>{statusBox.textContent=msg||'';statusBox.className='retry-inline-status'+(msg?(error?' error':' success'):'');statusBox.setAttribute('aria-invalid',error?'true':'false');statusBox.setAttribute('role',error?'alert':'status')};const lockBody=()=>{document.documentElement.classList.add('modal-open');document.body.dataset.rechargeRetryOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden'};const unlockBody=()=>{document.documentElement.classList.remove('modal-open');document.body.style.overflow=document.body.dataset.rechargeRetryOverflow||'';delete document.body.dataset.rechargeRetryOverflow};const close=()=>{unlockBody();modal.remove();document.removeEventListener('keydown',onKey);previousActive?.focus?.()};const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){const els=focusables();if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};modal.querySelector('.modal-close')?.addEventListener('click',close);modal.querySelector('.service-detail-backdrop')?.addEventListener('click',close);modal.querySelector('#rechargeRetryCancel')?.addEventListener('click',close);document.addEventListener('keydown',onKey);lockBody();setTimeout(()=>utrInput?.focus(),0);modal.querySelector('#rechargeRetryForm')?.addEventListener('submit',async e=>{e.preventDefault();setStatus('');setInvalid(utrInput,false);setInvalid(fileInput,false);const utr=String(utrInput?.value||'').trim();const file=fileInput?.files?.[0];if(utr&&(utr.length<6||utr.length>40)){setInvalid(utrInput,true);setStatus('Valid नया UTR दर्ज करें (6–40 characters)।',true);utrInput?.focus();return}if(!utr&&!file){setInvalid(utrInput,true);setInvalid(fileInput,true);setStatus('UTR या payment screenshot में से कम-से-कम एक दें।',true);utrInput?.focus();return}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setInvalid(fileInput,true);setStatus('केवल PNG/JPG/WEBP screenshot दें।',true);fileInput.value='';fileInput?.focus();return}if(file&&file.size>5*1024*1024){setInvalid(fileInput,true);setStatus('Screenshot 5MB से छोटा रखें।',true);fileInput.value='';fileInput?.focus();return}btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent='Submitting…';setStatus('Payment proof submit हो रहा है…');try{const screenshot=file?await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>reject(new Error('Screenshot read failed'));fr.readAsDataURL(file)}):null;const key=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():('retry-'+Date.now()+'-'+Math.random().toString(36).slice(2));const d=await api('/api/customer/recharge/retry',{method:'POST',body:JSON.stringify({recharge_id:Number(r.id),utr,screenshot,idempotency_key:key})});toast(d.message||'Retry submitted.');close();await loadRecords({silent:true})}catch(err){const msg=err.message||'Retry submit नहीं हो पाया।';setStatus(msg,true);toast(msg);btn.disabled=false;btn.removeAttribute('aria-busy');btn.textContent='Submit New Payment Proof'}})}

function renderRechargeReceiptPreview(d){
  const panel=$('#rechargeReceiptPanel'), content=$('#rechargeReceiptContent'), actions=$('#rechargeReceiptActions');
  if(!panel||!content||!actions)return;
  const rows=Array.isArray(d?.recharges)?d.recharges.slice().sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0)):[];
  const paymentRows=Array.isArray(d?.payments)?d.payments:[];
  const success=rows.find(r=>{
    const pay=paymentRows.find(p=>Number(p.id)===Number(r.payment_id));
    return r.status==='Success'&&r.receipt_no&&r.payment_id&&pay?.status==='Verified';
  });
  const latest=rows[0]||null;
  const esc=escapeHtml, money=v=>`₹${Number(v||0).toFixed(2)}`;
  const dt=v=>v?new Date(v).toLocaleString('hi-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  if(!success){
    const state=latest?.status==='Pending'?'⏳ Recharge payment verification pending है।':latest?.status==='Failed'?'❌ Latest recharge failed.':'Recharge successful होने के बाद receipt यहाँ automatic दिखाई देगी।';
    content.innerHTML=`<b>⭐ ANGELSTORE CSC</b><strong>मोबाइल रिचार्ज रसीद</strong><p>${esc(state)}</p><div class="receipt-thanks">Payment Verify → Recharge Success → Automatic Receipt</div>`;
    actions.innerHTML='<button type="button" class="primary" id="rechargeReceiptRecordsPanel">🧾 Receipt & Records</button>';
    $('#rechargeReceiptRecordsPanel')?.addEventListener('click',()=>go('customer-receipts'));
    return;
  }
  const payment=(d?.payments||[]).find(p=>Number(p.id)===Number(success.payment_id))||{};
  const customer=d?.customer||{};
  content.innerHTML=`<div class="recharge-receipt-success"><div class="receipt-success-badge">✓ SUCCESS</div><b>⭐ ANGELSTORE CSC</b><strong>मोबाइल रिचार्ज रसीद</strong><div class="recharge-receipt-grid"><span>रसीद संख्या</span><b>${esc(success.receipt_no)}</b><span>तारीख</span><b>${esc(dt(success.completed_at||payment.completed_at||success.updated_at))}</b><span>ग्राहक नाम</span><b>${esc(customer.name||payment.name||'—')}</b><span>मोबाइल नंबर</span><b>${esc(success.mobile||payment.mobile||'—')}</b><span>ऑपरेटर</span><b>${esc(success.operator||'—')}</b><span>सर्किल</span><b>${esc(success.circle||'—')}</b><span>प्लान</span><b>${esc(success.plan_name||success.plan_id||'—')}</b><span>राशि</span><b>${money(success.amount)}</b><span>भुगतान UTR</span><b>${esc(success.utr||payment.utr||'—')}</b><span>रिचार्ज Reference</span><b>${esc(success.provider_ref||'—')}</b><span>स्थिति</span><b>सफल</b><span>Processed By</span><b>Admin</b></div></div>`;
  actions.innerHTML=`<button type="button" class="primary" id="rechargeReceiptPdfBtn">⬇ PDF डाउनलोड</button><button type="button" class="secondary" id="rechargeReceiptPrintBtn">🖨️ प्रिंट करें</button><button type="button" class="secondary" id="rechargeReceiptViewBtn">👁️ देखें</button>`;
  $('#rechargeReceiptPdfBtn')?.addEventListener('click',()=>downloadReceiptPdf(Number(success.payment_id)));
  $('#rechargeReceiptPrintBtn')?.addEventListener('click',()=>printReceipt(Number(success.payment_id),d));
  $('#rechargeReceiptViewBtn')?.addEventListener('click',()=>openReceiptView(Number(success.payment_id),d));
}
function renderCustomerRecords(d){
  const tokens=d?.tokens||[], payments=d?.payments||[], receipts=d?.receipts||[], recharges=d?.recharges||[], apps=d?.applications||[], appts=d?.appointments||[];
  lastRecords={...lastRecords,...d,applications:apps,appointments:appts};
  renderRechargeReceiptPreview(d);
  const sortedTokens=tokens.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const sortedReceipts=receipts.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const sortedRecharges=recharges.slice().sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
  const money=v=>`₹${Number(v||0).toFixed(2)}`;
  const dt=v=>v?new Date(v).toLocaleString('hi-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  const dateOnly=v=>v?new Date(v).toLocaleDateString('hi-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
  const customerName=sortedTokens[0]?.name||payments[0]?.name||'CUSTOMER';
  const customerMobile=sortedTokens[0]?.mobile||payments[0]?.mobile||localStorage.getItem('angelCustomerMobile')||'—';
  const set=(id,v)=>{const el=$('#'+id);if(el)el.textContent=v};
  set('recordsCustomerName',customerName);set('recordsCustomerMobile',customerMobile);set('recordsMemberSince',dateOnly(sortedTokens.slice().sort((a,b)=>Number(a.id||0)-Number(b.id||0))[0]?.created_at||payments.slice().sort((a,b)=>Number(a.id||0)-Number(b.id||0))[0]?.created_at));
  set('recordsTotalTokens',tokens.length);set('recordsVerifiedPayments',payments.filter(p=>p.status==='Verified').length);set('recordsReceiptCount',sortedReceipts.length);set('recordsCompletedServices',new Set([...tokens.filter(t=>['पूर्ण','Completed'].includes(String(t.status||''))).map(t=>String(t.service||'')),...sortedReceipts.map(p=>String(p.service||''))].filter(Boolean)).size);
  const serviceSel=$('#recordsServiceFilter');
  if(serviceSel){const current=serviceSel.value;const services=[...new Set([...tokens.map(t=>t.service),...sortedReceipts.map(p=>p.service),...sortedRecharges.map(r=>'Mobile Recharge')].filter(Boolean))].sort();serviceSel.innerHTML='<option value="">सभी सेवाएँ</option>'+services.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');if(services.includes(current))serviceSel.value=current;}
  const ht=$('#historyTable'); if(ht) ht.innerHTML=tokens.length?sortedTokens.map(x=>`<tr><td><b>${escapeHtml(x.token||'—')}</b></td><td>${escapeHtml(x.service||'—')}</td><td>${dt(x.created_at)}</td><td>${escapeHtml(x.status||'—')}</td></tr>`).join(''):'<tr><td colspan="4">अभी कोई token नहीं है।</td></tr>';
  const applyFilters=()=>{
    const token=($('#recordsTokenFilter')?.value||'').trim().toLowerCase(), mobile=($('#recordsMobileFilter')?.value||'').trim(), service=$('#recordsServiceFilter')?.value||'', from=$('#recordsDateFrom')?.value||'', to=$('#recordsDateTo')?.value||'', status=$('#recordsStatusFilter')?.value||'';
    const filtered=sortedTokens.filter(x=>{
      const text=String(x.token||'').toLowerCase(); if(token&&!text.includes(token))return false;
      if(mobile&&!String(x.mobile||customerMobile).includes(mobile))return false;
      if(service&&String(x.service||'')!==service)return false;
      if(status&&String(x.status||'')!==status)return false;
      const raw=x.created_at?new Date(x.created_at):null;
      if(from&&(!raw||raw<new Date(from+'T00:00:00')))return false;
      if(to&&(!raw||raw>new Date(to+'T23:59:59')))return false;
      return true;
    });
    const tokenPaymentIds=new Set(sortedTokens.map(x=>Number(x.payment_id)).filter(Boolean));
    const filteredReceipts=sortedReceipts.filter(p=>{
      if(tokenPaymentIds.has(Number(p.id)))return false;
      const text=(String(p.receipt_no||'')+' '+String(p.service||'')).toLowerCase(); if(token&&!text.includes(token))return false;
      if(mobile&&!String(p.mobile||customerMobile).includes(mobile))return false;
      if(service&&String(p.service||'')!==service)return false;
      if(status&&!['पूर्ण','Completed'].includes(status))return false;
      const raw=p.completed_at||p.verified_at||p.created_at?new Date(p.completed_at||p.verified_at||p.created_at):null;
      if(from&&(!raw||raw<new Date(from+'T00:00:00')))return false;
      if(to&&(!raw||raw>new Date(to+'T23:59:59')))return false;
      return true;
    });
    const rechargeRows=sortedRecharges.filter(r=>{const st=String(r.status||'');if(service&&service!=='Mobile Recharge')return false;if(status&&status!==st&&!((status==='Completed')&&st==='Success'))return false;const raw=r.updated_at||r.created_at;if(from&&new Date(raw)<new Date(from+'T00:00:00'))return false;if(to&&new Date(raw)>new Date(to+'T23:59:59'))return false;return true;});
    const rt=$('#recordsTable');
    if(rt)rt.innerHTML=(filtered.length||filteredReceipts.length||rechargeRows.length)?[...filtered.map((x,i)=>{const pay=payments.find(p=>Number(p.id)===Number(x.payment_id));const receipt=pay?.receipt_no||'';const done=['पूर्ण','Completed'].includes(String(x.status||''));return `<tr><td>${i+1}</td><td><b>${escapeHtml(x.token||'—')}</b></td><td>${escapeHtml(x.service||'—')}</td><td>${pay?money(pay.amount):'—'}</td><td>${dateOnly(x.created_at)}</td><td><span class="cr-status ${done?'success':''}">${escapeHtml(x.status||'—')}</span></td><td>${escapeHtml(receipt||'—')}</td><td>${receipt?`<div class="cr-table-actions"><button type="button" class="receipt-action receipt-view" data-id="${pay.id}">View</button><button type="button" class="receipt-action receipt-print" data-id="${pay.id}">Print</button><button type="button" class="receipt-action receipt-pdf" data-id="${pay.id}">PDF</button></div>`:'—'}</td></tr>`}),...filteredReceipts.map((p,i)=>`<tr><td>${filtered.length+i+1}</td><td><b>—</b></td><td>${escapeHtml(p.service||'—')}</td><td>${money(p.amount)}</td><td>${dateOnly(p.completed_at||p.verified_at||p.created_at)}</td><td><span class="cr-status success">Completed</span></td><td>${escapeHtml(p.receipt_no||'—')}</td><td><div class="cr-table-actions"><button type="button" class="receipt-action receipt-view" data-id="${p.id}">View</button><button type="button" class="receipt-action receipt-print" data-id="${p.id}">Print</button><button type="button" class="receipt-action receipt-pdf" data-id="${p.id}">PDF</button></div></td></tr>`),...rechargeRows.map((r,i)=>{const n=filtered.length+filteredReceipts.length+i+1;const success=r.status==='Success';const failed=r.status==='Failed';const payment=payments.find(p=>Number(p.id)===Number(r.payment_id));const receipt=success?payment?.receipt_no||'':'';const label=success?'Completed':failed?'Failed':'Pending';const statusClass=success?'success':failed?'failed':'pending';const detail=[r.plan_name||r.plan_id||'Recharge',r.provider_ref?`Ref ${r.provider_ref}`:'',r.payment_id?`Payment #${r.payment_id}`:'',`Attempt #${Number(r.attempt_no||1)}`,r.retry_of_recharge_id?`Retry of #${r.retry_of_recharge_id}`:''].filter(Boolean).join(' · ');return `<tr><td>${n}</td><td><b>—</b></td><td>Mobile Recharge · ${escapeHtml(r.operator||'—')}<br><small>${escapeHtml(detail)}</small></td><td>${money(r.amount)}</td><td>${dateOnly(r.updated_at||r.created_at)}</td><td><span class="cr-status ${statusClass}">${label}</span></td><td>${escapeHtml(receipt||'—')}</td><td><div class="cr-table-actions">${receipt?`<button type="button" class="receipt-action receipt-view" data-id="${payment.id}">View</button><button type="button" class="receipt-action receipt-print" data-id="${payment.id}">Print</button><button type="button" class="receipt-action receipt-pdf" data-id="${payment.id}">PDF</button>`:''}${failed?`<button type="button" class="receipt-action recharge-retry" data-recharge-id="${r.id}">Retry</button>`:''}<button type="button" class="receipt-action recharge-detail" data-recharge-id="${r.id}">Details</button></div></td></tr>`})].join(''):'<tr><td colspan="8" class="cr-empty-cell">दिए गए filter के अनुसार कोई record नहीं मिला।</td></tr>';
  };
  const rt=$('#recordsTable'); if(rt){applyFilters();}
  ['recordsTokenFilter','recordsMobileFilter','recordsServiceFilter','recordsDateFrom','recordsDateTo','recordsStatusFilter'].forEach(id=>{$('#'+id)?.addEventListener('input',applyFilters);$('#'+id)?.addEventListener('change',applyFilters)});
  $('#recordsSearchButton')?.addEventListener('click',applyFilters);
  const rl=$('#receiptList'); if(rl) rl.innerHTML=sortedReceipts.length?sortedReceipts.map(p=>`<div class="cr-receipt-item"><div><b>🧾 ${escapeHtml(p.receipt_no||'Receipt')}</b><span>${money(p.amount)} · ${escapeHtml(p.service||'Service')} · Completed · ${dt(p.verified_at||p.created_at)}</span></div><div class="cr-receipt-actions"><button type="button" class="receipt-action receipt-view" data-id="${p.id}">View</button><button type="button" class="receipt-action receipt-print" data-id="${p.id}">Print</button><button type="button" class="receipt-action receipt-pdf" data-id="${p.id}">PDF</button></div></div>`).join(''):'<div class="muted">अभी कोई completed service receipt नहीं है।</div>';
  const timeline=$('#receiptHistoryTimeline');
  if(timeline){const events=[];sortedTokens.slice(0,8).forEach(t=>events.push({time:t.created_at,title:t.status==='पूर्ण'?'सेवा पूर्ण':t.status==='बुलाया'?'टोकन बुलाया':'टोकन जनरेट',service:t.service,cls:t.status==='पूर्ण'?'':'blue'}));payments.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,8).forEach(p=>events.push({time:p.verified_at||p.created_at,title:p.status==='Verified'?'भुगतान सफल':'भुगतान अपडेट',service:p.service,cls:p.status==='Verified'?'':'orange'}));events.sort((a,b)=>new Date(b.time||0)-new Date(a.time||0));timeline.innerHTML=events.slice(0,6).map(e=>`<div class="cr-timeline-item"><span class="cr-dot ${e.cls||''}"></span><div><b>${escapeHtml(e.title)}</b><span>${escapeHtml(e.service||'Service')}</span><small>${dt(e.time)}</small></div></div>`).join('')||'<div class="cr-empty-timeline">अभी कोई activity नहीं है।</div>'}
  document.querySelectorAll('.receipt-pdf').forEach(b=>b.onclick=()=>downloadReceiptPdf(Number(b.dataset.id)));
  document.querySelectorAll('.receipt-view').forEach(b=>b.onclick=()=>openReceiptView(Number(b.dataset.id), lastRecords));
  document.querySelectorAll('.receipt-print').forEach(b=>b.onclick=()=>printReceipt(Number(b.dataset.id), lastRecords));
  document.querySelectorAll('.application-view').forEach(b=>b.onclick=()=>showApplication(Number(b.dataset.id),lastRecords));
  document.querySelectorAll('.recharge-retry').forEach(b=>b.onclick=()=>{const r=sortedRecharges.find(x=>Number(x.id)===Number(b.dataset.rechargeId));if(!r||r.status!=='Failed')return toast('Retry केवल Failed recharge के लिए है');openRechargeRetry(r)});
  document.querySelectorAll('.recharge-detail').forEach(b=>b.onclick=()=>{const r=sortedRecharges.find(x=>Number(x.id)===Number(b.dataset.rechargeId));if(!r)return toast('Recharge record नहीं मिला');const pay=payments.find(x=>Number(x.id)===Number(r.payment_id));showRechargeTimeline(r,pay)});
  $('#recordsViewAllHistory')?.addEventListener('click',()=>go('customer-history'));
}

async function downloadReceiptPdf(id){
  try{
    if(!hasCustomerLogin())return openCustomerLogin('Receipt download के लिए Customer Login जरूरी है।');
    const r=await fetch(backendUrl.replace(/\/$/,'')+'/api/customer/receipts/'+encodeURIComponent(id)+'.pdf',{headers:{},credentials:'include'});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Receipt PDF download failed');}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='angelstore-receipt-'+id+'.pdf';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);toast('🧾 Receipt PDF download हो गई');
  }catch(e){toast(e.message)}
}
function receiptRecord(id,d){
  const pay=(d?.payments||[]).find(x=>Number(x.id)===Number(id));
  if(!pay||!pay.receipt_no)return null;
  const tok=(d?.tokens||[]).find(x=>Number(x.id)===Number(pay.token_id)||Number(x.payment_id)===Number(pay.id))||null;
  const app=(d?.applications||[]).find(x=>Number(x.id)===Number(pay.application_id)||Number(x.id)===Number(tok?.application_id))||null;
  return {pay,tok,app};
}
function receiptHtml(r){
  const esc=escapeHtml,p=r.pay,t=r.tok,a=r.app;
  const applicationId=a?.application_id||t?.application_id||p.application_id||'—';
  const token=t?.token||'—';
  const completed=p.completed_at||t?.completed_at||p.verified_at||p.created_at||'—';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.receipt_no)} · AngelStore CSC</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef5fb;font-family:Arial,Helvetica,sans-serif;color:#183b60}.receipt{max-width:720px;margin:30px auto;background:#fff;border:1px solid #d8e5f0;border-radius:18px;box-shadow:0 10px 30px rgba(25,70,110,.10);overflow:hidden}.head{padding:24px;background:linear-gradient(135deg,#0878e8,#0bb2d4);color:#fff}.head h1{margin:0;font-size:24px}.head p{margin:6px 0 0;opacity:.92}.body{padding:24px}.row{display:grid;grid-template-columns:190px 1fr;gap:14px;padding:11px 0;border-bottom:1px solid #edf2f6}.row:last-child{border-bottom:0}.label{color:#7890a5}.value{font-weight:700;color:#173e67}.total{margin-top:14px;padding:16px;border-radius:12px;background:#f3f9ff;display:flex;justify-content:space-between;font-size:18px}.actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 24px 24px}.actions button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}.primary{background:#0878e8;color:#fff}.secondary{background:#edf6ff;color:#0878e8}.muted{color:#7c90a4;font-size:12px}.print-note{font-size:12px;color:#617d96;padding:0 24px 18px}.receipt.thermal{width:58mm;max-width:58mm;margin:0;border:0;border-radius:0;box-shadow:none;font-family:Arial,Helvetica,sans-serif;color:#000}.thermal .head{padding:4mm 2mm;background:#fff!important;color:#000!important;text-align:center;border-bottom:1px dashed #000}.thermal .head h1{font-size:12pt;letter-spacing:.2px}.thermal .head p{font-size:8pt}.thermal .body{padding:3mm 2mm}.thermal .row{display:grid;grid-template-columns:1fr;gap:1mm;padding:2mm 0;border-bottom:1px dashed #aaa;font-size:8.5pt;overflow-wrap:anywhere}.thermal .label{color:#333;font-size:7.5pt}.thermal .value{color:#000;font-weight:700}.thermal .total{margin-top:3mm;padding:2mm 0;border-top:1px solid #000;border-radius:0;background:#fff!important;color:#000;font-size:10pt}.thermal .muted{font-size:7pt;color:#333}.thermal .body p{line-height:1.3}.a4 .receipt{max-width:720px}.thermal-mode .receipt{width:58mm;max-width:58mm}@page{size:A4;margin:12mm}@page thermalPage{size:58mm auto;margin:2mm}@media print{body{background:#fff}.receipt{margin:0;box-shadow:none;border:0;max-width:none;border-radius:0}.actions,.print-note{display:none}.head{background:#fff;color:#173e67;border-bottom:2px solid #173e67}.thermal-mode{width:58mm}.thermal-mode .receipt{width:54mm;max-width:54mm}.thermal-mode .head{border-bottom:1px dashed #000}.thermal-mode .body{padding:2mm 0}.thermal-mode .row{grid-template-columns:1fr}.thermal-mode .label,.thermal-mode .value{color:#000}.thermal-mode .total{background:#fff;color:#000}@page{margin:12mm}.thermal-mode{@page{size:58mm auto;margin:2mm}}}
  </style></head><body><article class="receipt"><header class="head"><h1>ANGELSTORE CSC</h1><p>Service Completion Receipt</p></header><section class="body">
  <div class="row"><span class="label">Receipt No.</span><span class="value">${esc(p.receipt_no)}</span></div>
  <div class="row"><span class="label">Application ID</span><span class="value">${esc(applicationId)}</span></div>
  <div class="row"><span class="label">Token No.</span><span class="value">${esc(token)}</span></div>
  <div class="row"><span class="label">Customer</span><span class="value">${esc(p.name||t?.name||'—')}</span></div>
  <div class="row"><span class="label">Mobile</span><span class="value">${esc(p.mobile||t?.mobile||'—')}</span></div>
  <div class="row"><span class="label">Service</span><span class="value">${esc(p.service||t?.service||'—')}</span></div>
  <div class="row"><span class="label">Payment Status</span><span class="value">${esc(p.status||'Verified')}</span></div>
  <div class="row"><span class="label">Payment Method</span><span class="value">${esc(p.method||'—')}</span></div>
  <div class="row"><span class="label">UTR / Reference</span><span class="value">${esc(p.utr||'—')}</span></div>
  <div class="row"><span class="label">Completed At</span><span class="value">${esc(completed)}</span></div>
  <div class="row"><span class="label">Processed By</span><span class="value">${String(p.service||'').toLowerCase().includes('recharge')?'Admin':esc(p.completed_by||'—')}</span></div>
  <div class="row"><span class="label">Service Status</span><span class="value">Completed</span></div>
  <div class="total"><b>Total Amount</b><b>₹${Number(p.amount||0).toFixed(2)}</b></div><p class="muted">यह receipt completed service और verified payment record से तैयार की गई है।</p>
  </section><p class="print-note">प्रिंट करने से पहले अपना पेपर साइज़ चुनें। Thermal प्रिंटर में Paper Width 58 mm सेट करें।</p><div class="actions"><button class="primary" onclick="setReceiptPrintSize('thermal')">🧾 Print 58 mm Thermal</button><button class="primary" onclick="setReceiptPrintSize('a4')">📄 Print A4</button><button class="secondary" onclick="window.print()">Print / Save PDF</button><button class="secondary" onclick="window.close()">Close</button></div><script>function setReceiptPrintSize(size){document.body.classList.remove('thermal-mode','a4-mode');document.querySelector('.receipt')?.classList.remove('thermal','a4');let page=document.getElementById('receiptDynamicPage');if(!page){page=document.createElement('style');page.id='receiptDynamicPage';document.head.appendChild(page);}if(size==='thermal'){document.body.classList.add('thermal-mode');document.querySelector('.receipt')?.classList.add('thermal');document.title='58mm Receipt';page.textContent='@page { size: 58mm auto; margin: 2mm; }';}else{document.body.classList.add('a4-mode');document.querySelector('.receipt')?.classList.add('a4');document.title='A4 Receipt';page.textContent='@page { size: A4 portrait; margin: 12mm; }';}setTimeout(()=>window.print(),150);}</script></article></body></html>`;
}
function openReceiptView(id,d){
  const r=receiptRecord(id,d);if(!r)return toast('Receipt record नहीं मिला');
  const w=window.open('','_blank','width=820,height=900');if(!w)return toast('Popup blocked');
  w.document.open();w.document.write(receiptHtml(r));w.document.close();
}
function printReceipt(id,d){
  const r=receiptRecord(id,d);if(!r)return toast('Receipt record नहीं मिला');
  const w=window.open('','_blank','width=820,height=900');if(!w)return toast('Popup blocked');
  w.document.open();w.document.write(receiptHtml(r));w.document.close();
  // Let the customer choose 58 mm Thermal or A4 in the receipt window before printing.
}

async function showApplication(id,d){const a=(d.applications||[]).find(x=>Number(x.id)===id);if(!a)return toast('Application नहीं मिला');let detail=null;try{detail=(await api('/api/customer/application?id='+encodeURIComponent(id))).application}catch{}const docs=(await api('/api/customer/documents?application_id='+encodeURIComponent(id)).catch(()=>({documents:[]}))).documents||[];const w=window.open('','_blank','width=720,height=640');if(!w)return toast('Popup blocked');const docsHtml=docs.length?docs.map(x=>`<li>${escapeHtml(x.name)} — ${escapeHtml(x.ocr_status||'not_run')}</li>`).join(''):'<li>No documents</li>';w.document.write(`<html><head><meta charset="utf-8"><title>Application ${escapeHtml(a.application_id)}</title></head><body style="font-family:Arial;padding:30px"><h2>Application ${escapeHtml(a.application_id)}</h2><p><b>Service:</b> ${escapeHtml(detail?.service||a.service)}</p><p><b>Status:</b> ${escapeHtml(detail?.status||a.status)}</p><p><b>Created:</b> ${escapeHtml(detail?.created_at||a.created_at||'—')}</p><p><b>Address:</b> ${escapeHtml(detail?.address||a.address||'—')}</p><h3>Documents</h3><ul>${docsHtml}</ul><button onclick="window.print()">Print</button></body></html>`);w.document.close()}
async function loadHistory(){if(!hasCustomerLogin())return openCustomerLogin('Token History देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/records');renderCustomerRecords(d);refreshAll();toast('Token History refresh हो गया')}catch(e){toast(e.message)}}
async function loadRecords(options={}){if(!hasCustomerLogin())return openCustomerLogin('Receipt & Records देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/records');renderCustomerRecords(d);if(!options.silent)toast('Records refresh हो गए')}catch(e){if(!options.silent)toast(e.message)}}
async function loadApplications(){if(!hasCustomerLogin())return openCustomerLogin('Applications देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/applications');lastRecords.applications=d.applications||[];renderCustomerRecords({...lastRecords,applications:lastRecords.applications});toast('Applications refresh हो गए')}catch(e){toast(e.message)}}
function populateHomeServiceSelect(){const sel=$('#homeServiceSelect');if(!sel)return;const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service चुनें</option>'+opts.join('');}
async function loadHomeServices(){if(!hasCustomerLogin())return openCustomerLogin('Home Service request के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/home-services');const rows=d.home_services||[];$('#homeServiceList').innerHTML=rows.length?rows.map(x=>`<div class="panel" style="margin-bottom:10px"><b>${escapeHtml(x.service||'Service')}</b><div class="muted">${escapeHtml(x.address||'—')}</div><small>${escapeHtml(x.preferred_date||'Date not set')} · ${escapeHtml(x.preferred_time||'Time not set')} · ${escapeHtml(x.status||'Requested')}</small></div>`).join(''):'<div class="muted">अभी कोई request नहीं है।</div>';}catch(e){toast(e.message)}}
async function submitHomeService(){if(!hasCustomerLogin())return openCustomerLogin('Home Service request के लिए Customer Login जरूरी है।');const service=$('#homeServiceSelect').value.trim(),address=$('#homeServiceAddress').value.trim(),date=$('#homeServiceDate').value,time=$('#homeServiceTime').value;if(!service||!address)return toast('Service और पूरा address जरूरी है');try{const d=await api('/api/customer/home-services',{method:'POST',body:JSON.stringify({service,address,preferred_date:date,preferred_time:time})});$('#homeServiceStatus').textContent='✅ Request '+(d.home_service_id||'submitted')+' successfully';$('#homeServiceAddress').value='';$('#homeServiceDate').value='';$('#homeServiceTime').value='';await loadHomeServices();toast('Home Service request भेज दी गई');}catch(e){toast(e.message)}}
populateHomeServiceSelect();
async function loadAppointments(){if(!hasCustomerLogin())return openCustomerLogin('Appointments देखने के लिए Customer Login जरूरी है।');try{const d=await api('/api/customer/appointments');lastRecords.appointments=d.appointments||[];renderCustomerRecords({...lastRecords,appointments:lastRecords.appointments});toast('Appointments refresh हो गए')}catch(e){toast(e.message)}}

function populateAppointmentService(){const sel=$('#appointmentService');if(!sel)return;const opts=[];Object.entries(SERVICE_INFO||{}).forEach(([cat,info])=>(info.services||[]).forEach(sub=>{const value=cat+' — '+sub.name;opts.push(`<option value="${escapeHtml(value)}">${escapeHtml(cat)} → ${escapeHtml(sub.name)}</option>`)}));sel.innerHTML='<option value="">Service चुनें</option>'+opts.join('');}
function setMinDates(){const now=new Date(),iso=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);['appointmentDate','homeServiceDate'].forEach(id=>{const el=$('#'+id);if(el)el.min=iso});const date=$('#appointmentDate'),time=$('#appointmentTime');if(date&&time){const sync=()=>{const todayIso=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);if(date.value===todayIso){const min=new Date(Date.now()+60000);time.min=new Date(min.getTime()-min.getTimezoneOffset()*60000).toISOString().slice(11,16)}else time.min='00:00';if(date.value&&time.value&&date.value===todayIso&&time.value<time.min)time.value=time.min};date.addEventListener('change',sync);time.addEventListener('change',sync);sync();}}
async function submitAppointment(){if(!hasCustomerLogin())return openCustomerLogin('Appointment book करने के लिए Customer Login जरूरी है।');const service=$('#appointmentService').value.trim(),date=$('#appointmentDate').value,time=$('#appointmentTime').value;if(!service||!date||!time)return toast('Service, date और time जरूरी हैं');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return toast('Valid date और time चुनें');const selected=new Date(date+'T'+time);if(Number.isNaN(selected.getTime())||selected<new Date(Date.now()+60000))return toast('Past या immediate appointment time allowed नहीं है');try{const d=await api('/api/customer/appointments',{method:'POST',body:JSON.stringify({service,date,time})});$('#appointmentStatus').textContent='✅ '+(d.appointment_id||'Appointment')+' request भेज दी गई';$('#appointmentForm').reset();setMinDates();await loadAppointments();toast('Appointment request भेज दी गई')}catch(e){toast(e.message)}}
async function loadDocuments(){
  if(!hasCustomerLogin())return openCustomerLogin('Documents देखने के लिए Customer Login जरूरी है।');
  try{
    let apps=Array.isArray(lastRecords.applications)?lastRecords.applications:[];
    if(!apps.length){const ad=await api('/api/customer/applications');apps=ad.applications||[];lastRecords.applications=apps;}
    const sorted=apps.slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0));
    const active=sorted.find(a=>!['Token Generated','पूर्ण','रद्द','स्किप'].includes(String(a.status||'')))||sorted[0]||null;
    const sel=$('#documentApplication');
    if(sel){
      sel.innerHTML=sorted.length?sorted.map(a=>`<option value="${a.id}">${escapeHtml(a.application_id)} — ${escapeHtml(a.service)}${a.id===active?.id?' (Current)':''}</option>`).join(''):'<option value="">कोई application नहीं</option>';
      if(active)sel.value=String(active.id);
      sel.onchange=()=>loadDocumentApplication(Number(sel.value||0));
    }
    if(active)await loadDocumentApplication(Number(active.id));
    else renderDocumentApplication(null,[],null);
  }catch(e){toast(e.message)}
}
async function loadDocumentApplication(applicationId){
  if(!applicationId)return renderDocumentApplication(null,[],null);
  try{
    const app=(lastRecords.applications||[]).find(a=>Number(a.id)===Number(applicationId));
    const [docsData,progressData]=await Promise.all([
      api('/api/customer/documents?application_id='+encodeURIComponent(applicationId)),
      api('/api/customer/progress?application_id='+encodeURIComponent(applicationId))
    ]);
    renderDocumentApplication(app,docsData.documents||[],progressData.progress||null);
  }catch(e){toast(e.message)}
}
function renderDocumentApplication(app,rows,p){
  const pct=Math.max(0,Math.min(100,Number(p?.percent||0)));
  const pctEl=$('#documentProgressPercent');if(pctEl)pctEl.textContent=pct+'%';
  const fill=$('#documentProgressFill');if(fill)fill.style.width=pct+'%';
  const aid=$('#documentProgressApplication');if(aid)aid.textContent=app?.application_id?('Application '+app.application_id):'Application —';
  const st=$('#documentProgressStatus');if(st)st.textContent=app?.status||p?.application?.status||'Status —';
  const summary=$('#documentProgressSummary');if(summary)summary.textContent=p?`Required documents: ${(p.required_documents||[]).length} · Uploaded: ${rows.length}`:'Application के required documents की live स्थिति';
  const typeSel=$('#customerDocumentType');if(typeSel){const req=p?.required_documents||[];typeSel.innerHTML='<option value="">Document type चुनें</option>'+req.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');if(req.length===1)typeSel.value=req[0];}
  const box=$('#documentProgressSteps');
  if(box){
    const items=Array.isArray(p?.items)?p.items.filter(x=>x.id==='documents'):[];
    const required=p?.required_documents||[];
    const docItem=items[0];
    const parts=[];
    if(docItem){parts.push(`<div class="progress-step ${docItem.done?'done':'pending'}"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">${docItem.done?'✅':'⏳'}</span><div><b>Document Upload</b><small>${escapeHtml(docItem.detail||'pending')}</small></div></div><span>${docItem.done?'Complete':'Pending'}</span></div>`)}
    if(required.length){required.forEach(name=>parts.push(`<div class="progress-step pending"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">📄</span><div><b>${escapeHtml(name)}</b><small>Required document</small></div></div><span>Required</span></div>`))}
    box.innerHTML=parts.join('')||'<div class="progress-empty">इस application के लिए कोई required document configured नहीं है।</div>';
  }
  $('#customerDocumentList').innerHTML=rows.length?rows.map(x=>`<div class="customer-list-item"><div><b>📄 ${escapeHtml(x.name||x.document_id)}</b><span>${escapeHtml(x.status||'uploaded')} · ${Math.ceil(Number(x.size||0)/1024)} KB</span></div><div class="actions"><button class="primary" type="button" data-customer-doc-download="${x.id}" data-customer-doc-name="${escapeHtml(x.name||'document')}">⬇ Download</button><button class="btn danger" type="button" data-customer-doc-delete="${x.id}" ${x.status==='verified'?'disabled title="Verified document delete नहीं किया जा सकता"':''}>🗑 Delete</button></div></div>`).join(''):'<div class="muted">इस application के लिए अभी कोई document upload नहीं है।</div>';
  document.querySelectorAll('[data-customer-doc-download]').forEach(b=>b.onclick=()=>downloadCustomerDocument(b.dataset.customerDocDownload,b.dataset.customerDocName));
  document.querySelectorAll('[data-customer-doc-delete]').forEach(b=>b.onclick=()=>deleteCustomerDocument(b.dataset.customerDocDelete));
}

async function downloadCustomerDocument(id,name){if(!hasCustomerLogin())return openCustomerLogin('Document download करने के लिए Customer Login जरूरी है।');try{const csrf=document.cookie.match(/(?:^|;\s*)angel_csrf=([^;]+)/)?.[1]||'';const r=await fetch((backendUrl||'').replace(/\/$/,'')+'/api/documents/'+encodeURIComponent(id)+'/download',{headers:csrf?{'X-CSRF-Token':decodeURIComponent(csrf)}:{},credentials:'include'});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Document download failed')}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name||'document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('Document download शुरू हो गया')}catch(e){toast(e.message)}}

async function deleteCustomerDocument(id){if(!hasCustomerLogin())return openCustomerLogin('Document delete करने के लिए Customer Login जरूरी है।');if(!(await angelConfirm('क्या आप यह document delete करना चाहते हैं? यह action वापस नहीं होगा।')))return;try{await api('/api/documents/'+encodeURIComponent(id),{method:'DELETE'});toast('Document delete हो गया');await loadDocuments()}catch(e){toast(e.message)}}

async function uploadCustomerDocuments(){if(!hasCustomerLogin())return openCustomerLogin('Documents upload करने के लिए Customer Login जरूरी है।');const tokenId=Number(localStorage.getItem('angelCurrentTokenId')||0);if(!tokenId)return toast('पहले payment verification के बाद Live Token generate करें। उसके बाद documents upload करें।');const applicationId=Number($('#documentApplication').value||0),files=[...($('#customerDocuments').files||[])];if(!applicationId)return toast('Application चुनें');if(!files.length)return toast('कम-से-कम एक document चुनें');const docType=$('#customerDocumentType')?.value||'';if((lastRecords.applications||[]).find(a=>Number(a.id)===applicationId)?.status==='Token Generated'&&!docType){const p=await api('/api/customer/progress?application_id='+encodeURIComponent(applicationId));if((p.progress?.required_documents||[]).length)return toast('पहले Document Type चुनें');}if(files.length>5)return toast('एक बार में अधिकतम 5 documents');const allowed=['application/pdf','image/jpeg','image/png','image/webp'];let total=0;const encoded=[];for(const f of files){if(!allowed.includes(f.type))return toast('केवल PDF/JPG/PNG/WEBP allowed है');if(f.size>5*1024*1024)return toast('हर document 5MB से छोटा रखें');total+=f.size;if(total>10*1024*1024)return toast('कुल documents 10MB से छोटे रखें');encoded.push(await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,mime_type:f.type,document_type:$('#customerDocumentType')?.value||'',data:r.result});r.onerror=()=>reject(new Error('File read failed'));r.readAsDataURL(f)}))}try{const d=await api('/api/customer/documents',{method:'POST',body:JSON.stringify({application_id:applicationId,files:encoded})});$('#documentStatus').textContent='✅ '+(d.documents?.length||0)+' document upload हुए';$('#customerDocuments').value='';await loadDocuments();toast('Documents upload हो गए')}catch(e){toast(e.message)}}
populateAppointmentService();setMinDates();$('#appointmentForm').onsubmit=e=>{e.preventDefault();submitAppointment()};$('#uploadCustomerDocuments').onclick=()=>uploadCustomerDocuments();$('#generateToken').onclick=()=>generate().catch(e=>toast(e.message));$('#openCustomerDocumentsAfterToken').onclick=()=>go('customer-documents');syncTokenDocumentsGate(!!Number(localStorage.getItem('angelCurrentTokenId')||0));$('#customerPaymentForm').onsubmit=e=>{e.preventDefault();submitPayment()};$('#cPaymentScreenshot').onchange=e=>{const f=e.target.files?.[0],box=$('#paymentPreview');if(!box)return;if(!f){box.textContent='';return}if(!['image/png','image/jpeg','image/webp'].includes(f.type))return toast('केवल PNG/JPG/WEBP screenshot दें');if(f.size>5*1024*1024)return toast('Screenshot 5MB से छोटा रखें');const r=new FileReader();r.onload=()=>{box.innerHTML='';const wrap=document.createElement('div');wrap.className='payment-preview';const img=document.createElement('img');img.src=r.result;img.alt='Payment screenshot preview';wrap.appendChild(img);const sm=document.createElement('small');sm.textContent=f.name;box.appendChild(wrap);box.appendChild(sm)};r.readAsDataURL(f)};checkPaymentStatus();syncTokenGenerateDesign();$('#clearCustomer').onclick=()=>{const keepService=$('#cService').value;$('#cName').value=hasCustomerLogin()?($('#dashCustomerName').textContent==='Guest'?'':$('#dashCustomerName').textContent):'';$('#cMobile').value=hasCustomerLogin()?($('#dashCustomerMobile').textContent==='—'?'':$('#dashCustomerMobile').textContent):'';$('#cService').value=keepService||'';$('#cAmount').value=keepService?$('#cAmount').value:'0';$('#paymentPreview').textContent='';$('#cUtr').value='';$('#cPaymentScreenshot').value='';$('#paymentStatus').textContent='Payment verification pending है।';$('#paymentStatus').className='payment-status';$('#generateToken').disabled=true;stopPaymentStatusPolling();syncTokenDocumentsGate(false);updateUpiPaymentLink();toast('Form साफ हो गया; login/session सुरक्षित है')};$('#refreshMyToken').onclick=()=>refreshAll();$('#goLive').onclick=()=>go('customer-status');$('#refreshHistory').onclick=loadHistory;$('#refreshRecords').onclick=loadRecords;$('#refreshApplications').onclick=loadApplications;$('#refreshAppointments').onclick=loadAppointments;$('#refreshHomeServices').onclick=loadHomeServices;$('#submitHomeService').onclick=submitHomeService;$('#customerAccountRefresh').onclick=()=>hasCustomerLogin()?refreshAll():openCustomerLogin('Account details देखने के लिए Customer Login जरूरी है।');$('#liveOfferAction').onclick=()=>{const items=getLiveOffers();const o=items[liveOfferIndex];if(o?.type==='OFFER'&&o.service){populateCustomerPaymentServices();const sel=$('#cService');if(sel&&[...sel.options].some(x=>x.value===o.service)){sel.value=o.service;localStorage.setItem('angelSelectedOfferId',String(o.id||''));if(Number(o.offer_price)>0){$('#cAmount').value=Number(o.offer_price).toFixed(2);localStorage.setItem('angelSelectedAmount',String(Number(o.offer_price)));syncTokenGenerateDesign();updateUpiPaymentLink()}$('#cService').dispatchEvent(new Event('change'));go('customer-token');toast('Offer price selected — payment उसी offer amount पर verify होगा')}else{go('customer-services');toast('Offer में configured service नहीं मिली; service details खोलें')}}else{localStorage.removeItem('angelSelectedOfferId');go('customer-services');toast('Services section खोला गया')}};
let refreshAllInFlight=null;
let customerLiveSyncTimer=null;
let customerRechargeRevision=0;
let customerRefreshGeneration=0;
let customerServiceEtaTimer=null;
let customerServiceEta={startAt:null,completeAt:null,status:''};
function stopCustomerLiveSync(){if(customerLiveSyncTimer){clearInterval(customerLiveSyncTimer);customerLiveSyncTimer=null}}
async function syncCustomerRechargeState(){
  if(!hasCustomerLogin())return;
  try{
    const d=await api('/api/customer/recharge/sync?since='+encodeURIComponent(customerRechargeRevision||0));
    const rows=Array.isArray(d.recharges)?d.recharges:[];
    const latest=Math.max(Number(customerRechargeRevision||0),Number(d.latest_revision||0));
    if(rows.length){
      customerRechargeRevision=latest;
      const activeHash=String(location.hash||'').replace(/^#/,'');
      if(activeHash==='customer-receipts'||activeHash==='customer-recharge') await loadRecords({silent:true});
      const terminal=rows.find(r=>r.status==='Success'||r.status==='Failed');
      if(terminal)toast((terminal.status==='Success'?'Recharge completed':'Recharge failed')+' · records updated');
    }else customerRechargeRevision=latest;
  }catch{}
}
function startCustomerLiveSync(){
  stopCustomerLiveSync();
  if(!hasCustomerLogin())return;
  const shouldPoll=()=>{const h=String(location.hash||'').replace(/^#/,'');return h==='customer-status'||h==='customer-token'||h==='customer-home'||h==='customer-receipts'||h==='customer-recharge';};
  const tick=()=>{
    if(document.hidden)return;
    if(shouldPoll()&&hasCustomerLogin()){syncCustomerRechargeState();refreshAll().catch(()=>{});}
    else if(!shouldPoll())stopCustomerLiveSync();
  };
  customerLiveSyncTimer=setInterval(tick,5000);
}
async function refreshAll(){
  if(refreshAllInFlight)return refreshAllInFlight;
  const requestGeneration=++customerRefreshGeneration;
  refreshAllInFlight=(async()=>{
    const loggedIn=hasCustomerLogin();
    let cachedCustomer=null;try{cachedCustomer=JSON.parse(localStorage.getItem('angelCustomerProfile')||'null')}catch{}updateCustomerHeader(loggedIn?cachedCustomer:null);
    if(!loggedIn){
      stopCustomerLiveSync();
      const progress=await refreshCustomerProgress();
      if(requestGeneration!==customerRefreshGeneration)return;
      renderTokenStatusDashboard({mine:null,active:null,ahead:0,wait:'—'},progress);
      return;
    }
    const results=await Promise.allSettled([
      api('/api/customer/dashboard'),
      api('/api/customer/progress')
    ]);
    const dashboard=results[0].status==='fulfilled'?results[0].value:null;
    const progress=results[1].status==='fulfilled'?results[1].value?.progress:null;
    if(requestGeneration!==customerRefreshGeneration)return;
    if(!dashboard){
      if(progress)renderTokenStatusDashboard({mine:null,active:null,ahead:0,wait:'—'},progress);
      return;
    }

    const customer=dashboard.customer||null;
    if(customer){
      localStorage.setItem('angelCustomerProfile',JSON.stringify(customer));
      localStorage.setItem('angelCustomerMobile',customer.mobile||'');
      currentMobile=customer.mobile||currentMobile;
      updateCustomerHeader(customer);
      const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value??'—'};
      set('dashCustomerId',customer.customer_id||'—');
      set('dashCustomerName',customer.name||'—');
      set('dashCustomerMobile',customer.mobile||'—');
      set('dashTotalServices',dashboard.summary?.total_tokens??0);
      set('dashCompleted',dashboard.summary?.completed_tokens??0);
      set('dashVerifiedPayments',dashboard.summary?.verified_payments??0);
    }

    renderCustomerRecords(dashboard);
    const rechargeRows=Array.isArray(dashboard.recharges)?dashboard.recharges:[];
    customerRechargeRevision=rechargeRows.reduce((m,r)=>Math.max(m,Number(r.state_revision||0)),Number(customerRechargeRevision||0));

    const dashboardPayments=Array.isArray(dashboard.payments)?dashboard.payments:[];
    const dashboardApplications=Array.isArray(dashboard.applications)?dashboard.applications:[];
    const reconcileId=(key,rows)=>{
      const id=Number(localStorage.getItem(key)||0);
      if(!id)return 0;
      const exists=rows.some(x=>Number(x?.id)===id);
      if(!exists){localStorage.removeItem(key);return 0;}
      return id;
    };
    // Server dashboard is authoritative: never keep stale payment/application/token pointers locally.
    const savedPaymentId=reconcileId('angelPaymentId',dashboardPayments);
    const savedUppclId=reconcileId('angelUppclPaymentId',dashboardPayments);
    const savedApplicationId=reconcileId('angelApplicationId',dashboardApplications);
    if(savedApplicationId){
      const app=dashboardApplications.find(x=>Number(x.id)===savedApplicationId);
      if(app?.service)localStorage.setItem('angelSelectedService',app.service);
    }
    const tokens=Array.isArray(dashboard.tokens)?dashboard.tokens:[];
    const savedTokenId=Number(localStorage.getItem('angelCurrentTokenId')||0);
    if(savedTokenId && !tokens.some(t=>Number(t.id)===savedTokenId)){
      localStorage.removeItem('angelCurrentTokenId');
      syncTokenDocumentsGate(false);
    }
    const mine=tokens.find(t=>!['पूर्ण','रद्द','स्किप'].includes(String(t.status||'')))||null;
    const active=dashboard.current||null;
    const ahead=mine?.ahead_count!=null?Number(mine.ahead_count):(mine?.queue_position!=null?Math.max(0,Number(mine.queue_position)-1):0);
    const waitMinutes=mine?.estimated_wait_minutes;
    const wait=waitMinutes!=null?`${Number(waitMinutes)} मिनट`:'—';
    const queueState={
      mine,
      active,
      ahead:Number.isFinite(Number(ahead))?Number(ahead):0,
      wait,
      avgMinutes:Number(mine?.service_average_minutes||15)
    };
    renderMine(queueState);
    renderTokenStatusDashboard(queueState,progress||null);

    if(document.getElementById('page-customer-uppcl')?.classList.contains('active-page')){
      renderUppclHistory(dashboard.payments||[]);
      const savedId=Number(localStorage.getItem('angelUppclPaymentId')||0);const up=(savedId&&dashboard.payments?.find(x=>Number(x.id)===savedId))||dashboard.payments?.find(x=>x.service==='UPPCL Bill Payment');if(up){localStorage.setItem('angelUppclPaymentId',String(up.id));renderUppclFlow(up);maybeStartUppclStatusRefresh();}
    }
    loadCustomerUpdates();
    if(results[0].status==='fulfilled' && results[1].status==='rejected'){
      const el=document.getElementById('statusLastUpdated');
      if(el)el.textContent='Live · progress sync pending';
    }
  })().catch(()=>{}).finally(()=>{refreshAllInFlight=null;startCustomerLiveSync()});
  return refreshAllInFlight;
}
function statusClass(status){const s=String(status||'').trim();if(s==='पूर्ण')return 'done';if(s==='बुलाया'||s==='प्रगति')return 'active';if(s==='रद्द'||s==='स्किप')return 'hold';return 'pending'}
function queueHtml(rows,mine){if(!rows.length)return '<div class="muted">आज कोई token नहीं है</div>';return rows.map(r=>`<div class="queue-row"><div class="live-number">${escapeHtml(r.token||'—')}</div><div><b>Token ${escapeHtml(r.token||'—')}</b><br><span class="muted">${escapeHtml(r.service||'')}</span></div><div><span class="status-pill ${statusClass(r.status)}">${escapeHtml(r.status||'—')}</span></div></div>`).join('')}
function loadCustomerUpdates(rows=[]){const box=$('#customerUpdates');const items=getLiveOffers().filter(x=>x&&x.type!=='OFFER').slice(0,5);if(!box)return;box.innerHTML=items.length?items.map(x=>`<div class="customer-update-item"><div class="update-icon">📢</div><div><b>${escapeHtml(x.title||'Latest Update')}</b><span>${escapeHtml(x.subtitle||x.description||'')}</span><small>${escapeHtml(x.date||'Latest')}</small></div></div>`).join(''):'<div class="update-empty">अभी कोई नया update नहीं है।</div>';const count=$('#customerUpdateCount');if(count)count.textContent=String(items.length)}
function renderCustomerProgress(p, prefix){
  if(!p)return;
  const pct=Math.max(0,Math.min(100,Number(p.percent||0)));
  const root=document.getElementById(prefix+'ProgressPercent'); if(!root)return;
  root.textContent=pct+'%';
  const fill=document.getElementById(prefix+'ProgressFill'); if(fill)fill.style.width=pct+'%';
  const app=document.getElementById(prefix+'ProgressApplication'); if(app)app.textContent=p.application?.application_id?('Application '+p.application.application_id):'Application —';
  const st=document.getElementById(prefix+'ProgressStatus'); if(st)st.textContent=p.application?.status||p.token?.status||'Status —';
  const updated=document.getElementById(prefix+'ProgressUpdated'); if(updated)updated.textContent='Live';
  const box=document.getElementById(prefix+'ProgressSteps'); if(!box)return;
  const labels={payment:'Payment Verified',photo:'Photo',signature:'Signature',documents:'Documents',data:'Data Cross-check',submission:'Submission',quality:'Quality Review',final:'Final Completion'};
  const items=Array.isArray(p.items)?p.items:[];
  box.innerHTML=items.map(x=>{const done=!!x.done;let detail=String(x.detail||'pending');if(x.id==='documents'&&detail==='0/0 uploaded')detail='Not required';return `<div class="progress-step ${done?'done':'pending'}"><div style="display:flex;gap:8px;align-items:flex-start"><span class="step-icon">${done?'✅':'⏳'}</span><div><b>${escapeHtml(labels[x.id]||x.label||x.id)}</b><small>${escapeHtml(detail)}</small></div></div><span>${done?'Done':'Pending'}</span></div>`}).join('')||'<div class="progress-empty">No active application yet.</div>';
}
async function refreshCustomerProgress(){
  const session=localStorage.getItem('angelGuestSession')||localStorage.getItem('angelCustomerProfile')||'';
  if(!session){const b=document.getElementById('statusProgressSteps');if(b)b.innerHTML='<div class="progress-empty">Login or start a service application to see progress.</div>';return null}
  try{const d=await api('/api/customer/progress');const p=d.progress;renderCustomerProgress(p,'status');return p}catch(e){return null}
}
function bindStatusEmptyAction(){const ids=['statusNewServiceBtn','statusHeroNewServiceBtn'];ids.forEach(id=>{const b=document.getElementById(id);if(b&&!b.dataset.bound){b.dataset.bound='1';b.onclick=()=>go('customer-services')}})}
function updateStatusTimeCardState(hasActivity,hasToken,loggedIn){
  const card=document.getElementById('statusTimeCard');
  const live=card?.querySelector('.status-time-live');
  const grid=card?.querySelector('.status-time-grid');
  const note=document.getElementById('statusTimeNote');
  if(!card)return;
  card.classList.toggle('is-empty',!hasToken);
  if(live){live.hidden=!hasToken;live.textContent=hasToken?'● LIVE':'';}
  if(grid)grid.hidden=!hasToken;
  if(note&&!hasToken){
    note.textContent=hasActivity
      ? 'Token generate होने के बाद estimated start और completion time यहाँ दिखाई देगा।'
      : (loggedIn?'अभी कोई active token/application नहीं है। नई सेवा शुरू करने के बाद यहाँ estimate दिखाई देगा।':'Login के बाद active token का estimated time यहाँ दिखाई देगा।');
  }
}
function renderTokenStatusDashboard(x,p){
  const mine=x?.mine||null, items=Array.isArray(p?.items)?p.items:[];
  const find=id=>items.find(i=>i.id===id)||null;
  const payment=find('payment'), docs=find('documents');
  const friendly={'लंबित':'IN QUEUE','बुलाया':'CALLED','प्रगति':'IN PROGRESS','होल्ड':'ON HOLD','पूर्ण':'COMPLETED','स्किप':'SKIPPED','रद्द':'CANCELLED'};
  const status=String(mine?.status||p?.token?.status||'').trim();
  const badge=hasCustomerLogin()?(status?(friendly[status]||status.toUpperCase()):'NO ACTIVE TOKEN'):'LOGIN REQUIRED';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  set('statusHeroToken',mine?.token||p?.token?.token||'—');
  set('statusHeroService',mine?'सेवा: '+(mine.service||'—'):(p?.application?.service?'सेवा: '+p.application.service:'सेवा: —'));
  set('statusHeroBadge','● '+badge);
  set('statusHeroCurrent',x?.active?.token||'—');
  set('statusHeroAhead',mine&&Number.isFinite(Number(x?.ahead))?String(x.ahead):'—');
  set('statusHeroWait',x?.wait||'—');
  const position=(mine&&Number.isFinite(Number(x?.ahead)))?'#'+(Number(x.ahead)+1):'—';
  set('statusHeroPosition',position);
  const app=p?.application||null;
  const loggedIn=hasCustomerLogin();
  const hasApplication=!!app;
  const hasToken=!!mine||!!p?.token;
  const hasActivity=hasApplication||hasToken;
  updateStatusTimeCardState(hasActivity,hasToken,loggedIn);
  set('statusApplicationId',app?.application_id||'—');
  set('statusApplicationService',app?.service||mine?.service||'—');
  set('statusApplicationDate',app?.created_at?new Date(app.created_at).toLocaleString('hi-IN'):'—');
  set('statusApplicationToken',mine?.token||p?.token?.token||'—');
  set('statusApplicationState',hasActivity?(p?.workflow_state||friendly[status]||status||'—'):(loggedIn?'कोई active application नहीं':'Login Required'));
  const appBar=document.querySelector('#page-customer-status .status-application-bar'); if(appBar)appBar.classList.toggle('is-empty',!hasActivity);
  set('statusCurrentHeading',hasActivity?(status?('Token '+(mine?.token||p?.token?.token||'—')+' · '+(friendly[status]||status)):(p?.workflow_state||'Live service status')):'Live service status');
  const paymentState=payment?.done?'Verified':(p?.payment?.status||payment?.detail||'');
  const paymentVerified=String(paymentState).toLowerCase()==='verified';
  set('statusPaymentSummary',hasActivity?(paymentVerified?'भुगतान सफलतापूर्वक सत्यापित हो गया है।':'Payment verification pending है.'):(loggedIn?'अभी कोई active application नहीं है।':'Login के बाद payment status यहाँ दिखेगा।'));
  set('statusPaymentState',hasActivity&&p?.payment?'Submitted':'—');
  set('statusPaymentVerification',hasActivity?(paymentVerified?'Verified':(paymentState||'Pending')):'—');
  const pb=document.getElementById('statusPaymentBox');
  if(pb){pb.className='status-verified-box'+(hasActivity&&!paymentVerified?' pending':'');pb.textContent=hasActivity?(paymentVerified?'✓ Payment Verified':'◷ Payment Verification Pending'):(loggedIn?'कोई active application नहीं है।':'Login के बाद payment status दिखेगा।');}
  const required=hasActivity&&Array.isArray(p?.required_documents)?p.required_documents:[];
  const uploaded=hasActivity&&Array.isArray(p?.documents)?p.documents:[];
  const verified=uploaded.filter(d=>['verified','approved','accepted','not_required'].includes(String(d.status||'').toLowerCase())).length;
  const reqCount=required.length;
  const docsNotRequired=hasActivity&&reqCount===0;
  const docPct=(!hasActivity||docsNotRequired)?null:(reqCount?Math.min(100,Math.round((verified/reqCount)*100)):null);
  set('statusDocsCount',!hasActivity?'':(reqCount?`(${verified} / ${reqCount})`:''));
  set('statusDocsPercent',!hasActivity?'—':(docsNotRequired?'N/A':(docPct===null?'—':docPct+'%')));
  const fill=document.getElementById('statusDocsFill');
  if(fill){fill.style.width=docPct===null?'0%':docPct+'%';fill.parentElement?.classList.toggle('not-applicable',!hasActivity||docsNotRequired);}
  const dl=document.getElementById('statusDocsList');
  if(dl){
    const rows=uploaded.length?uploaded.map(d=>({name:d.name||'Document',state:String(d.status||'pending')})):required.map(r=>({name:r,state:'pending'}));
    dl.innerHTML=rows.length?rows.slice(0,6).map(d=>{const state=d.state.toLowerCase();const ok=['verified','approved','accepted','not_required'].includes(state);const label=ok?'Verified':(state==='received'?'Received':state==='rejected'?'Rejected':'Verification Pending');return `<div class="status-doc-row ${ok?'':'pending'}"><b>${escapeHtml(d.name)}</b><span>${escapeHtml(label)}</span></div>`}).join(''):(docsNotRequired?'<div class="status-muted">इस service के लिए कोई document required नहीं है।</div>':(hasActivity?'<div class="status-muted">Required documents अभी configure नहीं हैं।</div>':'<div class="status-muted">Active application के बाद document status यहाँ दिखाई देगा।</div>'));
  }
  const item=(id)=>items.find(i=>i.id===id)||null;
  const paymentItem=item('payment'), tokenItem=item('token'), docsItem=item('documents'), processingItem=item('processing'), completedItem=item('completed');
  const steps=[
    {id:'payment',label:'पेमेंट सबमिट',done:!!paymentItem?.done},
    {id:'token',label:'टोकन जनरेट',done:!!tokenItem?.done},
    {id:'documents',label:'दस्तावेज सत्यापन',done:!!docsItem?.done},
    {id:'processing',label:'प्रोसेसिंग',done:!!processingItem?.done},
    {id:'completed',label:'पूरा हुआ',done:!!completedItem?.done}
  ];
  const firstPending=steps.findIndex(s=>!s.done), current=firstPending<0?steps.length-1:firstPending;
  const hs=document.getElementById('statusHorizontalSteps');
  if(hs)hs.innerHTML=hasActivity?steps.map((st,i)=>`<div class="status-h-step ${st.done?'done':''} ${i===current&&!st.done?'active':''}"><div class="status-h-dot">${st.done?'✓':'○'}</div><b>${st.label}</b><small>${st.done?'पूर्ण':(i===current?'प्रगति में':'लंबित')}</small></div>`).join(''):(loggedIn?'<div class="status-step-empty"><div class="status-empty-illustration">📄</div><b>अभी कोई active application नहीं है।</b><small>नई service/application शुरू करने के बाद यहाँ live progress दिखाई देगी।</small><button type="button" class="status-empty-action" id="statusNewServiceBtn">नई सेवा शुरू करें →</button></div>':'<div class="status-step-empty"><div class="status-empty-illustration">🔐</div><b>Login required</b><small>Login के बाद active application की progress यहाँ दिखाई देगी।</small></div>');
  const updates=[];
  if(hasActivity){
    if(paymentItem?.done)updates.push(['Payment सत्यापित हो गया है।','✓']);
    else if(p?.payment)updates.push(['Payment verification pending है।','◷']);
    if(reqCount>0 && docsItem?.done)updates.push(['सभी required documents verified हैं।','✓']);
    else if(reqCount>0)updates.push([`Documents verification ${docsItem?.detail||'अभी जारी है।'}`,'◷']);
    if(mine)updates.push([`Token ${mine.token} · ${friendly[status]||status||'Active'}`,'•']);
    else if(p?.workflow_state)updates.push([`वर्तमान चरण: ${p.workflow_state}`,'•']);
  }
  const ul=document.getElementById('statusLatestUpdates');if(ul)ul.innerHTML=updates.length?updates.map(u=>`<div class="status-update-item"><span class="dot"></span><div><b>${escapeHtml(u[0])}</b><small>Live status</small></div></div>`).join(''):'<div class="status-muted">अभी कोई update उपलब्ध नहीं है।</div>';
  const cb=document.getElementById('statusCurrentBox');
  if(cb)cb.textContent=mine?(status==='बुलाया'?'🎉 आपकी बारी है। Counter पर जाएँ।':status==='प्रगति'?'▶ आपका काम अभी चल रहा है।':status==='पूर्ण'?'✓ आपका काम पूरा हो गया है।':status==='होल्ड'?'⏸ आपका काम hold पर है।':`Token ${mine.token} · ${friendly[status]||status||'Waiting'}`):(hasApplication?`आपका application active है। ${p?.workflow_state||'अगला चरण pending है।'} Token अभी generate नहीं हुआ है।`:(loggedIn?'अभी कोई active application/token नहीं है।':'अपना token देखने के लिए login करें।'));
  const rb=document.getElementById('statusReceiptBox'),btn=document.getElementById('statusReceiptBtn');
  const receipt=p?.payment||null;
  const receiptReady=hasActivity&&status==='पूर्ण'&&!!receipt?.receipt_no;
  if(rb)rb.textContent=receiptReady?'Receipt उपलब्ध है।':'Service पूरी होने के बाद रसीद उपलब्ध होगी।';
  if(btn){btn.disabled=!receiptReady;btn.title=receiptReady?'Receipt खोलें':'Service complete होने के बाद receipt उपलब्ध होगी';btn.onclick=receiptReady?()=>downloadReceiptPdf(Number(receipt.id)):null;}
  set('statusLastUpdated','Live · '+new Date().toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'}));
  bindStatusEmptyAction();
}
function formatEtaClock(iso){if(!iso)return '—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '—';return d.toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'});}
function formatCountdown(iso,doneLabel='अब'){if(!iso)return '—';const ms=new Date(iso).getTime()-Date.now();if(!Number.isFinite(ms))return '—';if(ms<=0)return doneLabel;const total=Math.ceil(ms/1000),m=Math.floor(total/60),s=total%60;if(m>=60){const h=Math.floor(m/60),rm=m%60;return `${h} घं ${rm} मि`;}return `${m} मि ${String(s).padStart(2,'0')} से`}
function updateCustomerServiceEta(){
  const start=document.getElementById('statusStartCountdown'),complete=document.getElementById('statusCompleteCountdown'),startAt=document.getElementById('statusStartAt'),completeAt=document.getElementById('statusCompleteAt'),note=document.getElementById('statusTimeNote');
  if(!start||!complete)return;
  const st=customerServiceEta.status;
  if(!customerServiceEta.startAt&&!customerServiceEta.completeAt){start.textContent='—';complete.textContent='—';startAt.textContent='अनुमानित समय: —';completeAt.textContent='अनुमानित समय: —';note.textContent='Token generate होने के बाद आपके लिए estimated start और completion time दिखाई देगा।';return;}
  if(st==='पूर्ण'){start.textContent='पूरा';complete.textContent='काम पूरा हो गया';note.textContent='यह service complete हो चुकी है।';}
  else if(st==='प्रगति'){start.textContent='काम शुरू हो चुका';complete.textContent=formatCountdown(customerServiceEta.completeAt,'लगभग अभी');note.textContent='आपका काम अभी चल रहा है। नीचे दिया समय अनुमानित completion time है।';}
  else if(st==='बुलाया'){start.textContent='अब';complete.textContent=formatCountdown(customerServiceEta.completeAt,'लगभग अभी');note.textContent='आपकी बारी आ गई है। Counter पर जाएँ; completion time अनुमानित है।';}
  else if(st==='होल्ड'){start.textContent='Hold पर';complete.textContent=formatCountdown(customerServiceEta.completeAt,'जाँच जरूरी');note.textContent='आपका काम hold पर है; hold duration के अनुसार completion estimate बदल सकता है।';}
  else if(st==='रद्द'||st==='स्किप'){start.textContent='—';complete.textContent=st==='स्किप'?'Skip':'Cancel';note.textContent='इस token की active queue estimate उपलब्ध नहीं है।';}
  else {start.textContent=formatCountdown(customerServiceEta.startAt,'अब');complete.textContent=formatCountdown(customerServiceEta.completeAt,'अब');note.textContent='Queue में आपकी position और current service speed के आधार पर अनुमानित समय।';}
  startAt.textContent='अनुमानित शुरू: '+formatEtaClock(customerServiceEta.startAt);
  completeAt.textContent='अनुमानित पूरा: '+formatEtaClock(customerServiceEta.completeAt);
}
function setCustomerServiceEta(mine){
  customerServiceEta={startAt:mine?.estimated_start_at||null,completeAt:mine?.estimated_completion_at||null,status:String(mine?.status||'')};
  updateCustomerServiceEta();
  if(customerServiceEtaTimer)clearInterval(customerServiceEtaTimer);
  customerServiceEtaTimer=setInterval(()=>{if(document.hidden)return;updateCustomerServiceEta()},1000);
}
function renderMine(x){
  const mine=x.mine||null, status=String(mine?.status||'');
  setCustomerServiceEta(mine);
  const friendly={
    'लंबित':'Waiting',
    'बुलाया':'Called',
    'प्रगति':'In Progress',
    'होल्ड':'On Hold',
    'पूर्ण':'Completed',
    'स्किप':'Skipped',
    'रद्द':'Cancelled'
  };
  let ahead=Number(x.ahead||0), wait='—', message='अपना mobile number देकर token देखें';
  if(mine){
    if(status==='बुलाया'){ahead=0;wait='अब आपकी बारी';message='🎉 आपकी बारी है। Counter पर जाएँ।'}
    else if(status==='प्रगति'){ahead=0;wait='काम चल रहा है';message='▶ आपका काम अभी चल रहा है। कृपया Counter पर बने रहें।'}
    else if(status==='होल्ड'){ahead=0;wait='काम रुका है';message='⏸ आपका काम फिलहाल pending/hold पर है। नीचे progress और timer देखें।'}
    else if(status==='पूर्ण'){ahead=0;wait='पूर्ण';message='✅ आपका काम पूरा हो गया है।'}
    else if(status==='स्किप'||status==='रद्द'){ahead=0;wait=friendly[status]||status;message=(status==='स्किप'?'⏭ Token skip किया गया है।':'❌ Token cancel किया गया है।')}
    else {wait=(ahead>0?`${ahead} आगे · ${Number(x.avgMinutes||5)*ahead} मिनट`: 'जल्द बुलाया जाएगा');message=`Token ${mine.token} · Waiting queue में है।`}
  }
  $('#statusCurrent').textContent=x.active?.token||'—';
  $('#statusCurrentService').textContent=x.active?'सेवा: '+x.active.service:'कोई active token नहीं';
  $('#statusMine').textContent=mine?.token||'—';
  $('#statusAhead').textContent=String(ahead);
  $('#statusWait').textContent=wait;
  $('#statusState').textContent=mine?(friendly[status]||status):'—';
  $('#statusMessage').textContent=message;
  if(mine){$('#generatedToken').textContent=mine.token;$('#generatedService').textContent='सेवा: '+mine.service;$('#generatedStatus').textContent=friendly[status]||status}
}
var serverLiveOffers=[];
const DEFAULT_LIVE_OFFERS=[
{type:'UPDATE',icon:'🎓',title:'Scholarship Form Updates',description:'नई scholarship applications और important last-date updates देखें।',date:'आज का अपडेट',valid:'Last date admin द्वारा publish होने तक',badge:'UPDATE',ticker:'🎓 Scholarship के नए forms और deadlines की जानकारी उपलब्ध है।'},
{type:'FORM',icon:'📝',title:'Online Forms Open',description:'नए government और education online forms के लिए application assistance उपलब्ध है।',date:'Applications Open',valid:'Form deadline के अनुसार',badge:'NEW',ticker:'📝 Online forms की नई जानकारी live screen पर देखें।'},
{type:'OFFER',icon:'🔥',title:'Special CSC Discount',description:'Selected form filling, print/scan और digital assistance services पर special offer।',date:'Today Offer',valid:'Offer availability के अनुसार',badge:'DISCOUNT',ticker:'🔥 Selected services पर special CSC discount available है।'},
{type:'UPDATE',icon:'🏛️',title:'Government Scheme Update',description:'नई सरकारी योजना, eligibility और application status की latest information।',date:'Latest',valid:'Official update के अनुसार',badge:'GOVT',ticker:'🏛️ Government scheme की latest information यहाँ मिलेगी।'},
{type:'UPDATE',icon:'🪪',title:'Aadhaar / PAN Service Update',description:'Aadhaar और PAN services से जुड़े नए process, documents और service updates।',date:'Latest',valid:'Latest service notice',badge:'SERVICE',ticker:'🪪 Aadhaar और PAN service updates live उपलब्ध हैं।'},
{type:'UPDATE',icon:'💼',title:'Job & Exam Notifications',description:'Government jobs, exam forms और admission notifications की जानकारी।',date:'Latest',valid:'Notification deadline के अनुसार',badge:'NEW',ticker:'💼 Government job और exam form notifications देखें।'}
];
let liveOfferIndex=0,liveOfferTimer=null;
function getLiveOffers(){return serverLiveOffers.filter(x=>x&&x.published!==false)}async function loadServerLiveOffers(){try{const d=await api('/api/offers');serverLiveOffers=(d.offers||[]).map(o=>({id:o.id,type:o.type||'UPDATE',category:o.update_category||'',icon:o.type==='OFFER'?'🔥':'📰',title:o.title,subtitle:o.subtitle||'',description:o.description||'',date:o.last_date?'Last Date: '+o.last_date:(o.valid?'Valid till '+o.valid:'Latest'),valid:o.expires_at?'Valid till '+new Date(o.expires_at).toLocaleString('hi-IN'):(o.valid||'LIVE'),badge:o.type==='OFFER'?'OFFER':(o.update_category||'UPDATE'),ticker:o.ticker||o.subtitle||o.description,image:o.image,original_price:o.original_price,offer_price:o.offer_price,discount:o.discount,save_amount:o.save_amount,priority:o.priority,service:o.service||''}));renderLiveOffers()}catch(e){}}
function renderLiveOffers(){const items=getLiveOffers();if(!items.length)return;liveOfferIndex=liveOfferIndex%items.length;const o=items[liveOfferIndex];const kind=$('#liveOfferKind'),ey=$('#liveOfferEyebrow'),title=$('#liveOfferTitle'),desc=$('#liveOfferDescription'),date=$('#liveOfferDate'),valid=$('#liveOfferValidity'),ticker=$('#offerTicker'),list=$('#liveOfferList'),dots=$('#liveOfferDots'),count=$('#customerUpdateCount');const safe=v=>escapeHtml(v??'');if(kind)kind.textContent=o.badge||o.type||'UPDATE';if(ey)ey.textContent=o.type==='OFFER'?"TODAY'S OFFER":(o.category||'LATEST UPDATE');if(title)title.textContent=(o.icon||'📢')+' '+(o.title||'Live Update');if(desc)desc.innerHTML=(o.subtitle?'<b>'+safe(o.subtitle)+'</b><br>':'')+safe(o.description)+(o.service?'<br><small>Service: '+safe(o.service)+'</small>':'')+(o.type==='OFFER'&&o.offer_price?'<br><strong>₹ '+safe(o.offer_price)+'</strong>'+(o.original_price?' <s>₹ '+safe(o.original_price)+'</s>':'')+(o.discount?' · '+safe(o.discount)+'% OFF':''):'');if(date)date.textContent=o.date||'Latest';if(valid)valid.textContent=o.valid||'Valid till update expires';const im=$('#liveOfferImage');if(im){im.hidden=!o.image;im.src=o.image||'';}if(ticker)ticker.textContent=o.ticker||o.description||'';if(count)count.textContent=String(items.length);if(dots)dots.innerHTML=items.map((_,i)=>`<i class="${i===liveOfferIndex?'active':''}"></i>`).join('');if(list)list.innerHTML=items.slice(0,5).map((x,i)=>`<div class="offer-item ${x.type==='OFFER'?'discount':''}"><div class="offer-icon">${safe(x.icon||'📢')}</div><div><b>${safe(x.title||'Live Update')}</b><small>${safe(x.subtitle||x.description||'')}${x.type==='OFFER'&&x.offer_price?' · ₹ '+safe(x.offer_price)+(x.discount?' · '+safe(x.discount)+'% OFF':''):''}</small></div><span class="offer-badge">${safe(x.badge||x.type||'LIVE')}</span></div>`).join('');}
function startLiveOffers(){renderLiveOffers();clearInterval(liveOfferTimer);liveOfferTimer=setInterval(()=>{const items=getLiveOffers();if(items.length>1){liveOfferIndex=(liveOfferIndex+1)%items.length;renderLiveOffers()}},6500)}
async function getGlobalQueue(service=''){try{const qs=service?'?service='+encodeURIComponent(service):'';const d=await api('/api/customer/live-queue'+qs);return Array.isArray(d.tokens)?d.tokens:[]}catch(e){return []}}
function notificationIcon(n){return ({payment:'💰',recharge:'📱',document:'📄',correction:'✏️',token:'🎫',processing:'▶️',completion:'✅',receipt:'🧾'})[n.type]||'🔔'}
function notificationHtml(n){const cls=n.read?'':' unread';const dt=n.created_at?new Date(n.created_at).toLocaleString('hi-IN'):'—';const rechargeEvent=String(n.type||'')==='recharge'||String(n.event_key||'').startsWith('recharge-');return `<article class="notification-item${cls}"><div class="notification-icon">${notificationIcon(n)}</div><div><h4>${escapeHtml(n.title||'Notification')}</h4><p>${escapeHtml(n.message||'')}</p>${rechargeEvent?'<button type="button" class="notification-record-link" data-open-records="1">Recharge Records देखें</button>':''}</div><small>${escapeHtml(dt)}</small></article>`}
let customerNotificationSignature='';
async function loadCustomerNotifications(){if(!hasCustomerLogin()){openCustomerLogin('Notifications देखने के लिए Customer Login जरूरी है।');return}try{const d=await api('/api/customer/notifications');const rows=Array.isArray(d.notifications)?d.notifications:[];const signature=rows.slice(0,20).map(n=>`${n.id}:${n.event_key||''}:${n.read?'1':'0'}`).join('|');const changed=!!customerNotificationSignature&&signature!==customerNotificationSignature;customerNotificationSignature=signature;const el=$('#customerNotifications');if(el)el.innerHTML=rows.length?rows.map(notificationHtml).join(''):'<div class="muted">अभी कोई notification नहीं है।</div>';const unread=Math.max(0,Number(d.unread)||0);if($('#notificationUnread'))$('#notificationUnread').textContent=`${unread} Unread`;const badge=$('#statusShellNotificationCount');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',unread===0);badge.setAttribute('aria-hidden',unread===0?'true':'false');badge.setAttribute('aria-label',`${unread} unread notifications`)}document.querySelectorAll('[data-open-records]').forEach(b=>b.onclick=()=>go('customer-receipts'));if(changed&&rows.some(n=>String(n.type||'')==='recharge'||String(n.event_key||'').startsWith('recharge-'))){if(location.hash==='#customer-receipts'||location.hash==='#customer-recharge')await loadRecords({silent:true})}}catch(e){toast(e.message)}}

let rechargePageReady=false,rechargeOperator='JIO',rechargeType='PREPAID',selectedRechargePlan=null,rechargePlanCatalog=[],rechargePlanFilter='popular',rechargePaymentInFlight=false,rechargePaymentIdempotencyKey='';
function rechargeEscape(v){return escapeHtml(v==null?'':String(v))}
function rechargePlanCategory(p,i){return String(p.category||p.type||['popular','data','unlimited','top'][i%4]).toLowerCase()}
function renderRechargePlans(plans,live=false){const grid=$('#rechargePlanGrid');if(!grid)return;const arr=Array.isArray(plans)?plans:[];rechargePlanCatalog=arr;if(!arr.length){grid.innerHTML='<div class="empty-state">इस operator/type के plans उपलब्ध नहीं हैं।</div>';return}const filtered=arr.filter((p,i)=>rechargePlanFilter==='all'||rechargePlanCategory(p,i)===rechargePlanFilter);const shown=filtered.length?filtered:arr;grid.innerHTML=shown.map((p,i)=>{const amount=Number(p.amount||p.price||0);const sel=selectedRechargePlan&&String(selectedRechargePlan.id)===String(p.id);const cat=rechargePlanCategory(p,i);const operator=rechargeOperator;const badge=cat==='popular'?'लोकप्रिय':cat==='top'?'टॉप पिक':cat==='data'?'डेटा':'अनलिमिटेड';return `<button type="button" class="recharge-plan recharge-plan-rich ${sel?'selected':''}" data-plan-id="${rechargeEscape(p.id)}"><div class="plan-brand-row"><span class="plan-brand ${operator.toLowerCase()}">${rechargeEscape(operator==='AIRTEL'?'airtel':operator==='VI'?'Vi':operator)}</span><span class="plan-badge">${badge}</span></div><div class="plan-price">₹${rechargeEscape(amount)}</div><div class="plan-meta"><span>${rechargeEscape(p.data||p.data_benefit||'Data details')}</span><span>${rechargeEscape(p.validity||p.validity_days||'—')}</span></div><b>${rechargeEscape(p.calls||p.voice||'Unlimited Calls')}</b><p>✓ ${rechargeEscape(p.sms||p.sms_benefit||'100 SMS/Day')} ${live?'· LIVE PLAN':''}</p><span class="plan-select">चुनें →</span></button>`}).join('');grid.querySelectorAll('[data-plan-id]').forEach(btn=>btn.addEventListener('click',()=>{const p=arr.find(x=>String(x.id)===String(btn.dataset.planId));if(p)selectRechargePlan(p,arr,live)}))}
function getSelectedRechargePlan(){
  if(selectedRechargePlan)return selectedRechargePlan;
  const id=document.querySelector('#rechargePlanGrid .recharge-plan.selected')?.dataset?.planId;
  if(!id)return null;
  return rechargePlanCatalog.find(x=>String(x.id)===String(id))||null;
}
function syncRechargeAmount(){
  const p=getSelectedRechargePlan();
  const amount=Number(p?.amount||p?.price||0);
  if($('#rechargePayable'))$('#rechargePayable').textContent='₹'+(Number.isFinite(amount)?amount:0).toFixed(0);
  if($('#rechargeSidePlan'))$('#rechargeSidePlan').textContent=amount?'₹'+amount:'—';
  if($('#rechargeSideTotal'))$('#rechargeSideTotal').textContent=amount?'₹'+amount:'₹0';
  if($('#rechargePayButton'))$('#rechargePayButton').disabled=!amount;
  return {plan:p,amount:Number.isFinite(amount)?amount:0};
}
function selectRechargePlan(p,arr,realtime=false){selectedRechargePlan=p;renderRechargePlans(arr,realtime);const amount=Number(p.amount||p.price||0);if($('#rechargeSelectedPlan'))$('#rechargeSelectedPlan').innerHTML=`<b>₹${rechargeEscape(amount)}</b> · ${rechargeEscape(p.validity||'')} · ${rechargeEscape(p.data||'')}<br><small>${rechargeEscape(p.calls||'')} · ${rechargeEscape(p.sms||'')}</small>`;if($('#rechargePayable'))$('#rechargePayable').textContent='₹'+amount.toFixed(0);if($('#rechargeSidePlan'))$('#rechargeSidePlan').textContent='₹'+amount;if($('#rechargeSideTotal'))$('#rechargeSideTotal').textContent='₹'+amount;if($('#rechargePayButton'))$('#rechargePayButton').disabled=!amount}
async function loadRechargePlans(){const state=$('#rechargeLiveState'),grid=$('#rechargePlanGrid');if(!grid)return;selectedRechargePlan=null;if($('#rechargePayable'))$('#rechargePayable').textContent='₹0';if($('#rechargeSelectedPlan'))$('#rechargeSelectedPlan').textContent='पहले Admin द्वारा जोड़ा गया plan चुनें।';if($('#rechargePayButton'))$('#rechargePayButton').disabled=true;grid.innerHTML='<div class=\"empty-state\">Admin-managed plans लोड हो रहे हैं…</div>';const circle=$('#rechargeCircle')?.value||'UP';try{const d=await api(`/api/recharge/plans?operator=${encodeURIComponent(rechargeOperator)}&type=${encodeURIComponent(rechargeType)}&circle=${encodeURIComponent(circle)}`);const plans=(d.plans||[]).map((x,i)=>({...x,category:x.category||['popular','data','unlimited','top'][i%4]}));renderRechargePlans(plans,false);if(state){state.textContent=plans.length?'Admin-managed plans':'Admin setup required';state.className=plans.length?'status-pill success':'status-pill pending'}if($('#rechargePlanHint'))$('#rechargePlanHint').textContent=plans.length?`Admin द्वारा configured ${plans.length} plan · ${rechargeOperator} · ${circle}`:'इस operator/type/circle के plans Admin panel में जोड़ना बाकी है। Sample/fallback prices नहीं दिखाए जाएँगे।'}catch(e){renderRechargePlans([],false);if(state){state.textContent='Plans unavailable';state.className='status-pill pending'}if($('#rechargePlanHint'))$('#rechargePlanHint').textContent='Plans अभी लोड नहीं हो सके। कृपया बाद में refresh करें।'}}
function initRechargePage(){if(rechargePageReady){loadRechargePlans();return}rechargePageReady=true;loadPaymentConfig();$('#rechargeOperators')?.querySelectorAll('[data-operator]').forEach(b=>b.addEventListener('click',()=>{rechargeOperator=b.dataset.operator;$('#rechargeOperators').querySelectorAll('[data-operator]').forEach(x=>x.classList.toggle('active',x===b));if($('#rechargeSideOperator'))$('#rechargeSideOperator').textContent=rechargeOperator==='AIRTEL'?'airtel':rechargeOperator==='VI'?'Vi':rechargeOperator;loadRechargePlans();}));document.querySelectorAll('#page-customer-recharge [data-recharge-type]').forEach(b=>b.addEventListener('click',()=>{rechargeType=b.dataset.rechargeType;document.querySelectorAll('#page-customer-recharge [data-recharge-type]').forEach(x=>x.classList.toggle('active',x===b));if($('#rechargeSideType'))$('#rechargeSideType').textContent=rechargeType==='PREPAID'?'Prepaid':'Postpaid';loadRechargePlans()}));document.querySelectorAll('#rechargePlanTabs [data-plan-filter]').forEach(b=>b.addEventListener('click',()=>{rechargePlanFilter=b.dataset.planFilter;document.querySelectorAll('#rechargePlanTabs [data-plan-filter]').forEach(x=>x.classList.toggle('active',x===b));renderRechargePlans(rechargePlanCatalog,false)}));$('#rechargeRefreshPlans')?.addEventListener('click',loadRechargePlans);$('#rechargeCircle')?.addEventListener('change',loadRechargePlans);$('#rechargeAutoDetect')?.addEventListener('click',()=>toast('Mobile number से operator auto-detect नहीं किया जाता। ऊपर सही operator manually चुनें।'));$('#rechargeCopyUpi')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(paymentConfig.upi_id||''));toast('UPI ID copied')}catch{toast('UPI ID: '+String(paymentConfig.upi_id||'UPI configuration unavailable'))}});$('#rechargeUpiOpen')?.addEventListener('click',()=>{const sync=syncRechargeAmount(),amount=sync.amount;const configuredUpi=String(paymentConfig.upi_id||'').trim();if(!configuredUpi)return toast('UPI configuration उपलब्ध नहीं है');if(!amount)return toast('पहले Recommended Plan चुनें।');const payee=encodeURIComponent(String(paymentConfig.payee_name||'Angelstore CSC'));const upi=`upi://pay?pa=${encodeURIComponent(configuredUpi)}&pn=${payee}&am=${amount.toFixed(2)}&cu=INR`;window.location.href=upi});document.querySelectorAll('#page-customer-recharge [data-recharge-scroll]').forEach(b=>b.addEventListener('click',()=>{const map={operator:'#rechargeOperators',plans:'#rechargePlanGrid',payment:'.payment-card',proof:'.verification-card',status:'.status-info-card'};document.querySelector(map[b.dataset.rechargeScroll])?.scrollIntoView({behavior:'smooth',block:'center'});}));$('#rechargeReceiptRecords')?.addEventListener('click',()=>go('customer-receipts'));$('#rechargeReceiptRecordsPanel')?.addEventListener('click',()=>go('customer-receipts'));$('#rechargeHistoryRecords')?.addEventListener('click',()=>go('customer-receipts'));$('#customerRechargeForm')?.addEventListener('submit',async(e)=>{e.preventDefault();if(rechargePaymentInFlight)return;const sync=syncRechargeAmount();selectedRechargePlan=sync.plan;const mobile=String($('#rechargeMobile')?.value||'').replace(/\D/g,'');const utr=String($('#rechargeUtr')?.value||'').trim();const file=$('#rechargePaymentScreenshot')?.files?.[0];if(!/^\d{10}$/.test(mobile))return toast('Valid 10 digit mobile number दर्ज करें।');if(!selectedRechargePlan)return toast('पहले Recommended Plan चुनें।');if(utr&&(utr.length<6||utr.length>40))return toast('UTR / Transaction Reference 6–40 characters रखें।');if(!utr&&!file)return toast('UTR या payment screenshot में से कम-से-कम एक दें।');if(file&&!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('केवल PNG/JPG/WEBP screenshot दें।');if(file&&file.size>5*1024*1024)return toast('Screenshot 5MB से छोटा रखें।');rechargePaymentInFlight=true;const btn=$('#rechargePayButton');if(btn)btn.disabled=true;if(!rechargePaymentIdempotencyKey)rechargePaymentIdempotencyKey=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():('recharge-'+Date.now()+'-'+Math.random().toString(36).slice(2));try{const screenshot=file?await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Screenshot read failed'));r.readAsDataURL(file)}):null;const d=await api('/api/customer/recharge/payment',{method:'POST',body:JSON.stringify({mobile,operator:rechargeOperator,type:rechargeType,circle:$('#rechargeCircle')?.value||'UP',plan:selectedRechargePlan,amount:Number(selectedRechargePlan.amount||selectedRechargePlan.price||0),utr,screenshot,idempotency_key:rechargePaymentIdempotencyKey})});$('#rechargeStatus').textContent=d.message||'Payment verification pending.';toast(d.message||'Payment verification pending.');if(d.payment?.id)localStorage.setItem('angelPaymentId',String(d.payment.id));rechargePaymentIdempotencyKey='';}catch(e){$('#rechargeStatus').textContent=e.message||'Payment submit नहीं हो पाया।';toast(e.message||'Payment submit नहीं हो पाया।')}finally{rechargePaymentInFlight=false;const amount=Number(selectedRechargePlan?.amount||selectedRechargePlan?.price||0);if(btn)btn.disabled=!amount}});loadRechargePlans()}
let uppclPageReady=false,uppclBill=null,uppclStatusTimer=null,uppclLookupInFlight=false,uppclPaymentInFlight=false,uppclPaymentIdempotencyKey='',uppclBillWatchTimer=null,uppclBillWatchUntil=0;
function setUppclFlowStep(el, state, label, detail){if(!el)return;el.className=state;const b=el.querySelector('b'),sm=el.querySelector('small');if(b)b.textContent=label;if(sm)sm.textContent=detail||'';}
function updateUppclStepbar(current){const spans=[...document.querySelectorAll('[data-uppcl-stepbar]')];spans.forEach((el,i)=>{const n=i+1;el.classList.toggle('active',n===current);el.classList.toggle('done',n<current);});}
function renderUppclFlow(payment){
  const flow=document.querySelector('#uppclFlow');if(!flow)return;
  const steps=[...flow.querySelectorAll('[data-flow-step]')];
  const status=String(payment?.status||'').toLowerCase();
  const processing=String(payment?.uppcl_processing_status||'').toLowerCase();
  const failed=status.includes('reject')||processing.includes('failed');
  const submitted=!!payment;
  if(payment?.receipt_no)updateUppclStepbar(4);else if(payment)updateUppclStepbar(4);
  const verified=status==='verified';
  const completed=processing==='completed';
  const receipt=!!payment?.receipt_no;
  const date=x=>x?new Date(x).toLocaleString('hi-IN',{dateStyle:'short',timeStyle:'short'}):'';
  setUppclFlowStep(steps[0],submitted?'done':'pending','Payment Submitted',submitted?date(payment.created_at):'UTR और proof submit होने के बाद');
  setUppclFlowStep(steps[1],failed?'error':verified?'done':submitted?'active':'pending',failed?'Payment Rejected':verified?'Admin Verification':'Admin Verification',failed?(payment.reject_reason||'Proof reject हुआ'):verified?date(payment.verified_at):'Admin verification pending');
  setUppclFlowStep(steps[2],failed?'error':completed?'done':verified?'active':'pending',failed?'Processing Failed':completed?'Bill Processing':'Bill Processing',failed?(payment.uppcl_process_note||'Processing नहीं हो पाया'):completed?(payment.uppcl_provider_ref||date(payment.completed_at)||'Completed'):verified?'Admin verification के बाद bill process होगा':'Verification के बाद शुरू होगा');
  setUppclFlowStep(steps[3],failed?'error':receipt?'done':completed?'active':'pending',failed?'Receipt नहीं बनी':receipt?'Receipt':'Receipt',failed?'Payment flow रोक दिया गया':receipt?payment.receipt_no:completed?'Generate हो रही है':'Bill complete होने के बाद');
  const note=$('#uppclFlowNote');if(note){note.className='uppcl-flow-note '+(failed?'error':receipt?'success':'');if(failed)note.innerHTML='⚠️ <b>'+escapeHtml(payment?.reject_reason||payment?.uppcl_process_note||'UPPCL payment process failed.')+'</b>';else if(receipt)note.innerHTML='✅ <b>Bill payment completed.</b> Receipt '+escapeHtml(payment.receipt_no)+' उपलब्ध है।';else if(verified)note.innerHTML='🔄 <b>Payment verified.</b> Admin अब UPPCL bill process करेगा।';else if(submitted)note.innerHTML='⏳ <b>Payment verification pending.</b> Admin proof check कर रहा है।';else {updateUppclStepbar(uppclBill?2:1);note.innerHTML='ℹ️ पहले Admin-approved bill देखें और payment proof submit करें।';}}
  const state=$('#uppclLiveState');if(state){state.textContent=failed?'Payment Failed':receipt?'Completed':verified?'Payment Verified':submitted?'Payment Submitted':'Manual Bill Entry';state.className='uppcl-status '+(failed?'error':(receipt||verified)?'success':'pending')}
  const statusBox=$('#uppclManualStatus');if(statusBox&&payment)statusBox.textContent=failed?(payment.reject_reason||payment.uppcl_process_note||'Payment process failed.'):receipt?`Payment completed. Receipt ${payment.receipt_no} generate हो गई है।`:verified?'Payment verified. Admin bill processing के बाद receipt मिलेगी।':'Payment verification Admin के पास pending है।';
  const receiptActions=$('#uppclReceiptActions');if(receipt)receiptActions&&(receiptActions.innerHTML=`<button type="button" class="uppcl-primary" id="uppclViewReceipt">🧾 Angelstore Receipt देखें</button><button type="button" class="uppcl-secondary" id="uppclPrintReceipt">🖨️ Print / PDF</button>${payment?.official_receipt_available?`<button type="button" class="uppcl-secondary" id="uppclOfficialReceipt">📄 Official Receipt देखें</button>`:''}`);else if(receiptActions)receiptActions.innerHTML='';
  if(receiptActions&&receipt){$('#uppclViewReceipt')?.addEventListener('click',()=>go('customer-receipts'));$('#uppclPrintReceipt')?.addEventListener('click',()=>{try{printReceipt(Number(payment.id),{payments:[payment]})}catch{toast('Receipt open नहीं हो सकी')}});$('#uppclOfficialReceipt')?.addEventListener('click',()=>{if(payment?.official_receipt_available){const ref=String(payment.official_receipt||'').split('/').pop();window.open('/api/customer/uppcl/official-receipt/'+encodeURIComponent(ref),'_blank','noopener,noreferrer')}else toast('Official receipt अभी उपलब्ध नहीं है')})}
  const panelStatus=$('#uppclReceiptPanelStatus'),panel=$('#uppclCustomerReceiptContent'),panelActions=$('#uppclCustomerReceiptActions');
  const panelReady=receipt&&completed&&payment?.status==='Verified';
  if(panelStatus){panelStatus.textContent=panelReady?'Receipt Available':(failed?'Payment Failed':completed?'Processing Complete':'Payment complete होने के बाद');panelStatus.className='uppcl-status '+(panelReady?'success':failed?'error':'pending')}
  if(panel)panel.innerHTML=panelReady?`<div class="uppcl-receipt-mini-ready"><b>ANGELSTORE CSC</b><strong>${escapeHtml(payment.receipt_no)}</strong><span>UPPCL Bill Payment · ₹${Number(payment.amount||0).toFixed(2)}</span><small>Payment completed and verified.</small></div>`:`<div class="uppcl-empty">${failed?'Payment failed/rejected होने के कारण receipt उपलब्ध नहीं है।':completed?'Payment complete है। Receipt तैयार होने के बाद यहाँ दिखाई जाएगी।':'Payment complete होने के बाद receipt यहाँ automatically दिखाई जाएगी।'}</div>`;
  if(panelActions)panelActions.innerHTML=panelReady?`<button type="button" class="uppcl-primary" id="uppclPanelViewReceipt">🧾 View Receipt</button><button type="button" class="uppcl-secondary" id="uppclPanelPdfReceipt">⬇️ PDF Download</button><button type="button" class="uppcl-secondary" id="uppclPanelPrintReceipt">🖨️ Print</button>`:'';
  if(panelReady){$('#uppclPanelViewReceipt')?.addEventListener('click',()=>go('customer-receipts'));$('#uppclPanelPdfReceipt')?.addEventListener('click',()=>downloadReceiptPdf(Number(payment.id)));$('#uppclPanelPrintReceipt')?.addEventListener('click',()=>{try{printReceipt(Number(payment.id),{payments:[payment]})}catch{toast('Receipt print नहीं हो सकी')}})}
}
function stopUppclStatusRefresh(){
  if(uppclStatusTimer){clearInterval(uppclStatusTimer);uppclStatusTimer=null}
}
async function refreshUppclPaymentStatus(){
  if(!hasCustomerLogin()||!document.getElementById('page-customer-uppcl')?.classList.contains('active-page'))return;
  const id=Number(localStorage.getItem('angelUppclPaymentId')||0);
  if(!id){stopUppclStatusRefresh();return}
  try{
    const d=await api('/api/customer/dashboard');
    const rows=Array.isArray(d.payments)?d.payments:[];
    const p=rows.find(x=>Number(x.id)===id);
    if(!p){renderUppclHistory(rows);return}
    renderUppclHistory(rows);
    renderUppclFlow(p);
    const terminal=String(p.status||'')==='Rejected'||String(p.uppcl_processing_status||'')==='Failed'||String(p.uppcl_processing_status||'')==='Completed';
    if(terminal)stopUppclStatusRefresh();
  }catch{}
}
function maybeStartUppclStatusRefresh(){
  if(!hasCustomerLogin())return;
  if(!document.getElementById('page-customer-uppcl')?.classList.contains('active-page'))return;
  const id=Number(localStorage.getItem('angelUppclPaymentId')||0);
  if(!id){stopUppclStatusRefresh();return}
  if(uppclStatusTimer)return;
  refreshUppclPaymentStatus();
  uppclStatusTimer=setInterval(refreshUppclPaymentStatus,5000);
}
async function loadUppclPaymentSettings(){try{const d=await api('/api/public-config');$('#uppclUpiId').textContent=d.upi_id||'Angelstore UPI';if(d.payment_qr_path)$('#uppclPaymentQr').src=d.payment_qr_path}catch{}}
function renderUppclHistory(rows){const box=$('#uppclHistoryMini');if(!box)return;const uppcl=(rows||[]).filter(x=>x.service==='UPPCL Bill Payment').slice(0,5);if(!uppcl.length){box.innerHTML='<div class="uppcl-empty">अभी कोई UPPCL payment history नहीं है।</div>';return}box.innerHTML=uppcl.map(p=>{const st=String(p.status||'Pending Verification').toLowerCase();const proc=String(p.uppcl_processing_status||'').toLowerCase();const cls=st.includes('verified')?'verified':(st.includes('reject')||proc.includes('failed'))?'rejected':'pending';const label=proc==='completed'?'Bill Paid':p.status||'Pending';return `<div class="uppcl-history-row"><div><b>₹${Number(p.amount||0).toFixed(2)}</b><small>${escapeHtml(p.uppcl_bill_month||p.offer_title||'UPPCL Bill')}</small></div><div class="uppcl-history-status ${cls}">${escapeHtml(label)}</div><div><small>${p.created_at?new Date(p.created_at).toLocaleDateString('hi-IN'):'—'}</small><small>${p.utr?'UTR ••••'+escapeHtml(String(p.utr).slice(-4)):'UTR —'}</small></div></div>`}).join('')}
async function loadUppclHistory(){if(!hasCustomerLogin()){renderUppclHistory([]);renderUppclFlow(null);stopUppclStatusRefresh();return}try{const d=await api('/api/customer/dashboard');const rows=d.payments||[];renderUppclHistory(rows);if(uppclBill){const billRows=rows.filter(x=>x.service==='UPPCL Bill Payment'&&Number(x.uppcl_bill_id||0)===Number(uppclBill.id||0)&&Number(x.uppcl_bill_version||0)===Number(uppclBill.version||0));const verifiedPaid=billRows.filter(x=>x.status==='Verified').reduce((a,x)=>a+Number(x.amount||0),0);const total=Number(uppclBill.total||0);const summary=$('#uppclPaymentSummary');if(summary)summary.textContent='Verified Paid: ₹'+verifiedPaid.toFixed(2)+' · Remaining: ₹'+Math.max(0,total-verifiedPaid).toFixed(2)+' · Advance: ₹'+Math.max(0,verifiedPaid-total).toFixed(2)}const savedId=Number(localStorage.getItem('angelUppclPaymentId')||0);const p=(savedId&&rows.find(x=>Number(x.id)===savedId))||rows.find(x=>x.service==='UPPCL Bill Payment');if(p){localStorage.setItem('angelUppclPaymentId',String(p.id));renderUppclFlow(p);maybeStartUppclStatusRefresh()}else renderUppclFlow(null)}catch{renderUppclHistory([])}}
function updateUppclSubmitState(){const utr=String($('#uppclUtr')?.value||'').trim(),file=$('#uppclPaymentScreenshot')?.files?.[0],amount=Number($('#uppclPaymentAmount')?.value||0);const validUtr=!utr||(utr.length>=6&&utr.length<=40);const validFile=!file||(file&&['application/pdf','image/png','image/jpeg'].includes(file.type)&&file.size<=5*1024*1024);const b=$('#uppclSubmitPayment');if(b)b.disabled=!(uppclBill&&Number.isFinite(amount)&&amount>0&&validUtr&&validFile&&(utr||file))}
function initUppclPage(){if(uppclPageReady){loadUppclPaymentSettings();loadUppclHistory();return}uppclPageReady=true;updateUppclStepbar(1);loadUppclPaymentSettings();loadUppclHistory();document.querySelectorAll('input[name="uppclSearchMode"]').forEach(r=>r.addEventListener('change',()=>{const mobile=r.value==='mobile';$('#uppclAccountWrap')?.classList.toggle('hidden',mobile);$('#uppclMobileWrap')?.classList.toggle('hidden',!mobile);updateUppclLookupButton()}));$('#uppclConsumerForm')?.addEventListener('submit',e=>{e.preventDefault();fetchUppclBill()});$('#uppclAccount')?.addEventListener('input',e=>{e.currentTarget.removeAttribute('aria-invalid');updateUppclLookupButton()});$('#uppclMobile')?.addEventListener('input',e=>{e.currentTarget.removeAttribute('aria-invalid');updateUppclLookupButton()});$('#uppclCopyUpi')?.addEventListener('click',async()=>{const v=$('#uppclUpiId')?.textContent||'';try{await navigator.clipboard.writeText(v);toast('UPI ID copied')}catch{toast(v)}});$('#uppclUpiOpen')?.addEventListener('click',()=>{const amount=Number($('#uppclPaymentAmount')?.value||uppclBill?.total||0);if(!amount)return toast('पहले payment amount चुनें।');const upi=$('#uppclUpiId')?.textContent?.trim()||String(paymentConfig.upi_id||'').trim();window.location.href=`upi://pay?pa=${encodeURIComponent(upi)}&pn=Angelstore%20CSC&am=${amount.toFixed(2)}&cu=INR`});$('#uppclProofForm')?.addEventListener('submit',e=>{e.preventDefault();if(uppclPaymentInFlight)return;submitUppclManualPayment()});$('#uppclUtr')?.addEventListener('input',updateUppclSubmitState);$('#uppclPaymentAmount')?.addEventListener('input',()=>{const v=Number($('#uppclPaymentAmount')?.value||0);if(Number.isFinite(v)&&v>0)$('#uppclManualAmount').textContent=v.toFixed(2);updateUppclSubmitState()});$('#uppclFullAmount')?.addEventListener('click',()=>{if(uppclBill){$('#uppclPaymentAmount').value=Number(uppclBill.total||0).toFixed(2);$('#uppclManualAmount').textContent=Number(uppclBill.total||0).toFixed(2);updateUppclSubmitState()}});$('#uppclPaymentScreenshot')?.addEventListener('change',e=>{const f=e.target.files?.[0],box=$('#uppclUploadPreview');if(!box)return;if(!f){box.innerHTML='';updateUppclSubmitState();return}if(!['application/pdf','image/png','image/jpeg'].includes(f.type)||f.size>5*1024*1024){box.textContent='Invalid file. PDF/JPG/JPEG/PNG, max 5MB.';updateUppclSubmitState();return}const r=new FileReader();r.onload=()=>{box.innerHTML=f.type==='application/pdf'?`<div class="uppcl-file-preview"><span>📄 PDF: ${escapeHtml(f.name)}</span></div>`:`<div class="uppcl-file-preview"><img src="${r.result}" alt="Payment proof preview"><span>${escapeHtml(f.name)}</span></div>`};r.readAsDataURL(f);updateUppclSubmitState()});$('#uppclHistoryRefresh')?.addEventListener('click',loadUppclHistory);$('#uppclQuickBill')?.addEventListener('click',()=>{document.querySelector('#uppclConsumerForm')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('#uppclAccount')?.focus(),250)});$('#uppclQuickHistory')?.addEventListener('click',()=>$('#uppclHistoryMini')?.scrollIntoView({behavior:'smooth',block:'center'}));$('#uppclQuickVerify')?.addEventListener('click',()=>$('#uppclFlowCard')?.scrollIntoView({behavior:'smooth',block:'center'}));$('#uppclQuickHelp')?.addEventListener('click',()=>{go('customer-help');setTimeout(()=>$('#customerHelpSearch')?.focus(),250);});document.querySelectorAll('#smartMeterAmounts [data-amount]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#smartMeterAmounts [data-amount]').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));$('#smartMeterRecharge')?.addEventListener('click',()=>toast('Smart Meter provider/API configure होने पर recharge शुरू होगा.'))}
function updateUppclLookupButton(){const mode=document.querySelector('input[name="uppclSearchMode"]:checked')?.value||'account';const v=String((mode==='mobile'?$('#uppclMobile')?.value:$('#uppclAccount')?.value)||'').replace(/\D/g,'');const b=$('#uppclFetchBill');if(b)b.disabled=mode==='mobile'?!/^\d{10}$/.test(v):!/^\d{6,30}$/.test(v);}
function stopUppclBillWatch(){if(uppclBillWatchTimer){clearInterval(uppclBillWatchTimer);uppclBillWatchTimer=null}uppclBillWatchUntil=0}
function startUppclBillWatch(){if(uppclBillWatchTimer)return;uppclBillWatchUntil=Date.now()+10*60*1000;uppclBillWatchTimer=setInterval(()=>{if(Date.now()>uppclBillWatchUntil){stopUppclBillWatch();return}fetchUppclBill(true)},5000)}
async function fetchUppclBill(silent=false){
if(uppclLookupInFlight)return;
const mode=document.querySelector('input[name="uppclSearchMode"]:checked')?.value||'account';
const value=String((mode==='mobile'?$('#uppclMobile')?.value:$('#uppclAccount')?.value)||'').replace(/\D/g,'').trim();
if(mode==='mobile'&&!/^\d{10}$/.test(value)){const el=mode==='mobile'?$('#uppclMobile'):$('#uppclAccount');el?.setAttribute('aria-invalid','true');return toast('Valid 10 digit Registered Mobile दर्ज करें।');}
if(mode==='account'&&!/^\d{6,30}$/.test(value)){const el=$('#uppclAccount');el?.setAttribute('aria-invalid','true');return toast('Valid numeric Account Number (6–30 digits) दर्ज करें।');}
const btn=$('#uppclFetchBill'),form=$('#uppclConsumerForm'),status=$('#uppclStatus');
uppclLookupInFlight=true;
if(form)form.setAttribute('aria-busy','true');
if(status){status.setAttribute('aria-busy','true');status.textContent='Admin server से bill खोजा जा रहा है…'}
if(btn){btn.disabled=true;btn.textContent='⏳ Bill खोज रहे हैं…'}
try{
  const district=String($('#uppclDistrict')?.value||'').trim(),discom=String($('#uppclDiscom')?.value||'').trim();
  const d=await api(`/api/customer/uppcl/manual-bill?mode=${encodeURIComponent(mode)}&value=${encodeURIComponent(value)}&district=${encodeURIComponent(district)}&discom=${encodeURIComponent(discom)}`);
  const b=d.bill||{};
  const currentBill=Number(b.current_bill||0),arrear=Number(b.arrear||0),lateFee=Number(b.late_fee||0),total=Number(b.total_payable||0);
  if(!Number.isFinite(total)||total<=0)throw new Error('Admin bill में valid Total Payable उपलब्ध नहीं है।');
  uppclBill={id:Number(b.id||0),version:Number(b.version||1),consumer_name:String(b.consumer_name||''),account:String(b.account||''),registered_mobile:String(b.registered_mobile||''),bill_number:String(b.bill_number||''),bill_month:String(b.bill_month||''),due_date:String(b.due_date||''),current_bill:currentBill,arrear,late_fee:lateFee,total,district:String(b.district||$('#uppclDistrict')?.value||''),discom:String(b.discom||$('#uppclDiscom')?.value||'')};
  $('#uppclBillCard')?.classList.remove('hidden','is-locked');$('#uppclManualPaymentBox')?.classList.remove('hidden','is-locked');$('#uppclProofCard')?.classList.remove('hidden','is-locked');$('#uppclPaymentLockNote')?.classList.add('hidden');$('#uppclProofLockNote')?.classList.add('hidden');$('#uppclFlowCard')?.classList.add('visible');$('#uppclPreBillHint')?.classList.add('hidden');
  $('#uppclConsumerName').textContent=b.consumer_name||'—';$('#uppclAccountView').textContent=b.account||value;$('#uppclBillNumber').textContent=b.bill_number||'—';$('#uppclBillMonth').textContent=b.bill_month||'—';$('#uppclDueDate').textContent=b.due_date||'—';$('#uppclCurrentBill').textContent='₹'+currentBill.toFixed(2);$('#uppclArrear').textContent='₹'+arrear.toFixed(2);$('#uppclLateFee').textContent='₹'+lateFee.toFixed(2);$('#uppclTotal').textContent='₹'+total.toFixed(2);$('#uppclPaymentSummary').textContent='Verified Paid: ₹'+Number(b.verified_paid||0).toFixed(2)+' · Remaining: ₹'+Number(b.remaining||0).toFixed(2)+' · Advance: ₹'+Number(b.advance||0).toFixed(2);$('#uppclManualAmount').textContent=total.toFixed(2);$('#uppclPaymentAmount').value=total.toFixed(2);$('#uppclAmountHint').textContent='Full ₹'+total.toFixed(2) + ' या कोई Custom/Advance amount चुनें।';$('#uppclSubmitPayment').disabled=true;
  stopUppclBillWatch();updateUppclStepbar(2);$('#uppclLiveState').textContent='Bill Available';$('#uppclLiveState').className='uppcl-status success';$('#uppclStatus').textContent='Admin सर्वर से उपलब्ध वास्तविक bill details दिखाए जा रहे हैं।';$('#uppclManualStatus').textContent='Full, Custom या Advance amount का payment करें। UTR, screenshot या दोनों में से कम-से-कम एक proof दें।';$('#uppclBillCard')?.classList.remove('is-locked');$('#uppclBillStatus').textContent='Bill Available';$('#uppclBillStatus').className='uppcl-status success';$('#uppclUtr').value='';$('#uppclPaymentScreenshot').value='';$('#uppclPaymentAmount').value=total.toFixed(2);updateUppclSubmitState();$('#uppclUploadPreview').innerHTML='';renderUppclFlow(null);toast('Admin सर्वर का bill मिल गया।');
}catch(e){$('#uppclBillCard')?.classList.remove('hidden');$('#uppclBillCard')?.classList.add('is-locked');$('#uppclManualPaymentBox')?.classList.remove('hidden');$('#uppclManualPaymentBox')?.classList.add('is-locked');$('#uppclProofCard')?.classList.remove('hidden');$('#uppclProofCard')?.classList.add('is-locked');$('#uppclPaymentLockNote')?.classList.remove('hidden');$('#uppclProofLockNote')?.classList.remove('hidden');$('#uppclPreBillHint')?.classList.remove('hidden');if(e.status===404){try{await api('/api/customer/uppcl/bill-request',{method:'POST',body:JSON.stringify({account:value,district,discom})})}catch{}if(status)status.textContent='Bill अभी Admin द्वारा update किया जा रहा है। Update होते ही Bill Details यहाँ अपने-आप दिखाई जाएँगी।';if(!silent)toast('Bill अभी Admin के पास pending है। Admin update करते ही Bill Details अपने-आप दिखेंगी।');startUppclBillWatch()}else{if(status)status.textContent=e.message||'Bill उपलब्ध नहीं है।';if(!silent)toast(e.message||'Bill उपलब्ध नहीं है।')}}finally{uppclLookupInFlight=false;if(form)form.setAttribute('aria-busy','false');if(status)status.setAttribute('aria-busy','false');if(btn){updateUppclLookupButton();btn.textContent='🧾  Bill देखें'}}}
async function submitUppclManualPayment(){
if(uppclPaymentInFlight)return;if(!uppclBill)return toast('पहले bill देखें।');
const utr=String($('#uppclUtr')?.value||'').trim(),file=$('#uppclPaymentScreenshot')?.files?.[0],amount=Number($('#uppclPaymentAmount')?.value||0),utrEl=$('#uppclUtr'),fileEl=$('#uppclPaymentScreenshot'),form=$('#uppclProofForm'),status=$('#uppclManualStatus');
if(!Number.isFinite(amount)||amount<=0)return toast('Valid payment amount दर्ज करें।');
if(utr&&(utr.length<6||utr.length>40)){utrEl?.setAttribute('aria-invalid','true');return toast('UTR / Transaction Reference 6–40 characters रखें।');}
if(!utr&&!file)return toast('UTR या payment screenshot में से कम-से-कम एक दें।');
if(file&&(!['application/pdf','image/png','image/jpeg'].includes(file.type)||file.size>5*1024*1024)){fileEl?.setAttribute('aria-invalid','true');return toast('Payment proof PDF/JPG/JPEG/PNG और 5MB से छोटा रखें।');}
utrEl?.removeAttribute('aria-invalid');fileEl?.removeAttribute('aria-invalid');
const btn=$('#uppclSubmitPayment');if(btn)btn.disabled=true;uppclPaymentInFlight=true;
if(!uppclPaymentIdempotencyKey)uppclPaymentIdempotencyKey=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():('uppcl-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-retry');
if(form)form.setAttribute('aria-busy','true');if(status){status.setAttribute('aria-busy','true');status.textContent='Payment proof submit किया जा रहा है…'}
try{
 let screenshot='';
 if(file)screenshot=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Screenshot read failed'));r.readAsDataURL(file)});
 const d=await api('/api/customer/uppcl/payment',{method:'POST',body:JSON.stringify({account:uppclBill.account||$('#uppclAccount')?.value||'',bill_id:Number(uppclBill.id||0),bill_version:Number(uppclBill.version||0),amount,bill_month:uppclBill.bill_month||'',due_date:uppclBill.due_date||'',current_bill:Number(uppclBill.current_bill||0),arrear:Number(uppclBill.arrear||0),late_fee:Number(uppclBill.late_fee||0),consumer_name:uppclBill.consumer_name||'',district:uppclBill.district||$('#uppclDistrict')?.value||'',discom:uppclBill.discom||$('#uppclDiscom')?.value||'',utr,screenshot,idempotency_key:uppclPaymentIdempotencyKey})});
 if(d.payment?.id){localStorage.setItem('angelUppclPaymentId',String(d.payment.id));localStorage.setItem('angelPaymentId',String(d.payment.id))}uppclPaymentIdempotencyKey='';$('#uppclManualStatus').textContent=d.message||'Payment verification pending.';$('#uppclSubmitPayment').disabled=true;updateUppclStepbar(4);renderUppclFlow(d.payment||null);maybeStartUppclStatusRefresh();toast(d.message||'Payment verification pending.');await loadUppclHistory();
}catch(e){$('#uppclManualStatus').textContent=e.message||'Payment submission failed.';updateUppclSubmitState();toast(e.message||'Payment submission failed.')}finally{uppclPaymentInFlight=false;if(form)form.setAttribute('aria-busy','false');if(status)status.setAttribute('aria-busy','false');}}

function clock(){const d=new Date();$('#customerClock').textContent=d.toLocaleString('hi-IN',{dateStyle:'medium',timeStyle:'short'});setTimeout(clock,1000)}clock();refreshAll();

$('#refreshNotifications').onclick=()=>loadCustomerNotifications();$('#markAllNotifications').onclick=async()=>{try{await api('/api/customer/notifications/read',{method:'POST',body:JSON.stringify({})});loadCustomerNotifications()}catch(e){toast(e.message)}};

// STEP366: Application Tracking — Application ID only, no customer data exposed.
async function trackApplication(){
  const ref=String($('#trackingApplicationId')?.value||'').trim();
  const statusEl=$('#trackingStatus'),panel=$('#applicationTrackingResult');
  if(!ref){if(statusEl)statusEl.textContent='Application ID दर्ज करें।';return;}
  if(statusEl)statusEl.textContent='Application status खोजा जा रहा है…';
  try{
    const d=await api('/api/customer/track?ref='+encodeURIComponent(ref));
    const x=d.result||{};
    if(panel)panel.style.display='block';
    if($('#trackingRef'))$('#trackingRef').textContent=x.reference||ref;
    if($('#trackingService'))$('#trackingService').textContent=x.service||'—';
    if($('#trackingCurrentStatus'))$('#trackingCurrentStatus').textContent=x.status||'—';
    const steps=Array.isArray(x.steps)?x.steps:[];
    const idx=Math.max(0,steps.findIndex(s=>s.id===x.current_step));
    if($('#applicationTimeline'))$('#applicationTimeline').innerHTML=steps.map((st,i)=>{
      const done=!!st.done, active=i===idx&&!done;
      const cls=done?'done':(active?'active':'pending');
      const dt=st.date?new Date(st.date).toLocaleString('hi-IN'):'';
      return `<div class="application-step ${cls}"><div class="application-step-marker">${done?'✓':(i+1)}</div><div><b>${escapeHtml(st.label||'')}</b>${dt?`<small>${escapeHtml(dt)}</small>`:''}</div></div>`;
    }).join('');
    if(statusEl)statusEl.textContent='Application tracking updated.';
  }catch(e){
    if(panel)panel.style.display='none';
    if(statusEl)statusEl.textContent=e.message||'Application ID नहीं मिला।';
  }
}
$('#trackApplicationButton')?.addEventListener('click',trackApplication);
$('#trackingApplicationId')?.addEventListener('keydown',e=>{if(e.key==='Enter')trackApplication()});

// STEP481: deterministic deep-link boot so #customer-status opens the replacement page.
const initialPage=(location.hash||'').replace(/^#/,'');
if(initialPage && document.getElementById('page-'+initialPage)) go(initialPage);
else initStatusReferenceShell();

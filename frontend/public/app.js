/* =========================================================
   STORMS app.js – v6
   ========================================================= */
'use strict';

const API = '';

const MONTHS_SK = ['Január','Február','Marec','Apríl','Máj','Jún',
  'Júl','August','September','Október','November','December'];

const State = {
  token:null, user:null, tab:'dashboard',
  zakazky:{ page:1, perPage:25, sortCol:'created_at', sortDir:'desc',
    filters:{ q:'', stav:'', typ_prod:'', zdroj:'', obchod:'', mesiac:'' } },
  servis:{ page:1, perPage:25, sortCol:'created_at', sortDir:'desc',
    filters:{ q:'', typ:'', zaruka:'', obchod:'', mesiac:'' } },
  editingZakazkaId:null, editingServisId:null,
  importType:null, importBuffer:null,
};

const $ = id => document.getElementById(id);
const isPrivileged = () => ['owner','admin'].includes(State.user?.role);
const canWrite = () => ['store','admin','owner'].includes(State.user?.role);

/* ── Formatters ───────────────────────────────────────────── */
const fmtEur = n => { const v=parseFloat(n); if(!v&&v!==0||isNaN(v)) return '—'; return v.toLocaleString('sk-SK',{minimumFractionDigits:0,maximumFractionDigits:2})+' €'; };
const fmtPct = n => { const v=parseFloat(n); return isNaN(v)?'':v.toFixed(1)+' %'; };
const fmtNum = n => { const v=parseFloat(n); return isNaN(v)?'—':v.toLocaleString('sk-SK',{minimumFractionDigits:0,maximumFractionDigits:2}); };

/* ── Notify ───────────────────────────────────────────────── */
function notify(msg, type='success') {
  $('notif').className=`notif show ${type}`;
  $('notifText').textContent=msg;
  clearTimeout(notify._t);
  notify._t=setTimeout(()=>$('notif').classList.remove('show'),3200);
}
function loading(v){ $('loadingOverlay').classList.toggle('show',v); }

/* ── API ──────────────────────────────────────────────────── */
async function api(method,path,body){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(State.token) opts.headers['Authorization']='Bearer '+State.token;
  if(body!==undefined) opts.body=JSON.stringify(body);
  const res=await fetch(API+path,opts);
  const data=await res.json();
  if(!res.ok) throw new Error(data.error||'API chyba');
  return data;
}

/* ── Badges ───────────────────────────────────────────────── */
const STAV_CLS={Dopyt:'dopyt',Obhliadka:'obhliadka',Ponuka:'ponuka',Objednané:'objednane',Realizované:'realizovane',Storno:'storno'};
const badge=(t,c)=>`<span class="badge badge-${c}"><span class="badge-dot"></span>${t||'—'}</span>`;
const stavBadge=s=>s?badge(s,STAV_CLS[s]||'dopyt'):'<span class="badge badge-store">—</span>';
const storeBadge=s=>s?`<span class="badge badge-store">${s}</span>`:'—';

/* ── Modals ───────────────────────────────────────────────── */
const openModal=id=>$(id).classList.add('open');
const closeModal=id=>$(id).classList.remove('open');
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));});

/* ── Month filter select HTML ─────────────────────────────── */
function monthOptions(val='') {
  const now = new Date();
  let opts = `<option value="">Všetky mesiace</option>`;
  for(let i=0;i<12;i++){
    const y=now.getFullYear(), m=String(i+1).padStart(2,'0');
    const v=`${y}-${m}`;
    opts+=`<option value="${v}" ${val===v?'selected':''}>${MONTHS_SK[i]} ${y}</option>`;
  }
  // Add previous year months
  for(let i=0;i<12;i++){
    const y=now.getFullYear()-1, m=String(i+1).padStart(2,'0');
    const v=`${y}-${m}`;
    opts+=`<option value="${v}" ${val===v?'selected':''}>${MONTHS_SK[i]} ${y}</option>`;
  }
  return opts;
}

/* ── Login ────────────────────────────────────────────────── */
let tempAuthToken = null;

async function doLoginStep1() {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  const err = $('loginError1'); 
  err.classList.add('d-none');

  if (!username || !password) { err.textContent = 'Zadajte prihlasovacie meno a heslo.'; err.classList.remove('d-none'); err.style.display = 'block'; return; }

  loading(true);
  try {
    const data = await api('POST', '/api/auth/login', { username, password });
    if (data.complete) return finishLogin(data.token, data.user);
    
    tempAuthToken = data.tempToken;
    $('loginStep1').classList.add('d-none');
    $('loginStep2').classList.remove('d-none');
    $('loginTotp').value = '';
    $('loginError2').style.display = 'none';
    setTimeout(() => $('loginTotp').focus(), 100);

    if (data.requireSetup) {
      $('setup2faBox').classList.remove('d-none');
      $('verify2faBox').classList.add('d-none');
      $('qrImage').src = data.qrImage;
    } else {
      $('setup2faBox').classList.add('d-none');
      $('verify2faBox').classList.remove('d-none');
    }
  } catch (e) { 
    err.textContent = e.message || 'Nesprávne prihlasovacie údaje. Skúste znova.'; 
    err.classList.remove('d-none'); 
    err.style.display = 'block'; 
    $('loginPassword').value = ''; 
    $('loginPassword').focus(); 
  } 
  finally { loading(false); }
}

async function doLoginStep2() {
  const totp_code = $('loginTotp').value.trim();
  const rememberMe = $('rememberMe').checked;
  const err = $('loginError2'); 
  err.classList.add('d-none');

  if (!totp_code || totp_code.length < 6) { err.textContent = 'Zadajte 6-miestny kód.'; err.classList.remove('d-none'); err.style.display = 'block'; return; }

  loading(true);
  try {
    const data = await api('POST', '/api/auth/verify-2fa', { tempToken: tempAuthToken, totp_code, rememberMe });
    finishLogin(data.token, data.user);
  } catch (e) {
    const msg = e.message || '';
    if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('nesprávny') || msg.toLowerCase().includes('wrong') || msg.toLowerCase().includes('expired')) {
      err.textContent = 'Nesprávny kód. Skontrolujte čas v autentifikačnej aplikácii a skúste znova.';
    } else {
      err.textContent = msg || 'Nesprávny overovací kód. Skúste znova.';
    }
    err.classList.remove('d-none');
    err.style.display = 'block';
    $('loginTotp').value = '';
    $('loginTotp').focus();
  }
  finally { loading(false); }
}

function finishLogin(token, user) {
  localStorage.setItem('storms_token', token);
  localStorage.setItem('storms_user', JSON.stringify(user));
  location.reload(); 
}

$('loginBtnStep1').addEventListener('click', doLoginStep1);
$('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLoginStep1(); });
$('loginBtnStep2').addEventListener('click', doLoginStep2);
$('loginTotp').addEventListener('keydown', e => { if (e.key === 'Enter') doLoginStep2(); });

$('btnBackToLogin')?.addEventListener('click', () => {
  $('loginStep2').classList.add('d-none');
  $('loginStep1').classList.remove('d-none');
  tempAuthToken = null;
});

$('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('storms_token'); 
  localStorage.removeItem('storms_user');
  location.reload(); 
});

(()=>{
  const t = localStorage.getItem('storms_token'), u = localStorage.getItem('storms_user');
  if(t && u){
    State.token = t; State.user = JSON.parse(u);
    api('GET','/api/auth/me').then(me => {
      State.user = me; 
      localStorage.setItem('storms_user', JSON.stringify(me)); 
      initApp();
    }).catch(() => {
      localStorage.removeItem('storms_token');
      localStorage.removeItem('storms_user');
    });
  }
})();

/* ── Init App ─────────────────────────────────────────────── */
function initApp(){
  $('loginScreen').style.display = 'none';
  $('appShell').classList.add('visible');
  const u = State.user;

  const roleMap = {owner:'Konateľ', admin:'Admin / Správca', store:'Pobočka'};
  $('topbarUsername').textContent = u.username || '';
  $('topbarRole').textContent = roleMap[u.role] || '';

  // Store name shown inline below username
  const storeSep  = $('topbarStoreSep');
  const storeName = $('topbarStoreName');
  if (u.role === 'store' && u.store) {
    storeSep.classList.remove('d-none');
    storeName.classList.remove('d-none');
    storeName.textContent = u.store.split(',').map(s => s.replace('Obchod ','')).join(', ');
  } else {
    storeSep.classList.add('d-none');
    storeName.classList.add('d-none');
  }

  // Legacy badge compatibility
  const badge = $('storeBadgeWrap');
  if (badge) badge.style.display = 'none';
  if(u.role === 'store' && u.store){
  }

  // 1. NAJPRV aktivujeme klikanie a odkryjeme všetky záložky
  document.querySelectorAll('[data-tab]').forEach(t => {
    t.classList.remove('d-none');
    t.addEventListener('click', () => { showTab(t.dataset.tab); closeMobileNav(); });
  });

  // 2. AŽ POTOM skryjeme tie, na ktoré nemá užívateľ právo
  // Používatelia (iba pre Majiteľa a Admina)
  if (u.role === 'admin') {
    // ADMIN / SPRÁVCA: Vidí iba sekciu Používatelia
    ['dashboard', 'zakazky', 'servis'].forEach(tab => {
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach(t => t.classList.add('d-none'));
    });
    showTab('users');
  }
  else if (u.role === 'owner') {
    // KONATEĽ: Vidí všetko vrátane Používateľov
    showTab('dashboard');
  }
  else {
    // POBOČKA: Vidí zákazky, servis, profil — NIE dashboard overview ani používateľov
    document.querySelectorAll('[data-tab="users"]').forEach(t => t.classList.add('d-none'));
    document.querySelectorAll('[data-tab="dashboard"]').forEach(t => t.classList.add('d-none'));
    showTab('zakazky');
  }

  ['z_obchod_group','s_obchod_group'].forEach(id => {
    const el = $(id);
    if (el) {
      // Zobraz roletku "Obchod", ak je to admin/owner, ALEBO ak je to pobočka s viacerými pridelenými obchodmi
      const canSelectStore = ['owner','admin'].includes(u.role) || (u.role === 'store' && u.store && u.store.includes(','));
      el.classList.toggle('d-none', !canSelectStore);
    }
  });

  const ham=$('hamburger');
  if(ham) ham.addEventListener('click',toggleMobileNav);
  $('navMobileOverlay')?.addEventListener('click',closeMobileNav);
}

function toggleMobileNav(){
  const nav=$('navMobile'),ham=$('hamburger'),ov=$('navMobileOverlay');
  const open=nav.classList.toggle('open');
  ham.classList.toggle('open',open); ov.classList.toggle('open',open);
}
function closeMobileNav(){
  $('navMobile')?.classList.remove('open');
  $('hamburger')?.classList.remove('open');
  $('navMobileOverlay')?.classList.remove('open');
}

/* ── Tabs ─────────────────────────────────────────────────── */
/* ── Tabs ─────────────────────────────────────────────────── */
function showTab(tabId) {
    State.tab = tabId;

    ['dashboard', 'zakazky', 'servis', 'users', 'profil'].forEach(t => {
        const el = $('view-' + t);
        if (el) { el.classList.add('d-none'); el.style.display = 'none'; }
    });

    const activeEl = $('view-' + tabId);
    if (activeEl) {
        activeEl.classList.remove('d-none');
        activeEl.style.display = 'block';
    }

    // Zvýrazni aktívnu záložku v oboch navigáciách (desktop aj mobile)
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });

    if (tabId === 'users' && typeof loadUsers === 'function') loadUsers();
    if (tabId === 'zakazky' && typeof renderZakazky === 'function') renderZakazky();
    if (tabId === 'servis' && typeof renderServis === 'function') renderServis();
    if (tabId === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
    if (tabId === 'profil' && typeof renderProfil === 'function') renderProfil();
}


/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */

/* ── Dashboard widget prefs (uložené v localStorage per user) ── */
const DASH_WIDGETS_KEY = () => `dash_widgets_${State.user?.id||'x'}`;
const DASH_WIDGETS_DEFAULT = {
  z_kpi: true, stav_chips: true, s_kpi: true,
  zdroj_chart: true, prod_chart: true,
  store_cards: true, store_charts: true
};
function getDashWidgets() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASH_WIDGETS_KEY())||'{}');
    return Object.assign({}, DASH_WIDGETS_DEFAULT, saved);
  } catch(e) { return {...DASH_WIDGETS_DEFAULT}; }
}
function setDashWidget(key, val) {
  const prefs = getDashWidgets();
  prefs[key] = val;
  localStorage.setItem(DASH_WIDGETS_KEY(), JSON.stringify(prefs));
}

async function renderDashboard(){
  const el=$('view-dashboard');
  el.innerHTML='<div style="padding:48px;text-align:center;color:var(--muted);font-size:13px">Načítavam...</div>';
  try{
    const d=await api('GET','/api/dashboard');
    if(isPrivileged()) {
      renderPrivDashboard(el,d);
    } else {
      renderStoreDashboard(el,d);
    }
  }catch(e){el.innerHTML=`<div style="padding:40px;color:var(--red)">Chyba: ${e.message}</div>`;}
}

function renderPrivDashboard(el,d){
  const {zKpi,sKpi,stavCounts,zdrojCounts,prodCounts,storeBreakdown,recent,recentS}=d;
  const w = getDashWidgets();
  const stavMap={};
  stavCounts.forEach(s=>stavMap[s.stav||'—']=s.cnt);
  const zMarzaPct=zKpi.trzba>0?(zKpi.marza/zKpi.trzba*100):0;
  const sMarzaPct=sKpi.fakturovane>0?(sKpi.marza/sKpi.fakturovane*100):0;


  /* ── Bar chart helper ── */
  function barChart(items, valueKey, labelKey, color='var(--amber)') {
    if(!items||!items.length) return '<div style="color:var(--muted2);font-size:12px;padding:12px 0">Žiadne dáta</div>';
    const max = Math.max(...items.map(i=>i[valueKey]||0), 1);
    return items.map(item => {
      const pct = Math.round((item[valueKey]||0)/max*100);
      const label = (item[labelKey]||'').replace('Obchod ','');
      return `<div class="bar-item">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-value">${valueKey==='marza'||valueKey==='trzba'||valueKey==='fakturovane'?fmtEur(item[valueKey]):item[valueKey]||0}</div>
      </div>`;
    }).join('');
  }

  /* ── Store cards ── */
  const storeCardsHtml=(storeBreakdown||[]).map(({store,z,s})=>{
    const mp=z.trzba>0?(z.marza/z.trzba*100):0;
    const shortName=store.replace('Obchod ','');
    return `<div class="store-card">
      <div class="store-card-header">
        <div class="store-card-name">${shortName}</div>
        <div class="store-card-pill">${z.total}</div>
      </div>
      <div class="store-stat"><span class="store-stat-label">Realizované</span><span class="store-stat-value">${z.realizovane||0}/${z.total||0}</span></div>
      <div class="store-stat"><span class="store-stat-label">Tržba</span><span class="store-stat-value positive">${fmtEur(z.trzba)}</span></div>
      <div class="store-stat"><span class="store-stat-label">Marža €</span><span class="store-stat-value positive">${fmtEur(z.marza)}</span></div>
      <div class="store-stat"><span class="store-stat-label">Marža %</span><span class="store-stat-value dash-pct-highlight">${fmtPct(mp)}</span></div>
      <div class="store-stat"><span class="store-stat-label">Servis</span><span class="store-stat-value">${s.total||0} / ${fmtEur(s.fakturovane)}</span></div>
    </div>`;
  }).join('');

  /* ── Chart data ── */
  const trzbaData=(storeBreakdown||[]).map(({store,z})=>({store,trzba:z.trzba,label:store}));
  const marzaData=(storeBreakdown||[]).map(({store,z})=>({store,marza:z.marza,label:store}));
  const servisData=(storeBreakdown||[]).map(({store,s})=>({store,fakturovane:s.fakturovane,label:store}));



  /* ── Section wrapper helper ── */
  const sec = (key, title, html, extra='') =>
    `<div class="dash-widget ${w[key]?'':'dash-widget-collapsed'}" data-widget="${key}">
      <div class="dash-widget-header">
        <span class="dash-section-label">${title}</span>
        ${extra}
      </div>
      <div class="dash-widget-body">${html}</div>
    </div>`;

  el.innerHTML = `
    ${w.z_kpi ? `
    <div class="dash-section-label" style="margin-bottom:8px">Zákazky — celkový prehľad</div>
    <div class="dash-kpi-row" style="margin-bottom:16px">
      <div class="dash-kpi-item">
        <div class="kpi-label">Celkom zákaziek</div>
        <div class="kpi-value">${zKpi.total}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Realizované</div>
        <div class="kpi-value">${zKpi.realizovane}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Tržba celkom</div>
        <div class="kpi-value kpi-eur">${fmtEur(zKpi.trzba)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Náklady celkom</div>
        <div class="kpi-value kpi-eur">${fmtEur(zKpi.naklady)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Marža €</div>
        <div class="kpi-value kpi-eur text-green">${fmtEur(zKpi.marza)}</div>
        <div class="kpi-sub kpi-sub-strong kpi-sub-green">${fmtPct(zMarzaPct)}</div>
      </div>
    </div>` : ''}

    ${w.stav_chips ? `
    <div class="stav-chips" style="margin-bottom:20px">
      ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s=>`
        <div class="stav-chip">
          <div class="stav-chip-label">${s}</div>
          <div class="stav-chip-val">${stavMap[s]||0}</div>
        </div>`).join('')}
    </div>` : ''}



    ${w.s_kpi ? `
    <div class="dash-section-label" style="margin-bottom:8px">Servis — celkový prehľad</div>
    <div class="dash-kpi-row" style="margin-bottom:20px">
      <div class="dash-kpi-item">
        <div class="kpi-label">Celkom servisov</div>
        <div class="kpi-value">${sKpi.total}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Fakturované</div>
        <div class="kpi-value kpi-eur">${fmtEur(sKpi.fakturovane)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Náklady</div>
        <div class="kpi-value kpi-eur">${fmtEur(sKpi.naklad)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Marža €</div>
        <div class="kpi-value kpi-eur text-green">${fmtEur(sKpi.marza)}</div>
        <div class="kpi-sub kpi-sub-strong kpi-sub-green">${fmtPct(sMarzaPct)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Odprac. čas (hod.)</div>
        <div class="kpi-value kpi-small">${fmtNum(sKpi.cas)}</div>
      </div>
    </div>` : ''}

    ${storeBreakdown ? `
    ${w.zdroj_chart||w.prod_chart ? `
    <div class="dash-charts-grid dash-charts-grid-2 " style="margin-bottom:20px">
      ${w.zdroj_chart ? `
      <div class="chart-card">
        <div class="chart-card-title">Zdroj zákaziek</div>
        <div class="bar-chart">${barChart((zdrojCounts||[]).slice(0,6),'cnt','zdroj','var(--amber)')}</div>
      </div>` : ''}
      ${w.prod_chart ? `
      <div class="chart-card">
        <div class="chart-card-title">Zákazky podľa produktu</div>
        <div class="bar-chart">${barChart((prodCounts||[]).slice(0,6),'cnt','typ_prod','var(--purple)')}</div>
      </div>` : ''}
    </div>` : ''}

    ${w.store_cards ? `
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><div class="section-dot"></div>Prehľad obchodov</div>
    </div>
    <div class="store-cards-grid" style="margin-bottom:24px">${storeCardsHtml}</div>` : ''}

    ${w.store_charts ? `
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><div class="section-dot"></div>Výkonnosť obchodov</div>
    </div>
    <div class="dash-charts-grid" style="margin-bottom:24px">
      <div class="chart-card">
        <div class="chart-card-title">Tržba zákaziek podľa obchodu</div>
        <div class="bar-chart">${barChart(trzbaData,'trzba','label','var(--amber)')}</div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Marža zákaziek podľa obchodu</div>
        <div class="bar-chart">${barChart(marzaData,'marza','label','var(--green)')}</div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Servis fakturovaný podľa obchodu</div>
        <div class="bar-chart">${barChart(servisData,'fakturovane','label','var(--blue)')}</div>
      </div>
    </div>` : ''}


    ` : ''}
  `;
}

function renderStoreDashboard(el, d){
  const {zKpi, sKpi, stavCounts} = d;
  const stavMap = {};
  if(stavCounts) stavCounts.forEach(s => stavMap[s.stav||'—'] = s.cnt);


  el.innerHTML=`
    <div class="dash-section-label" style="margin-bottom:8px">Môj prehľad — Zákazky</div>
    <div class="dash-kpi-row" style="margin-bottom:16px">
      <div class="dash-kpi-item">
        <div class="kpi-label">Celkom zákaziek</div>
        <div class="kpi-value">${zKpi?.total||0}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Realizované</div>
        <div class="kpi-value">${zKpi?.realizovane||0}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Tržba</div>
        <div class="kpi-value kpi-eur text-green">${fmtEur(zKpi?.trzba||0)}</div>
      </div>
    </div>

    <div class="stav-chips" style="margin-bottom:20px">
      ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s=>`
        <div class="stav-chip">
          <div class="stav-chip-label">${s}</div>
          <div class="stav-chip-val">${stavMap[s]||0}</div>
        </div>`).join('')}
    </div>

    <div class="dash-section-label" style="margin-bottom:8px">Môj prehľad — Servis</div>
    <div class="dash-kpi-row" style="margin-bottom:28px">
      <div class="dash-kpi-item">
        <div class="kpi-label">Celkom servisov</div>
        <div class="kpi-value">${sKpi?.total||0}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Fakturované</div>
        <div class="kpi-value kpi-eur" style="color:var(--blue)">${fmtEur(sKpi?.fakturovane||0)}</div>
      </div>
      <div class="dash-kpi-divider"></div>
      <div class="dash-kpi-item">
        <div class="kpi-label">Odpracovaný čas</div>
        <div class="kpi-value kpi-small">${fmtNum(sKpi?.cas||0)} h</div>
      </div>
    </div>
  `;
}


/* ══════════════════════════════════════════════════════════
   ZÁKAZKY
   ══════════════════════════════════════════════════════════ */
async function renderZakazky(){
  const el=$('view-zakazky'),st=State.zakazky;
  const priv=isPrivileged();
  const qs=new URLSearchParams({page:st.page,perPage:st.perPage,sortCol:st.sortCol,sortDir:st.sortDir,
    ...Object.fromEntries(Object.entries(st.filters).filter(([,v])=>v))});
  let data;
  try{loading(true);data=await api('GET',`/api/zakazky?${qs}`);}
  catch(e){el.innerHTML=`<div style="padding:40px;color:var(--red)">Chyba: ${e.message}</div>`;return;}
  finally{loading(false);}
  const {rows,total}=data;
  const totT=rows.reduce((s,r)=>s+(parseFloat(r.trzba)||0),0);
  const totN=rows.reduce((s,r)=>s+(parseFloat(r.naklady)||0),0);
  const totM=rows.reduce((s,r)=>s+(parseFloat(r.marza_eur)||0),0);

  const cols=[
    {key:'id',label:'ID zákazky'},
    {key:'dopyt_d',label:'Dopyt'},
    {key:'obhliadka_d',label:'Obhliadka'},
    {key:'ponuka_d',label:'Ponuka'},
    {key:'objednavka_d',label:'Objednávka'},
    {key:'zakaznik',label:'Zákazník'},{key:'lokalita',label:'Lokalita'},
    ...(priv?[{key:'obchod',label:'Obchod'}]:[]),
    {key:'stav',label:'Stav'},{key:'typ_prod',label:'Produkt'},
    {key:'typ_riesenia',label:'Riešenie'},{key:'model',label:'Model'},
    {key:'zdroj',label:'Zdroj'},{key:'trzba',label:'Tržba €'},
    {key:'naklady',label:'Náklady €'},{key:'marza_eur',label:'Marža €'},
    {key:'marza_pct',label:'Marža %'},{key:'zlava',label:'Zľava %'},
  ];
  const numCols = new Set(['trzba','naklady','marza_eur','marza_pct','zlava']);
  const centerCols = new Set(['zdroj']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numCols.has(c.key) ? ' th-num' : centerCols.has(c.key) ? ' th-center' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortZakazky('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><span class="font-mono" style="font-size:11px">${r.id||'—'}</span></td>
    <td class="td-date">${r.dopyt_d||'—'}</td>
    <td class="td-date">${r.obhliadka_d||'—'}</td>
    <td class="td-date">${r.ponuka_d||'—'}</td>
    <td class="td-date">${r.objednavka_d||'—'}</td>
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    <td class="td-clip" title="${r.lokalita||''}">${r.lokalita||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td>${stavBadge(r.stav)}</td>
    <td>${r.typ_prod||'—'}</td>
    <td class="td-clip" title="${r.typ_riesenia||''}" style="color:var(--muted)">${r.typ_riesenia||'—'}</td>
    <td>${r.model||'—'}</td>
    <td class="td-center">${r.zdroj||'—'}</td>
    <td class="td-num num">${fmtEur(r.trzba)}</td>
    <td class="td-num num">${fmtEur(r.naklady)}</td>
    <td class="td-num num fw-700 text-green">${fmtEur(r.marza_eur)}</td>
    <td class="td-num num">${r.marza_pct!=null?fmtPct(r.marza_pct):''}</td>
    <td class="td-num num">${r.zlava?fmtPct(r.zlava):'—'}</td>
    <td class="actions">
      <button class="btn btn-sm btn-media" onclick="openMediaModal('${r.id}')">Fotky</button>
      <button class="btn btn-edit btn-sm" onclick="editZakazka('${r.id}')">Upraviť</button>
      ${canWrite()?`<button class="btn btn-del btn-sm" onclick="deleteZakazka('${r.id}','')">Odstraniť</button>`:''}
    </td>
  </tr>`).join(''):`<tr class="empty-row"><td colspan="${cols.length+1}"><span class="empty-icon">—</span>Žiadne zákazky nevyhovujú filtrom</td></tr>`;

  const f=st.filters;
  el.innerHTML=`
    <div class="toolbar-v2">
      <div class="toolbar-v2-top">
        <span class="toolbar-title">Zákazky</span>
        <div class="toolbar-v2-actions">
          ${canWrite()?`<button class="btn btn-primary" onclick="openNewZakazka()">Nová zákazka</button>`:''}
          
          <button class="btn btn-success" onclick="exportZakazky()">Export XLS</button>
        </div>
      </div>
      <div class="toolbar-v2-filters">
        <input class="filter-input" type="text" placeholder="Hľadať zákazníka, ID, lokalitu, model..." value="${f.q}" oninput="setFilterZ('q',this.value)">
        <select class="filter-select" onchange="setFilterZ('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
        <select class="filter-select" onchange="setFilterZ('stav',this.value)">
          <option value="">Všetky stavy</option>
          ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s=>`<option ${f.stav===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="setFilterZ('typ_prod',this.value)">
          <option value="">Všetky produkty</option>
          ${['Krb','Pec','Krbová vložka','Biokrb','Elektrický krb'].map(s=>`<option ${f.typ_prod===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="setFilterZ('zdroj',this.value)">
          <option value="">Všetky zdroje</option>
          ${['Web','Showroom','Telefón','Odporúčanie','Developer','Reklama','Architekt'].map(s=>`<option ${f.zdroj===s?'selected':''}>${s}</option>`).join('')}
        </select>
        ${priv?`<select class="filter-select" onchange="setFilterZ('obchod',this.value)">
          <option value="">Všetky obchody</option>
          ${['Obchod KE','Obchod SL','Obchod BA','Obchod CZ','V.O.'].map(s=>`<option ${f.obchod===s?'selected':''}>${s}</option>`).join('')}
        </select>`:''}
      </div>
    </div>
    <div class="table-wrap-v2">
      <table>
        <thead><tr>${thHtml}</tr></thead>
        <tbody>
          ${tdHtml}
          ${rows.length?`<tr class="sum-row">
            <td colspan="${priv?9:8}" style="text-align:right;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Súčet (strana):</td>
            <td></td><td></td><td></td><td></td><td></td>
            <td class="td-num num">${fmtEur(totT)}</td>
            <td class="td-num num">${fmtEur(totN)}</td>
            <td class="td-num num fw-700 text-green">${fmtEur(totM)}</td>
            <td class="td-num num">${totT>0?fmtPct(totM/totT*100):''}</td>
            <td colspan="2"></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'Z')}`;
}

let fzT;
function setFilterZ(k,v){State.zakazky.filters[k]=v;State.zakazky.page=1;clearTimeout(fzT);fzT=setTimeout(renderZakazky,280);}
function sortZakazky(col){const st=State.zakazky;if(st.sortCol===col)st.sortDir=st.sortDir==='asc'?'desc':'asc';else{st.sortCol=col;st.sortDir='asc';}renderZakazky();}

/* ══════════════════════════════════════════════════════════
   SERVIS
   ══════════════════════════════════════════════════════════ */
async function renderServis(){
  const el=$('view-servis'),st=State.servis;
  const priv=isPrivileged();
  const qs=new URLSearchParams({page:st.page,perPage:st.perPage,sortCol:st.sortCol,sortDir:st.sortDir,
    ...Object.fromEntries(Object.entries(st.filters).filter(([,v])=>v))});
  let data;
  try{loading(true);data=await api('GET',`/api/servis?${qs}`);}
  catch(e){el.innerHTML=`<div style="padding:40px;color:var(--red)">Chyba: ${e.message}</div>`;return;}
  finally{loading(false);}
  const {rows,total}=data;
  const totF=rows.reduce((s,r)=>s+(parseFloat(r.fakturovane)||0),0);
  const totN=rows.reduce((s,r)=>s+(parseFloat(r.naklad)||0),0);
  const totM=rows.reduce((s,r)=>s+(parseFloat(r.marza)||0),0);
  const totC=rows.reduce((s,r)=>s+(parseFloat(r.cas)||0),0);

  const cols=[
    {key:'id',label:'ID servisu'},{key:'datum',label:'Dátum'},
    {key:'zakaznik',label:'Zákazník'},
    ...(priv?[{key:'obchod',label:'Obchod'}]:[]),
    {key:'technik',label:'Technik'},{key:'typ',label:'Typ zásahu'},
    {key:'zaruka',label:'Záruka'},{key:'fakturovane',label:'Fakturované €'},
    {key:'naklad',label:'Náklad €'},{key:'marza',label:'Marža €'},{key:'cas',label:'Čas (h)'},
  ];
  const numColsS = new Set(['fakturovane','naklad','marza','cas']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numColsS.has(c.key) ? ' th-num' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortServis('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><span class="font-mono" style="font-size:11px">${r.id||'—'}</span></td>
    <td class="td-date">${r.datum||'—'}</td>
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td>${r.technik||'—'}</td>
    <td class="td-clip" title="${r.typ||''}">${r.typ||'—'}</td>
    <td>${r.zaruka==='Áno'?badge('Záruka','zaruka'):r.zaruka==='Nie'?badge('Platené','platene'):'—'}</td>
    <td class="td-num num">${fmtEur(r.fakturovane)}</td>
    <td class="td-num num">${fmtEur(r.naklad)}</td>
    <td class="td-num num fw-700 text-green">${fmtEur(r.marza)}</td>
    <td class="td-num num">${r.cas!=null&&r.cas!==''?r.cas+'h':'—'}</td>
    <td class="actions">
      <button class="btn btn-sm btn-media" onclick="openMediaModal('${r.id}')">Fotky</button>
      <button class="btn btn-edit btn-sm" onclick="editServis('${r.id}')">Upraviť</button>
      ${canWrite()?`<button class="btn btn-del btn-sm" onclick="deleteServis('${r.id}','')">Odstraniť</button>`:''}
    </td>
  </tr>`).join(''):`<tr class="empty-row"><td colspan="${cols.length+1}"><span class="empty-icon">—</span>Žiadne záznamy nevyhovujú filtrom</td></tr>`;

  const f=st.filters;
  el.innerHTML=`
    <div class="toolbar-v2">
      <div class="toolbar-v2-top">
        <span class="toolbar-title">Servis</span>
        <div class="toolbar-v2-actions">
          ${canWrite()?`<button class="btn btn-primary" onclick="openNewServis()">Nový servis</button>`:''}
          
          <button class="btn btn-success" onclick="exportServis()">Export XLS</button>
        </div>
      </div>
      <div class="toolbar-v2-filters">
        <input class="filter-input" type="text" placeholder="Hľadať zákazníka, ID, technika..." value="${f.q}" oninput="setFilterS('q',this.value)">
        <select class="filter-select" onchange="setFilterS('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
        <select class="filter-select" onchange="setFilterS('typ',this.value)">
          <option value="">Všetky typy</option>
          ${['Čistenie','Revízia','Oprava','Reklamácia','Iné'].map(s=>`<option ${f.typ===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="setFilterS('zaruka',this.value)">
          <option value="">Záruka / Platené</option>
          <option value="Áno" ${f.zaruka==='Áno'?'selected':''}>Iba záruka</option>
          <option value="Nie" ${f.zaruka==='Nie'?'selected':''}>Iba platené</option>
        </select>
        ${priv?`<select class="filter-select" onchange="setFilterS('obchod',this.value)">
          <option value="">Všetky obchody</option>
          ${['Obchod KE','Obchod SL','Obchod BA','Obchod CZ','V.O.'].map(s=>`<option ${f.obchod===s?'selected':''}>${s}</option>`).join('')}
        </select>`:''}
      </div>
    </div>
    <div class="table-wrap-v2">
      <table>
        <thead><tr>${thHtml}</tr></thead>
        <tbody>
          ${tdHtml}
          ${rows.length?`<tr class="sum-row">
            <td colspan="${priv?7:6}" style="text-align:right;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Súčet (strana):</td>
            <td class="num">${fmtEur(totF)}</td>
            <td class="num">${fmtEur(totN)}</td>
            <td class="num text-green">${fmtEur(totM)}</td>
            <td class="num">${fmtNum(totC)} h</td>
            <td></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'S')}`;
}

let fsT;
function setFilterS(k,v){State.servis.filters[k]=v;State.servis.page=1;clearTimeout(fsT);fsT=setTimeout(renderServis,280);}
function sortServis(col){const st=State.servis;if(st.sortCol===col)st.sortDir=st.sortDir==='asc'?'desc':'asc';else{st.sortCol=col;st.sortDir='asc';}renderServis();}

/* ── Pagination ───────────────────────────────────────────── */
function renderPagination(total,page,perPage,w){
  const pages=Math.ceil(total/perPage)||1,s=(page-1)*perPage+1,e=Math.min(page*perPage,total);
  let btns='';
  for(let i=1;i<=pages;i++){
    if(pages>10&&i>3&&i<pages-2&&Math.abs(i-page)>1){if(i===4)btns+=`<span class="page-ellipsis">…</span>`;continue;}
    btns+=`<button class="page-btn${i===page?' active':''}" onclick="setPage${w}(${i})">${i}</button>`;
  }
  return `<div class="pagination">
    <span class="page-info">Zobrazené <b>${total?s:0}–${e}</b> z <b>${total}</b></span>
    <div class="page-controls">
      <select class="per-page" onchange="setPerPage${w}(this.value)">
        ${[10,25,50,100].map(n=>`<option${perPage===n?' selected':''}>${n}</option>`).join('')}
      </select>
      <div class="page-btns">
        <button class="page-btn" onclick="setPage${w}(${Math.max(1,page-1)})" ${page===1?'disabled':''}>‹</button>
        ${btns}
        <button class="page-btn" onclick="setPage${w}(${Math.min(pages,page+1)})" ${page===pages?'disabled':''}>›</button>
      </div>
    </div>
  </div>`;
}
function setPageZ(p){State.zakazky.page=p;renderZakazky();}
function setPerPageZ(n){State.zakazky.perPage=parseInt(n);State.zakazky.page=1;renderZakazky();}
function setPageS(p){State.servis.page=p;renderServis();}
function setPerPageS(n){State.servis.perPage=parseInt(n);State.servis.page=1;renderServis();}

/* ══════════════════════════════════════════════════════════
   ZÁKAZKA MODAL
   ══════════════════════════════════════════════════════════ */
function openNewZakazka(){
  // Dočasné ID pre upload fotiek pri novej zákazke (prenesú sa po uložení)
  State.editingZakazkaId = null;
  State.newZakazkaTemp = 'TEMP-Z-' + Date.now();
  $('modalZakazkaTitle').textContent='Nová zákazka';
  ['z_dopyt','z_obhliadka','z_ponuka_d','z_objednavka','z_zakaznik','z_lokalita','z_model',
    'z_cena_krb','z_nakup_krb','z_cena_komin','z_nakup_komin','z_cena_montaz','z_naklad_montaz',
    'z_cena_prislus','z_nakup_prislus','z_doprava_fakt','z_naklad_doprava','z_zlava','z_poznamka']
      .forEach(id=>$(id).value='');
  ['z_typ_zak','z_stav','z_zdroj','z_vysledok','z_typ_prod','z_typ_riesenia','z_obchod'].forEach(id=>$(id).value='');
  $('zakazkaFotkySection').style.display = 'block';
  const gallery = $('z_fotky_gallery');
  if (gallery) gallery.innerHTML = '<span class="media-empty">Fotky môžeš pridať hneď.</span>';
  calcZFin(); openModal('modalZakazka');
}
async function editZakazka(id){
  try{
    loading(true);
    const r=await api('GET',`/api/zakazky/${id}`);
    State.editingZakazkaId=id;
    $('modalZakazkaTitle').textContent=`Zákazka ${id}`;
    const sv=(fid,v)=>$(fid).value=v||'';
    sv('z_dopyt',r.dopyt_d);sv('z_obhliadka',r.obhliadka_d);sv('z_ponuka_d',r.ponuka_d);sv('z_objednavka',r.objednavka_d);
    sv('z_zakaznik',r.zakaznik);sv('z_typ_zak',r.typ_zak);sv('z_lokalita',r.lokalita);sv('z_stav',r.stav);
    sv('z_zdroj',r.zdroj);sv('z_vysledok',r.vysledok);sv('z_typ_prod',r.typ_prod);sv('z_typ_riesenia',r.typ_riesenia);
    sv('z_model',r.model);sv('z_cena_krb',r.cena_krb);sv('z_nakup_krb',r.nakup_krb);
    sv('z_cena_komin',r.cena_komin);sv('z_nakup_komin',r.nakup_komin);sv('z_cena_montaz',r.cena_montaz);
    sv('z_naklad_montaz',r.naklad_montaz);sv('z_cena_prislus',r.cena_prislus);sv('z_nakup_prislus',r.nakup_prislus);
    sv('z_doprava_fakt',r.doprava_fakt);sv('z_naklad_doprava',r.naklad_doprava);sv('z_zlava',r.zlava);sv('z_poznamka',r.poznamka);
    if(isPrivileged()) sv('z_obchod',r.obchod);
    $('zakazkaFotkySection').style.display = 'block'; // PRIDANÉ (Odkryje galériu)
    loadFotky(id, 'z_fotky_gallery');
    calcZFin(); openModal('modalZakazka');
  }catch(e){notify(e.message,'error');}finally{loading(false);}
}
function calcZFin(){
  const g=id=>parseFloat($(id).value)||0;
  const t=g('z_cena_krb')+g('z_cena_komin')+g('z_cena_montaz')+g('z_cena_prislus')+g('z_doprava_fakt');
  const n=g('z_nakup_krb')+g('z_nakup_komin')+g('z_naklad_montaz')+g('z_nakup_prislus')+g('z_naklad_doprava');
  const m=t-n;
  $('calc_trzba').textContent=fmtNum(t)+' €';
  $('calc_naklady').textContent=fmtNum(n)+' €';
  $('calc_marza').textContent=fmtNum(m)+' €';
  $('calc_marza').style.color=m>=0?'var(--green)':'var(--red)';
}
document.querySelectorAll('.zfin').forEach(el=>el.addEventListener('input',calcZFin));

$('btnSaveZakazka').addEventListener('click',async()=>{
  const zakaznik=$('z_zakaznik').value.trim(),stav=$('z_stav').value;
  if(!zakaznik){notify('Zadajte meno zákazníka','error');return;}
  if(!stav){notify('Vyberte stav zákazky','error');return;}
  const gv=id=>$(id).value,gn=id=>parseFloat($(id).value)||0;
  const body={zakaznik,stav,obchod:gv('z_obchod')||undefined,
    dopyt_d:gv('z_dopyt'),obhliadka_d:gv('z_obhliadka'),ponuka_d:gv('z_ponuka_d'),objednavka_d:gv('z_objednavka'),
    typ_zak:gv('z_typ_zak'),lokalita:gv('z_lokalita'),zdroj:gv('z_zdroj'),vysledok:gv('z_vysledok'),
    typ_prod:gv('z_typ_prod'),typ_riesenia:gv('z_typ_riesenia'),model:gv('z_model'),
    cena_krb:gn('z_cena_krb'),nakup_krb:gn('z_nakup_krb'),cena_komin:gn('z_cena_komin'),nakup_komin:gn('z_nakup_komin'),
    cena_montaz:gn('z_cena_montaz'),naklad_montaz:gn('z_naklad_montaz'),cena_prislus:gn('z_cena_prislus'),
    nakup_prislus:gn('z_nakup_prislus'),doprava_fakt:gn('z_doprava_fakt'),naklad_doprava:gn('z_naklad_doprava'),
    zlava:gn('z_zlava'),poznamka:gv('z_poznamka')};
  try{
    loading(true);
    let savedId;
    if(State.editingZakazkaId) {
      await api('PUT',`/api/zakazky/${State.editingZakazkaId}`,body);
      savedId = State.editingZakazkaId;
    } else {
      const res = await api('POST','/api/zakazky',body);
      savedId = res.id;
      // Presuň dočasné fotky na reálne ID
      if (State.newZakazkaTemp && savedId) {
        try { await api('POST','/api/fotky/move', { from: State.newZakazkaTemp, to: savedId }); } catch(e) {}
        State.newZakazkaTemp = null;
      }
    }
    notify(State.editingZakazkaId?'Zákazka aktualizovaná':'Zákazka pridaná');
    closeModal('modalZakazka');renderZakazky();
    if(State.tab==='dashboard') renderDashboard();
  }catch(e){notify(e.message,'error');}finally{loading(false);}
});
async function deleteZakazka(id,name){
  if(!confirm(`Naozaj vymazať zákazku "${name}" (${id})?`)) return;
  try{loading(true);await api('DELETE',`/api/zakazky/${id}`);notify('Zákazka vymazaná');renderZakazky();if(State.tab==='dashboard')renderDashboard();}
  catch(e){notify(e.message,'error');}finally{loading(false);}
}

/* ══════════════════════════════════════════════════════════
   SERVIS MODAL
   ══════════════════════════════════════════════════════════ */
function openNewServis(){
  State.editingServisId = null;
  State.newServisTemp = 'TEMP-S-' + Date.now();
  $('modalServisTitle').textContent='Nový servisný zásah';
  ['s_datum','s_technik','s_zakaznik','s_fakt','s_naklad','s_cas','s_poznamka'].forEach(id=>$(id).value='');
  ['s_typ','s_zaruka','s_obchod'].forEach(id=>$(id).value='');
  $('servisFotkySection').style.display = 'block';
  const sg = $('s_fotky_gallery'); if (sg) sg.innerHTML = '<span class="media-empty">Fotky môžeš pridať hneď.</span>';
  $('s_marza_calc').textContent='0 €'; openModal('modalServis');
}
async function editServis(id){
  try{
    loading(true);
    const r=await api('GET',`/api/servis/${id}`);
    State.editingServisId=id;
    $('modalServisTitle').textContent=`Servis ${id}`;
    const sv=(fid,v)=>$(fid).value=v||'';
    sv('s_datum',r.datum);sv('s_technik',r.technik);sv('s_zakaznik',r.zakaznik);
    sv('s_typ',r.typ);sv('s_zaruka',r.zaruka);sv('s_fakt',r.fakturovane);
    sv('s_naklad',r.naklad);sv('s_cas',r.cas);sv('s_poznamka',r.poznamka);
    if(isPrivileged()) sv('s_obchod',r.obchod);
    $('servisFotkySection').style.display = 'block'; // PRIDANÉ
    loadFotky(id, 's_fotky_gallery');
    calcSMarza(); openModal('modalServis');
  }catch(e){notify(e.message,'error');}finally{loading(false);}
}
function calcSMarza(){
  const m=(parseFloat($('s_fakt').value)||0)-(parseFloat($('s_naklad').value)||0);
  $('s_marza_calc').textContent=fmtNum(m)+' €';
  $('s_marza_calc').style.color=m>=0?'var(--green)':'var(--red)';
}
['s_fakt','s_naklad'].forEach(id=>$(id).addEventListener('input',calcSMarza));

$('btnSaveServis').addEventListener('click',async()=>{
  const zakaznik=$('s_zakaznik').value.trim(),datum=$('s_datum').value;
  if(!zakaznik){notify('Zadajte zákazníka','error');return;}
  if(!datum){notify('Zadajte dátum','error');return;}
  const body={datum,technik:$('s_technik').value,zakaznik,typ:$('s_typ').value,zaruka:$('s_zaruka').value,
    fakturovane:parseFloat($('s_fakt').value)||0,naklad:parseFloat($('s_naklad').value)||0,
    cas:parseFloat($('s_cas').value)||0,poznamka:$('s_poznamka').value,obchod:$('s_obchod').value||undefined};
  try{
    loading(true);
    let savedSId;
    if(State.editingServisId) {
      await api('PUT',`/api/servis/${State.editingServisId}`,body);
      savedSId = State.editingServisId;
    } else {
      const res = await api('POST','/api/servis',body);
      savedSId = res.id;
      if (State.newServisTemp && savedSId) {
        try { await api('POST','/api/fotky/move', { from: State.newServisTemp, to: savedSId }); } catch(e) {}
        State.newServisTemp = null;
      }
    }
    notify(State.editingServisId?'Servis aktualizovaný':'Servis pridaný');
    closeModal('modalServis');renderServis();
    if(State.tab==='dashboard') renderDashboard();
  }catch(e){notify(e.message,'error');}finally{loading(false);}
});
async function deleteServis(id,name){
  if(!confirm(`Naozaj vymazať servis "${name}" (${id})?`)) return;
  try{loading(true);await api('DELETE',`/api/servis/${id}`);notify('Servis vymazaný');renderServis();if(State.tab==='dashboard')renderDashboard();}
  catch(e){notify(e.message,'error');}finally{loading(false);}
}

/* ══════════════════════════════════════════════════════════
   EXPORT / IMPORT
   ══════════════════════════════════════════════════════════ */
async function exportZakazky(){
  const st=State.zakazky;
  const qs=new URLSearchParams(Object.fromEntries(Object.entries(st.filters).filter(([,v])=>v)));
  await dlFile(`${API}/api/export/zakazky?${qs}`,`STORMS_Zakazky_${td()}.xlsx`);
}
async function exportServis(){
  const st=State.servis;
  const qs=new URLSearchParams(Object.fromEntries(Object.entries(st.filters).filter(([,v])=>v)));
  await dlFile(`${API}/api/export/servis?${qs}`,`STORMS_Servis_${td()}.xlsx`);
}
async function dlFile(url,filename){
  try{loading(true);
    const res=await fetch(url,{headers:{Authorization:'Bearer '+State.token}});
    if(!res.ok) throw new Error('Export zlyhal');
    const blob=await res.blob(),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();notify('Export hotový');
  }catch(e){notify(e.message,'error');}finally{loading(false);}
}
const td=()=>new Date().toISOString().slice(0,10);

function openImport(type) {
  State.importType = type;
  State.importBuffer = null;

  var el;
  el = document.getElementById('modalImportTitle');
  if (el) el.textContent = (type === 'zakazky') ? 'Import zákaziek' : 'Import servisu';
  el = document.getElementById('importPreview');
  if (el) el.innerHTML = '';
  el = document.getElementById('btnConfirmImport');
  if (el) el.classList.add('d-none');
  el = document.getElementById('importFile');
  if (el) el.value = '';
  el = document.getElementById('importDrop');
  if (el) el.classList.remove('drag-over');

  openModal('modalImport');
}

function importProcessFile(file) {
  var nameEl = document.getElementById('importFileName');
  if (nameEl) nameEl.textContent = file.name;

  var reader = new FileReader();
  reader.onload = function(ev) {
    // Encode to base64
    var bytes = new Uint8Array(ev.target.result);
    var b64 = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    State.importBuffer = { fileBase64: btoa(b64), filename: file.name };

    // Preview
    try {
      var wb  = XLSX.read(ev.target.result, { type: 'array' });
      var ws  = wb.Sheets[wb.SheetNames[0]];
      var raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      var hIdx = 0;
      for (var i = 0; i < Math.min(raw.length, 8); i++) {
        var joined = (raw[i] || []).join(' ').toLowerCase();
        if (joined.indexOf('zakaznik') >= 0 || joined.indexOf('technik') >= 0 ||
            joined.indexOf('obchod')   >= 0 || joined.indexOf('zakazky') >= 0) {
          hIdx = i; break;
        }
      }

      var cols    = (raw[hIdx] || []).slice(0, 8);
      var allRows = raw.slice(hIdx + 1).filter(function(r) {
        return r.some(function(c) { return c !== '' && c != null; });
      });
      var preview = allRows.slice(0, 5);

      var html = '<div style="padding:8px 0;font-size:12.5px;font-weight:700;color:var(--green)">✓ ' + allRows.length + ' riadkov — náhľad:</div>';
      html += '<div class="import-preview"><table class="mini-table"><thead><tr>';
      for (var ci = 0; ci < cols.length; ci++) html += '<th>' + (cols[ci] || '—') + '</th>';
      html += '</tr></thead><tbody>';
      for (var ri = 0; ri < preview.length; ri++) {
        html += '<tr>';
        for (var ci = 0; ci < cols.length; ci++) {
          html += '<td>' + (preview[ri][ci] != null ? preview[ri][ci] : '') + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';

      var prevEl = document.getElementById('importPreview');
      if (prevEl) prevEl.innerHTML = html;
    } catch (err) {
      var prevEl = document.getElementById('importPreview');
      if (prevEl) prevEl.innerHTML = '<div style="color:var(--amber);padding:8px 0;font-size:12px">Chyba náhľadu: ' + err.message + '</div>';
    }

    var btn = document.getElementById('btnConfirmImport');
    if (btn) btn.classList.remove('d-none');
  };
  reader.onerror = function() { notify('Chyba čítania súboru', 'error'); };
  reader.readAsArrayBuffer(file);
}

async function confirmImport() {
  if (!State.importBuffer) { notify('Najprv vyberte súbor', 'error'); return; }
  try {
    loading(true);
    var r = await api('POST', '/api/import/' + State.importType, State.importBuffer);
    var msg = 'Importované: ' + r.added + ' nových';
    if (r.updated) msg += ', ' + r.updated + ' aktualizovaných';
    if (r.skipped) msg += ', ' + r.skipped + ' preskočených';
    notify(msg);
    closeModal('modalImport');
    if (State.importType === 'zakazky') renderZakazky(); else renderServis();
    if (State.tab === 'dashboard') renderDashboard();
  } catch(e) {
    notify(e.message || 'Chyba importu', 'error');
  } finally {
    loading(false);
  }
}

/* drag&drop events sú inline v HTML - viď ondragover/ondrop atribúty */


/* ── Správa používateľov (Admin / Owner) ─────────────────────── */

// Načíta a vykreslí tabuľku používateľov
async function loadUsers() {
  if (!['admin','owner'].includes(State.user.role)) return;
  try {
    const users = await api('GET', '/api/users');
    const tbody = $('usersTbody');
    tbody.innerHTML = '';
    const roleMap = { owner: 'Konateľ', admin: 'Admin / Správca', store: 'Pobočka' };
    const roleCls  = { owner: 'role-owner', admin: 'role-admin', store: 'role-store' };

    users.forEach(u => {
      const isSelf = u.id === State.user.id;
      const mfaHtml = u.mfa_enabled
        ? `<span class="users-badge users-badge-green">Aktívne</span>`
        : `<span class="users-badge users-badge-muted">Nie</span>`;
      const storeHtml = u.store
        ? u.store.split(',').map(s=>`<span class="users-badge users-badge-store">${s.replace('Obchod ','')}</span>`).join('')
        : '<span class="users-cell-muted">—</span>';
      const actionsHtml = isSelf
        ? `<span class="users-cell-muted">Váš účet</span>`
        : `<div class="users-actions">
            <button class="users-btn" onclick="openResetPasswordModal(${u.id}, '${u.username}')">Zmena hesla</button>
            <button class="users-btn" onclick="resetUser2FA(${u.id}, '${u.username}')">Reset 2FA</button>
            <button class="users-btn users-btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">Zmazať</button>
          </div>`;

      const tr = document.createElement('tr');
      tr.className = isSelf ? 'users-row-self' : '';
      tr.innerHTML = `
        <td><div class="users-name-cell"><div class="users-avatar">${(u.username||'?')[0].toUpperCase()}</div><span class="users-username">${u.username}</span></div></td>
        <td><span class="users-role-badge ${roleCls[u.role]||''}">${roleMap[u.role]||u.role}</span></td>
        <td>${storeHtml}</td>
        <td>${mfaHtml}</td>
        <td class="users-cell-muted">${new Date(u.created_at).toLocaleDateString('sk-SK')}</td>
        <td>${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error('Chyba pri načítaní užívateľov:', e);
  }
}

/* --- FUNKCIE PRE NOVÉHO POUŽÍVATEĽA --- */
function toggleStoreCheckboxes() {
  const role = $('newUserRole').value;
  $('storeCheckboxes').classList.toggle('d-none', role !== 'store');
}

function openNewUserModal() {
  $('newUsername').value = '';
  $('newUserPassword').value = '';
  $('newUserRole').value = '';
  document.querySelectorAll('.store-cb').forEach(cb => cb.checked = false);
  $('storeCheckboxes').classList.add('d-none');
  const err = $('userError');
  if (err) { err.textContent = ''; err.classList.add('d-none'); }
  openModal('modalUser');
}

function closeNewUserModal() {
  closeModal('modalUser');
}

async function saveNewUser() {
  const username = $('newUsername').value.trim();
  const password = $('newUserPassword').value;
  const role = $('newUserRole').value; 
  const err = $('userError');
  err.classList.add('d-none');

  if (!username || !password || !role) {
    err.textContent = 'Vyplňte všetky polia a vyberte rolu.'; err.classList.remove('d-none');
    return;
  }
  if (password.length < 6) {
    err.textContent = 'Heslo musí mať aspoň 6 znakov.';
    err.classList.remove('d-none');
    return;
  }

  // Zozbierame zaškrtnuté pobočky
  let store = null;
  if (role === 'store') {
    const checked = Array.from(document.querySelectorAll('.store-cb:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      err.textContent = 'Vyberte aspoň jednu pobočku.';
      err.classList.remove('d-none');
      return;
    }
    // Uloží do databázy ako text: "Obchod KE,Obchod SL"
    store = checked.join(','); 
  }

  if (typeof loading === 'function') loading(true);
  try {
    await api('POST', '/api/users', { 
      username, 
      password, 
      role, 
      store 
    });
    
    closeModal('modalUser');
    notify(`Používateľ ${username} bol úspešne vytvorený.`);
    loadUsers(); 
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('d-none');
  } finally {
    if (typeof loading === 'function') loading(false);
  }
}

// Zmazanie
async function deleteUser(id, username) {
  if (!confirm(`Naozaj chcete natrvalo zmazať konto '${username}'?`)) return;
  try {
    await api('DELETE', `/api/users/${id}`);
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

// Resetovanie 2FA
async function resetUser2FA(id, username) {
  if (!confirm(`Chcete zrušiť 2FA pre '${username}'? Pri ďalšom prihlásení si bude musieť naskenovať nový QR kód.`)) return;
  try {
    await api('PUT', `/api/users/${id}/reset-2fa`);
    alert(`2FA pre užívateľa ${username} bolo úspešne zrušené.`);
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* --- FUNKCIE PRE ZMENU HESLA --- */
let resetPasswordUserId = null;

function openResetPasswordModal(id, username) {
  resetPasswordUserId = id;
  $('resetPasswordUsername').textContent = username;
  $('newResetPassword').value = '';
  $('resetPasswordError').style.display = 'none';
  
  const m = $('modalResetPassword');
  if(m) { 
    m.classList.remove('d-none'); 
    m.style.display = 'flex'; 
  }
}

function closePasswordModal() {
  const m = $('modalResetPassword');
  if(m) { 
    m.classList.add('d-none'); 
    m.style.display = 'none'; 
  }
}

async function saveNewPassword() {
  const newPassword = $('newResetPassword').value;
  const err = $('resetPasswordError');
  err.classList.add('d-none');

  if (newPassword.length < 6) {
    err.textContent = 'Heslo musí mať aspoň 6 znakov.';
    err.classList.remove('d-none');
    return;
  }

  if (typeof loading === 'function') loading(true);
  try {
    await api('PUT', `/api/users/${resetPasswordUserId}/reset-password`, { newPassword });
    closePasswordModal();
    alert('Heslo bolo úspešne zmenené!');
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('d-none');
  } finally {
    if (typeof loading === 'function') loading(false);
  }
}

/* ══════════════════════════════════════════════════════════
   FOTOGALÉRIA A PREHLIADAČ (LIGHTBOX)
   ══════════════════════════════════════════════════════════ */
function openLightbox(src, nazov) {
  _lightboxImages = [{ src, nazov: nazov || '' }];
  _lightboxIdx = 0;
  showLightbox();
}

/* ══════════════════════════════════════════════════════════
   MÉDIÁ — fotky + prílohy (zákazky aj servis)
   ══════════════════════════════════════════════════════════ */

// Stav pre lightbox
let _lightboxImages = [], _lightboxIdx = 0;

/* ── Prepínanie záložiek vo formulári ── */
function switchMediaTab(prefix, tab) {
  ['fotky','prilohy'].forEach(t => {
    $(`${prefix}_tab_${t}`)?.classList.toggle('d-none', t !== tab);
    document.querySelectorAll(`#${prefix === 'z' ? 'modalZakazka' : 'modalServis'} .media-tab`)
      .forEach(btn => {
        if (btn.textContent.trim().startsWith(t === 'fotky' ? 'Fotky' : 'Prílohy')) {
          btn.classList.toggle('active', t === tab);
        }
      });
  });
}

/* ── Načítaj súbory pre formulár (iba metadáta, bez dát) ── */
async function loadFotky(parentId, galleryId) {
  const prefix = galleryId && galleryId.startsWith('z_') ? 'z' : 's';
  await loadMedia(parentId, prefix);
}

async function loadMedia(parentId, prefix) {
  const fotkyGallery = $(`${prefix}_fotky_gallery`);
  if (!fotkyGallery) return;
  fotkyGallery.innerHTML = '<span class="media-loading">Načítavam...</span>';
  try {
    const files = await api('GET', `/api/fotky/${parentId}`);
    const images = files.filter(f => (f.mime_type || '').startsWith('image/'));
    const fc = $(`${prefix}_fotky_count`);
    if (fc) fc.textContent = images.length ? `(${images.length})` : '';
    if (!images.length) {
      fotkyGallery.innerHTML = '<span class="media-empty">Žiadne fotky.</span>';
    } else {
      // Store all images in state for lightbox navigation
      State.galleryImages = State.galleryImages || {};
      State.galleryImages[parentId] = images.map(f => ({ id: f.id, nazov: f.nazov || 'fotka' }));
      fotkyGallery.innerHTML = images.map((f, idx) => `
        <div class="media-thumb" data-id="${f.id}" data-parent="${parentId}" data-prefix="${prefix}">
          <div class="media-thumb-img-wrap">
            <div class="media-thumb-placeholder" id="thumb_${f.id}" onclick="openThumbLightbox('${parentId}','${f.id}','${f.nazov||''}',this,${idx})">
              <span class="media-thumb-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
              <span class="media-thumb-name">${(f.nazov||'fotka').slice(0,18)}</span>
            </div>
          </div>
          <button class="media-thumb-del" onclick="deleteMedia(${f.id},'${parentId}','${prefix}')" title="Vymazať">&times;</button>
        </div>`).join('');
    }
  } catch (e) {
    fotkyGallery.innerHTML = `<span class="media-empty" style="color:var(--red)">Chyba: ${e.message}</span>`;
  }
}

/* ── Ikona podľa MIME ── */
function fileIcon(mime) {
  if (!mime) return '📄';
  if (mime.includes('pdf'))   return '📕';
  if (mime.includes('word') || mime.includes('doc')) return '📘';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('xls')) return '📗';
  if (mime.includes('zip') || mime.includes('compressed')) return '📦';
  if (mime.includes('text')) return '📄';
  return '📎';
}

/* ── Otvor thumbnail v lightboxe (lazy load dát) ── */
async function openThumbLightbox(parentId, fileId, nazov, el, galleryIdx) {
  try {
    loading(true);
    // Načítaj dáta fotky
    const f = await api('GET', `/api/fotky/${parentId}/${fileId}/data`);
    if (!State.loadedImages) State.loadedImages = {};
    State.loadedImages[fileId] = {
      src: f.data_b64,
      nazov: f.nazov || nazov,
      parentId,
      galleryIdx: galleryIdx || 0
    };
    // Nahraď placeholder obrázkom s náhľadom
    el.innerHTML = `<img src="${f.data_b64}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block">`;
    el.onclick = null; // odstráň pôvodný onclick
    el.style.cursor = 'zoom-in';
    // Pridaj nový click na celý wrapper
    el.addEventListener('click', function handler() {
      openLightboxById(fileId);
    });
    // Hneď otvor lightbox
    openLightboxById(fileId);
  } catch(e) { notify('Chyba pri načítaní fotky', 'error'); }
  finally { loading(false); }
}

function openLightboxById(fileId) {
  if (!State.loadedImages || !State.loadedImages[fileId]) return;
  const img = State.loadedImages[fileId];
  const parentId = img.parentId;
  // Zozbieraj všetky načítané fotky tej istej zákazky
  const allLoaded = Object.values(State.loadedImages)
    .filter(i => i.parentId === parentId)
    .sort((a, b) => a.galleryIdx - b.galleryIdx);
  _lightboxImages = allLoaded.length ? allLoaded : [img];
  _lightboxIdx = allLoaded.findIndex(i => i === img);
  if (_lightboxIdx < 0) _lightboxIdx = 0;
  showLightbox();
}

function openLightboxFromThumb(src, nazov) {
  _lightboxImages = [{ src, nazov }];
  _lightboxIdx = 0;
  showLightbox();
}

/* ── Stiahni prílohu ── */
async function downloadMedia(parentId, fileId, nazov) {
  try {
    loading(true);
    const f = await api('GET', `/api/fotky/${parentId}/${fileId}/data`);
    const a = document.createElement('a');
    a.href = f.data_b64;
    a.download = nazov || 'priloha';
    a.click();
  } catch(e) { notify('Chyba pri otváraní súboru', 'error'); }
  finally { loading(false); }
}

/* ── Nahrávanie súborov (fotky aj prílohy) ── */
async function handleFileUpload(inputEl, parentId, typ, category) {
  if (!inputEl.files || !inputEl.files.length) return;
  // Pre novú zákazku/servis použij dočasné ID
  if (!parentId) {
    parentId = typ === 'zakazka' ? State.newZakazkaTemp : State.newServisTemp;
    if (!parentId) return;
  }
  loading(true);
  try {
    const isImage = category === 'fotky';
    const uploads = Array.from(inputEl.files).map(async file => {
      let data_b64;
      if (isImage) {
        data_b64 = await compressImage(file);
      } else {
        data_b64 = await readFileB64(file);
      }
      return api('POST', '/api/fotky', {
        parent_id: parentId,
        typ,
        nazov: file.name,
        mime_type: file.type || 'application/octet-stream',
        data_b64
      });
    });
    await Promise.all(uploads);
    inputEl.value = '';
    const prefix = typ === 'zakazka' ? 'z' : 's';
    await loadMedia(parentId, prefix);
    notify('Fotky úspešne nahrané');
  } catch(e) {
    notify('Chyba pri nahrávaní: ' + e.message, 'error');
  } finally { loading(false); }
}

// Legacy compatibility
async function handleFotkyUpload(inputEl, parentId, typ, galleryId) {
  await handleFileUpload(inputEl, parentId, typ, 'fotky');
}

/* ── Vymazanie súboru ── */
async function deleteMedia(id, parentId, prefix) {
  if (!confirm('Naozaj vymazať tento súbor?')) return;
  try {
    loading(true);
    await api('DELETE', `/api/fotky/${id}`);
    await loadMedia(parentId, prefix);
    notify('Súbor vymazaný');
  } catch(e) { notify(e.message, 'error'); }
  finally { loading(false); }
}

// Legacy
async function deleteFotka(id, parentId, galleryId) {
  const prefix = galleryId?.startsWith('z_') ? 'z' : 's';
  await deleteMedia(id, parentId, prefix);
}

/* ── MODAL GALÉRIA (z tabuľky) ── */
async function openMediaModal(parentId) {
  State.mediaModalParentId = parentId;
  $('modalMediaTitle').textContent = 'Fotogaléria';
  openModal('modalMedia');
  await loadMediaModal(parentId);
}

async function loadMediaModal(parentId) {
  const fotkyEl = $('mm_fotky_gallery');
  if (!fotkyEl) return;
  fotkyEl.innerHTML = '<span class="media-loading">Načítavam...</span>';
  try {
    const files  = await api('GET', `/api/fotky/${parentId}`);
    const images = files.filter(f => (f.mime_type||'').startsWith('image/'));
    const fc = $('mm_fotky_count');
    if (fc) fc.textContent = images.length ? `(${images.length})` : '';
    if (!images.length) {
      fotkyEl.innerHTML = '<span class="media-empty">Žiadne fotky k tejto zákazke.</span>';
    } else {
      State.galleryImages = State.galleryImages || {};
      State.galleryImages[parentId] = images.map(f => ({ id: f.id, nazov: f.nazov || 'fotka' }));
      fotkyEl.innerHTML = images.map((f, idx) => `
        <div class="media-thumb media-thumb-lg">
          <div class="media-thumb-img-wrap">
            <div class="media-thumb-placeholder" onclick="openThumbLightbox('${parentId}','${f.id}','${f.nazov||''}',this,${idx})">
              <span class="media-thumb-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
              <span class="media-thumb-name">${(f.nazov||'fotka').slice(0,20)}</span>
            </div>
          </div>
        </div>`).join('');
    }
  } catch(e) {
    fotkyEl.innerHTML = `<span class="media-empty" style="color:var(--red)">Chyba: ${e.message}</span>`;
  }
}

function switchModalTab(tab) {
  ['fotky','prilohy'].forEach(t => {
    $(`mm_panel_${t}`)?.classList.toggle('d-none', t !== tab);
    $(`mmTab${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.toggle('active', t === tab);
  });
}

/* ── Lightbox – showLightbox + lightboxNav ── */
function showLightbox() {
  const img = _lightboxImages[_lightboxIdx];
  if (!img) return;
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  const lbCap = document.getElementById('lightboxCaption');
  if (!lb || !lbImg) return;
  lbImg.src = img.src || '';
  if (lbCap) lbCap.textContent = img.nazov || '';
  lb.style.display = 'flex';
  lb.style.alignItems = 'center';
  lb.style.justifyContent = 'center';
  // Prev/Next tlačidlá – zobraz len ak je viac obrázkov
  const prev = lb.querySelector('.lightbox-prev');
  const next = lb.querySelector('.lightbox-next');
  if (prev) prev.style.display = _lightboxImages.length > 1 ? '' : 'none';
  if (next) next.style.display = _lightboxImages.length > 1 ? '' : 'none';
}

function lightboxNav(dir) {
  if (!_lightboxImages.length) return;
  _lightboxIdx = (_lightboxIdx + dir + _lightboxImages.length) % _lightboxImages.length;
  showLightbox();
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
  const lbImg = document.getElementById('lightboxImg');
  if (lbImg) lbImg.src = '';
  // Zaisti aj zatvorenie starého overlaya (ak bol použitý)
  const ov = document.getElementById('lightboxOverlay');
  if (ov) ov.style.display = 'none';
}

// Keyboard navigation pre lightbox
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb || lb.style.display === 'none') return;
  if (e.key === 'ArrowRight') lightboxNav(1);
  else if (e.key === 'ArrowLeft') lightboxNav(-1);
  else if (e.key === 'Escape') closeLightbox();
});

/* ── Komprimovanie obrázkov ── */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = h * MAX / w; w = MAX; }
        if (h > MAX) { w = w * MAX / h; h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

/* ── Čítanie súboru ako base64 (pre prílohy) ── */
function readFileB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = e => {
      const bytes = new Uint8Array(e.target.result);
      let b64 = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      // Prefix so správnym MIME typom
      resolve(`data:${file.type || 'application/octet-stream'};base64,${btoa(b64)}`);
    };
    reader.onerror = reject;
  });
}



async function profilChangePassword() {
  const pw1 = $('profil_pw1')?.value || '';
  const pw2 = $('profil_pw2')?.value || '';
  const err = $('profil_pw_err');
  const ok  = $('profil_pw_ok');
  if (err) err.classList.add('d-none');
  if (ok)  ok.classList.add('d-none');
  if (!pw1 || pw1.length < 6) {
    if (err) { err.textContent = 'Heslo musí mať aspoň 6 znakov.'; err.classList.remove('d-none'); }
    return;
  }
  if (pw1 !== pw2) {
    if (err) { err.textContent = 'Heslá sa nezhodujú.'; err.classList.remove('d-none'); }
    return;
  }
  try {
    loading(true);
    await api('PUT', '/api/profil/password', { password: pw1 });
    $('profil_pw1').value = '';
    $('profil_pw2').value = '';
    if (ok) ok.classList.remove('d-none');
    notify('Heslo bolo úspešne zmenené');
  } catch(e) {
    if (err) { err.textContent = e.message || 'Chyba pri zmene hesla.'; err.classList.remove('d-none'); }
  } finally {
    loading(false);
  }
}

/* ══════════════════════════════════════════════════════════
   PROFIL – Môj profil
   ══════════════════════════════════════════════════════════ */
async function renderProfil() {
  const el = $('view-profil');
  if (!el) return;
  el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted);font-size:13px">Načítavam...</div>';

  try {
    const u = await api('GET', '/api/profil/me');
    const roleMap   = { owner: 'Konateľ', admin: 'Admin / Správca', store: 'Pobočka' };
    const roleClass = { owner: 'profil-role-owner', admin: 'profil-role-admin', store: 'profil-role-store' };
    const w = getDashWidgets();
    const initial = (u.username || '?')[0].toUpperCase();

    const widgetDefs = [
      { key: 'z_kpi',      name: 'Zákazky – KPI',        desc: 'Celkový prehľad zákaziek' },
      { key: 'stav_chips', name: 'Zákazky – Stavy',       desc: 'Čipy s rozpisom stavov' },
      { key: 's_kpi',      name: 'Servis – KPI',          desc: 'Celkový prehľad servisu' },
      { key: 'zdroj_chart',name: 'Graf zdrojov',          desc: 'Zákazky podľa zdroja' },
      { key: 'prod_chart', name: 'Graf produktov',        desc: 'Zákazky podľa produktu' },
      { key: 'store_cards',name: 'Karty obchodov',        desc: 'Výsledky jednotlivých pobočiek' },
      { key: 'store_charts',name:'Grafy obchodov',        desc: 'Porovnávacie grafy pobočiek' },
    ];

    el.innerHTML = `
      <div class="profil-wrap">

        <!-- Karta: info o používateľovi -->
        <div class="profil-card">
          <div class="profil-card-header">
            <div class="profil-avatar-lg">${initial}</div>
            <div>
              <div class="profil-username">${u.username || '—'}</div>
              <div>
                <span class="profil-role-badge ${roleClass[u.role] || 'profil-role-store'}">${roleMap[u.role] || u.role || '—'}</span>
              </div>
              ${u.store ? `<div class="profil-store-info">📍 ${u.store}</div>` : ''}
            </div>
          </div>

          <div class="profil-card-title">Informácie o účte</div>
          <div class="profil-card-body">
            <div class="profil-widgets-list">
              <div class="profil-widget-row">
                <div class="profil-widget-info">
                  <div class="profil-widget-name">Používateľské meno</div>
                </div>
                <span style="font-size:13px;font-weight:700;color:var(--ink)">${u.username || '—'}</span>
              </div>
              <div class="profil-widget-row">
                <div class="profil-widget-info">
                  <div class="profil-widget-name">2FA autentifikácia</div>
                  <div class="profil-widget-desc">Dvojfaktorové overenie pri prihlásení</div>
                </div>
                <span style="font-size:12px;font-weight:700;color:${u.mfa_enabled ? 'var(--green)' : 'var(--amber)'}">
                  ${u.mfa_enabled ? '✓ Aktívna' : '⚠ Nastavuje sa'}
                </span>
              </div>
              <div class="profil-widget-row">
                <div class="profil-widget-info">
                  <div class="profil-widget-name">Dátum vytvorenia</div>
                </div>
                <span style="font-size:12.5px;color:var(--muted)">${u.created_at ? u.created_at.slice(0,10) : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Karta: zmena hesla -->
        <div class="profil-card">
          <div class="profil-card-title">Zmena hesla</div>
          <div class="profil-card-desc">Heslo musí mať aspoň 6 znakov.</div>
          <div class="profil-card-body">
            <div style="margin-bottom:14px">
              <label class="form-label" style="display:block;margin-bottom:6px">Nové heslo</label>
              <input id="profil_pw1" type="password" class="input" placeholder="Zadajte nové heslo">
            </div>
            <div style="margin-bottom:18px">
              <label class="form-label" style="display:block;margin-bottom:6px">Potvrdiť heslo</label>
              <input id="profil_pw2" type="password" class="input" placeholder="Zopakujte nové heslo">
            </div>
            <div id="profil_pw_err" class="d-none" style="font-size:12px;color:var(--red);background:var(--red-lt);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px"></div>
            <div id="profil_pw_ok"  class="d-none" style="font-size:12px;color:var(--green);background:var(--green-lt);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px">✓ Heslo bolo úspešne zmenené</div>
            <button class="btn btn-primary" onclick="profilChangePassword()">Zmeniť heslo</button>
          </div>
        </div>

        ${u.role === 'owner' ? `
        <!-- Karta: nastavenia dashboardu -->
        <div class="profil-card">
          <div class="profil-card-title">Nastavenia dashboardu</div>
          <div class="profil-card-desc">Zapni alebo vypni jednotlivé sekcie na dashboarde.</div>
          <div class="profil-card-body">
            <div class="profil-widgets-list">
              ${widgetDefs.map(wd => `
                <div class="profil-widget-row">
                  <div class="profil-widget-info">
                    <div class="profil-widget-name">${wd.name}</div>
                    <div class="profil-widget-desc">${wd.desc}</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" ${w[wd.key] ? 'checked' : ''} onchange="toggleDashWidget('${wd.key}',this.checked)">
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  </label>
                </div>`).join('')}
            </div>
            <div style="margin-top:18px">
              <button class="btn btn-ghost btn-sm" onclick="resetDashWidgets()">Obnoviť predvolené nastavenia</button>
            </div>
          </div>
        </div>` : ''}

      </div>
    `;
  } catch(e) {
    el.innerHTML = `<div style="padding:40px;color:var(--red)">Chyba: ${e.message}</div>`;
  }
}

function toggleDashWidget(key, val) {
  setDashWidget(key, val);
}

function resetDashWidgets() {
  localStorage.removeItem(DASH_WIDGETS_KEY());
  renderProfil();
  notify('Nastavenia obnovené na predvolené');
}


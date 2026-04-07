/* =========================================================
   STORMS app.js – v6
   ========================================================= */
'use strict';

const API = '';

const MONTHS_SK = ['Január','Február','Marec','Apríl','Máj','Jún',
  'Júl','August','September','Október','November','December'];

/* Skloňovanie slovenských slov podľa čísla */
function sklonuj(n, jeden, dva, pat) {
  if (n === 1) return `${n} ${jeden}`;
  if (n >= 2 && n <= 4) return `${n} ${dva}`;
  return `${n} ${pat}`;
}
// zákazka: sklonuj(n, 'zákazka', 'zákazky', 'zákaziek')
// servis:  sklonuj(n, 'zásah',   'zásahy',  'zásahov')
// hodina:  sklonuj(n, 'hodina',  'hodiny',  'hodín')
const DAYS_SK = ['Nedeľa','Pondelok','Utorok','Streda','Štvrtok','Piatok','Sobota'];
const DAYS_SK_SHORT = ['Ne','Po','Ut','St','Št','Pi','So'];

/* ── Ember particles na login screene ───────────────────── */
(function initEmbers() {
  const screen = document.getElementById('loginScreen');
  if (!screen) return;

  const COLORS = [
    'rgba(196,98,31,.85)',   // amber
    'rgba(232,148,58,.75)',  // light amber
    'rgba(220,120,40,.7)',   // mid amber
    'rgba(180,80,20,.6)',    // dark amber
    'rgba(255,180,80,.5)',   // warm yellow
  ];
  const SIZES = [3, 4, 5, 6, 4, 3, 5];

  function spawnEmber() {
    const el = document.createElement('div');
    el.className = 'ember';
    const size = SIZES[Math.floor(Math.random() * SIZES.length)];
    const x = 15 + Math.random() * 70; // % od ľavého okraja
    const drift = (Math.random() - .4) * 80;
    const rise = 180 + Math.random() * 160;
    const dur = 3.2 + Math.random() * 2.8;
    const delay = Math.random() * .5;
    el.style.cssText = [
      `width:${size}px`, `height:${size}px`,
      `left:${x}%`, `bottom:${-size}px`,
      `background:${COLORS[Math.floor(Math.random()*COLORS.length)]}`,
      `box-shadow:0 0 ${size+2}px ${COLORS[0]}`,
      `--rise:-${rise}px`, `--drift:${drift}px`,
      `--dur:${dur}s`, `--delay:${delay}s`,
    ].join(';');
    screen.appendChild(el);
    setTimeout(() => el.remove(), (dur + delay) * 1000 + 100);
  }

  // Spawn každých 220ms kým je login screen viditeľný
  const iv = setInterval(() => {
    if (!document.getElementById('loginScreen') ||
        document.getElementById('loginScreen').style.display === 'none') {
      clearInterval(iv); return;
    }
    spawnEmber();
  }, 220);

  // Prvá vlna okamžite
  for (let i = 0; i < 6; i++) setTimeout(spawnEmber, i * 80);
})();

/* ── Živé hodiny v hlavičke ──────────────────────────────── */
function startHeaderClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('hdrClockTime');
    const dateEl = document.getElementById('hdrClockDate');
    if (!timeEl || !dateEl) return;

    // Čas HH:MM — slovenský presný čas (aktualizácia každú sekundu)
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    timeEl.textContent = `${h}:${m}`;

    // Deň, dátum
    const day  = DAYS_SK[now.getDay()];
    const date = now.getDate();
    const mon  = MONTHS_SK[now.getMonth()].slice(0,3);
    const year = now.getFullYear();
    dateEl.textContent = `${day}, ${date}. ${mon} ${year}`;
  }
  tick();
  setInterval(tick, 30000);
}
startHeaderClock();

const State = {
  token:null, user:null, tab:'dashboard',
  zakazky:{ page:1, perPage:25, sortCol:'created_at', sortDir:'desc',
    filters:{ q:'', stav:'', typ_prod:'', zdroj:'', obchod:'', mesiac:'', rok:String(new Date().getFullYear()) } },
  servis:{ page:1, perPage:25, sortCol:'created_at', sortDir:'desc',
    filters:{ q:'', typ:'', zaruka:'', obchod:'', mesiac:'', rok:String(new Date().getFullYear()) } },
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

/* ── Poznámka popover ─────────────────────────────────────── */
function showPoznámka(btn, id) {
  const existing = document.getElementById('poznPopover');
  if (existing) { existing.remove(); if (existing._btn === btn) return; }
  const text = btn.getAttribute('data-text') || '';
  const pop = document.createElement('div');
  pop.id = 'poznPopover';
  pop._btn = btn;
  pop.className = 'pozn-popover';
  pop.innerHTML = `<div class="pozn-popover-text">${text.replace(/\n/g,'<br>')}</div>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const pw = 260;
  let left = r.left + window.scrollX;
  if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
  pop.style.left = left + 'px';
  pop.style.top  = (r.bottom + window.scrollY + 6) + 'px';
  pop.style.width = pw + 'px';
  setTimeout(() => document.addEventListener('click', function h(e){
    if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('click',h); }
  }), 0);
}

/* ── Toggle heslo viditeľnosť ─────────────────────────────── */
function togglePwVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

/* ── Zákazka detail modal (readonly, kompletné info + fotky) ── */
async function showZakazkaDetail(id) {
  try {
    loading(true);
    const r = await api('GET', `/api/zakazky/${id}`);
    const stavColor = {Dopyt:'#C4621F',Obhliadka:'#5E3D80',Ponuka:'#7A6218',Objednané:'#284F96',Realizované:'#306B47',Storno:'#9E2828'};
    const stavBg    = {Dopyt:'#F5E6D6',Obhliadka:'#EAE0F5',Ponuka:'#F3E9C8',Objednané:'#D8E5F6',Realizované:'#E0EEE7',Storno:'#F5E0E0'};
    const trzba   = (parseFloat(r.cena_krb)||0)+(parseFloat(r.cena_komin)||0)+(parseFloat(r.cena_montaz)||0)+(parseFloat(r.cena_prislus)||0)+(parseFloat(r.doprava_fakt)||0);
    const naklady = (parseFloat(r.nakup_krb)||0)+(parseFloat(r.nakup_komin)||0)+(parseFloat(r.naklad_montaz)||0)+(parseFloat(r.nakup_prislus)||0)+(parseFloat(r.naklad_doprava)||0);
    const marza   = trzba - naklady;
    const marzaPct = trzba > 0 ? (marza/trzba*100) : 0;
    const row = (label, val) => (val != null && val !== '' && val !== 0 && val !== '0') ? `<div class="zd-row"><span class="zd-label">${label}</span><span class="zd-val">${val}</span></div>` : '';
    const eur = v => (v != null && parseFloat(v) !== 0) ? fmtEur(parseFloat(v)||0) : null;
    const dt  = v => v ? v.slice(0,10) : null;

    const html = `
      <div class="zd-header">
        <div class="zd-id">${r.id}</div>
        <span class="zd-stav-badge" style="color:${stavColor[r.stav]||'var(--muted)'};background:${stavBg[r.stav]||'var(--sand-lt)'}">${r.stav||'—'}</span>
        ${r.obchod ? `<span class="zd-stav-badge" style="color:var(--muted);background:var(--sand-lt)">${r.obchod}</span>` : ''}
      </div>
      <div class="zd-grid">
        <div class="zd-section">
          <div class="zd-section-title">Zákazník</div>
          ${row('Meno', r.zakaznik)}
          ${row('Typ zákazníka', r.typ_zak)}
          ${row('Lokalita', r.lokalita)}
          ${row('Zdroj leadu', r.zdroj)}
          ${row('Výsledok obhliadky', r.vysledok)}
        </div>
        <div class="zd-section">
          <div class="zd-section-title">Dátumy</div>
          ${row('Dopyt', dt(r.dopyt_d))}
          ${row('Obhliadka', dt(r.obhliadka_d))}
          ${row('Ponuka', dt(r.ponuka_d))}
          ${row('Objednávka / zmluva', dt(r.objednavka_d))}
        </div>
        <div class="zd-section">
          <div class="zd-section-title">Produkt</div>
          ${row('Typ produktu', r.typ_prod)}
          ${row('Typ riešenia', r.typ_riesenia)}
          ${row('Model / Značka', r.model)}
        </div>
        <div class="zd-section">
          <div class="zd-section-title">Financie (predaj → nákup)</div>
          ${row('Krb/pec', r.cena_krb||r.nakup_krb ? `${eur(r.cena_krb)||'—'} → ${eur(r.nakup_krb)||'—'}` : null)}
          ${row('Komín', r.cena_komin||r.nakup_komin ? `${eur(r.cena_komin)||'—'} → ${eur(r.nakup_komin)||'—'}` : null)}
          ${row('Montáž', r.cena_montaz||r.naklad_montaz ? `${eur(r.cena_montaz)||'—'} → ${eur(r.naklad_montaz)||'—'}` : null)}
          ${row('Príslušenstvo', r.cena_prislus||r.nakup_prislus ? `${eur(r.cena_prislus)||'—'} → ${eur(r.nakup_prislus)||'—'}` : null)}
          ${row('Doprava', r.doprava_fakt||r.naklad_doprava ? `${eur(r.doprava_fakt)||'—'} → ${eur(r.naklad_doprava)||'—'}` : null)}
          ${r.zlava ? row('Zľava', r.zlava+'%') : ''}
        </div>
      </div>
      <div class="zd-fin-bar">
        <div class="zd-fin-item"><div class="zd-fin-label">Tržba</div><div class="zd-fin-val">${fmtEur(trzba)}</div></div>
        <div class="zd-fin-item"><div class="zd-fin-label">Náklady</div><div class="zd-fin-val">${fmtEur(naklady)}</div></div>
        <div class="zd-fin-item zd-fin-marza"><div class="zd-fin-label">Marža</div><div class="zd-fin-val" style="color:${marza>=0?'var(--green)':'var(--red)'}">${fmtEur(marza)}<span style="font-size:11px;font-weight:500;opacity:.7;margin-left:4px">(${fmtPct(marzaPct)})</span></div></div>
      </div>
      ${r.poznamka ? `<div class="zd-poznamka"><div class="zd-section-title" style="margin-bottom:6px">Poznámka</div><div class="zd-poznamka-text">${r.poznamka.replace(/\n/g,'<br>')}</div></div>` : ''}
      <div class="zd-section" style="margin-top:16px">
        <div class="zd-section-title">Fotky</div>
        <div id="zd_fotky_gallery" class="media-gallery" style="margin-top:8px"><span class="media-loading">Načítavam...</span></div>
      </div>
    `;
    showDetailModal(`Zákazka ${id}`, html, () => editZakazka(id));
    // Načítaj fotky do detail modalu
    setTimeout(() => loadDetailFotky(id, 'zd_fotky_gallery'), 80);
  } catch(e) { notify(e.message,'error'); } finally { loading(false); }
}

async function showServisDetail(id) {
  try {
    loading(true);
    const r = await api('GET', `/api/servis/${id}`);
    const marza   = (parseFloat(r.fakturovane)||0) - (parseFloat(r.naklad)||0);
    const marzaPct = (parseFloat(r.fakturovane)||0) > 0 ? (marza / parseFloat(r.fakturovane) * 100) : 0;
    const row = (label, val) => (val != null && val !== '') ? `<div class="zd-row"><span class="zd-label">${label}</span><span class="zd-val">${val}</span></div>` : '';
    const eur = v => v != null && v !== '' ? fmtEur(parseFloat(v)||0) : null;

    const html = `
      <div class="zd-header">
        <div class="zd-id">${r.id}</div>
        ${r.zaruka==='Áno' ? '<span class="zd-stav-badge" style="color:#306B47;background:#E0EEE7">Záruka</span>' : r.zaruka==='Nie' ? '<span class="zd-stav-badge" style="color:#284F96;background:#D8E5F6">Platené</span>' : ''}
        ${r.obchod ? `<span class="zd-stav-badge" style="color:var(--muted);background:var(--sand-lt)">${r.obchod}</span>` : ''}
      </div>
      <div class="zd-grid">
        <div class="zd-section">
          <div class="zd-section-title">Servisný zásah</div>
          ${row('Zákazník', r.zakaznik)}
          ${row('Dátum', r.datum ? r.datum.slice(0,10) : null)}
          ${row('Technik', r.technik)}
          ${row('Typ zásahu', r.typ)}
          ${row('Záruka', r.zaruka)}
        </div>
        <div class="zd-section">
          <div class="zd-section-title">Financie</div>
          ${row('Fakturované', eur(r.fakturovane))}
          ${row('Náklad', eur(r.naklad))}
          ${row('Odpracovaný čas', r.cas != null && r.cas !== '' ? r.cas+' h' : null)}
        </div>
      </div>
      <div class="zd-fin-bar">
        <div class="zd-fin-item"><div class="zd-fin-label">Fakturované</div><div class="zd-fin-val">${fmtEur(r.fakturovane||0)}</div></div>
        <div class="zd-fin-item"><div class="zd-fin-label">Náklad</div><div class="zd-fin-val">${fmtEur(r.naklad||0)}</div></div>
        <div class="zd-fin-item zd-fin-marza"><div class="zd-fin-label">Marža</div><div class="zd-fin-val" style="color:${marza>=0?'var(--green)':'var(--red)'}">${fmtEur(marza)}<span style="font-size:11px;font-weight:500;opacity:.7;margin-left:4px">(${fmtPct(marzaPct)})</span></div></div>
      </div>
      ${r.poznamka ? `<div class="zd-poznamka"><div class="zd-section-title" style="margin-bottom:6px">Poznámka</div><div class="zd-poznamka-text">${r.poznamka.replace(/\n/g,'<br>')}</div></div>` : ''}
      <div class="zd-section" style="margin-top:16px">
        <div class="zd-section-title">Fotky</div>
        <div id="zd_fotky_gallery" class="media-gallery" style="margin-top:8px"><span class="media-loading">Načítavam...</span></div>
      </div>
    `;
    showDetailModal(`Servis ${id}`, html, () => editServis(id));
    setTimeout(() => loadDetailFotky(id, 'zd_fotky_gallery'), 80);
  } catch(e) { notify(e.message,'error'); } finally { loading(false); }
}

async function loadDetailFotky(parentId, galleryId) {
  const el = document.getElementById(galleryId);
  if (!el) return;
  try {
    const files = await api('GET', `/api/fotky/${parentId}`);
    const images = files.filter(f => (f.mime_type||'').startsWith('image/'));
    if (!images.length) { el.innerHTML = '<span class="media-empty">Žiadne fotky.</span>'; return; }
    State.galleryImages = State.galleryImages || {};
    State.galleryImages[parentId] = images.map(f => ({ id: f.id, nazov: f.nazov||'fotka' }));
    el.innerHTML = images.map((f, idx) => `
      <div class="media-thumb">
        <div class="media-thumb-img-wrap">
          <div class="media-thumb-placeholder" id="thumb_det_${f.id}" onclick="openThumbLightbox('${parentId}','${f.id}','${f.nazov||''}',this,${idx})">
            <span class="media-thumb-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
            <span class="media-thumb-name">${(f.nazov||'fotka').slice(0,18)}</span>
          </div>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = `<span class="media-empty" style="color:var(--red)">Chyba: ${e.message}</span>`; }
}

function showDetailModal(title, bodyHtml, onEdit) {
  let m = document.getElementById('modalDetail');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modalDetail';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal modal-detail">
      <div class="modal-header">
        <h3 id="modalDetailTitle"></h3>
        <button class="modal-close" onclick="closeModal('modalDetail')"></button>
      </div>
      <div class="modal-body" id="modalDetailBody"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modalDetail')">Zavrieť</button>
        <button class="btn btn-primary" id="modalDetailEditBtn">Upraviť</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  document.getElementById('modalDetailTitle').textContent = title;
  document.getElementById('modalDetailBody').innerHTML = bodyHtml;
  document.getElementById('modalDetailEditBtn').onclick = () => { closeModal('modalDetail'); onEdit(); };
  openModal('modalDetail');
}


function notify(msg, type='success') {
  $('notif').className=`notif show ${type}`;
  $('notifText').textContent=msg;
  clearTimeout(notify._t);
  notify._t=setTimeout(()=>$('notif').classList.remove('show'),3200);
}
function loading(v){ $('loadingOverlay').classList.toggle('show',v); }

/* ── API ──────────────────────────────────────────────────── */
async function api(method,path,body){
  const opts={method,headers:{'Content-Type':'application/json'},credentials:'include'};
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
function yearOptions(val='') {
  const curY = new Date().getFullYear();
  let opts = `<option value="">Všetky roky</option>`;
  for (let y = curY; y >= curY - 4; y--) {
    opts += `<option value="${y}" ${String(val)===String(y)?'selected':''}>${y}</option>`;
  }
  return opts;
}
function monthOptions(val='') {
  let opts = `<option value="">Všetky mesiace</option>`;
  for (let i = 0; i < 12; i++) {
    const v = String(i+1).padStart(2,'0');
    opts += `<option value="${v}" ${val===v?'selected':''}>${MONTHS_SK[i]}</option>`;
  }
  return opts;
}

/* ── Login ────────────────────────────────────────────────── */
let tempAuthToken = null;

function toggleLoginPassword() {
  const inp = document.getElementById('loginPassword');
  const icon = document.getElementById('eyeIcon');
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  // Prepni ikonu: oko → oko-preškrtnuté
  icon.innerHTML = isHidden
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
}

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

/* ── Dropdown profil menu ──────────────────────────────── */
function toggleUserDropdown() {
  const dd = document.getElementById('hdrDropdown');
  const ch = document.getElementById('hdrChevron');
  const isOpen = dd.classList.contains('open');
  if (isOpen) {
    dd.classList.remove('open');
    ch.style.transform = '';
  } else {
    // Naplníme dropdown aktuálnymi údajmi
    const u = State.user;
    const roleMap = { owner: 'Konateľ', admin: 'Admin / Správca', store: 'Pobočka' };
    const initial = (u?.username || '?')[0].toUpperCase();
    const dropAvatar = document.getElementById('hdrDropAvatar');
    const dropName   = document.getElementById('hdrDropName');
    const dropRole   = document.getElementById('hdrDropRole');
    if (dropAvatar) dropAvatar.textContent = initial;
    if (dropName)   dropName.textContent   = u?.username || '—';
    if (dropRole)   dropRole.textContent   = roleMap[u?.role] || u?.role || '—';
    dd.classList.add('open');
    ch.style.transform = 'rotate(180deg)';
  }
}
function closeUserDropdown() {
  const dd = document.getElementById('hdrDropdown');
  const ch = document.getElementById('hdrChevron');
  if (dd) dd.classList.remove('open');
  if (ch) ch.style.transform = '';
}
// Zatvor dropdown keď klikneš mimo
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('hdrUserWrap');
  if (wrap && !wrap.contains(e.target)) closeUserDropdown();
});

function hideSplash(showLogin = false) {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => {
    splash.style.display = 'none';
    if (showLogin) {
      const ls = document.getElementById('loginScreen');
      if (ls) ls.style.display = '';
    }
  }, 300);
}

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
      hideSplash(true);
    });
  } else {
    hideSplash(true);
  }
})();

/* ── Init App ─────────────────────────────────────────────── */
function initApp(){
  $('loginScreen').style.display = 'none';
  $('appShell').classList.add('visible');
  hideSplash(false);
  applyAppSettings();
  // Nastav aktuálny rok v footeri
  const fy = document.getElementById('footerYear');
  if (fy) fy.textContent = new Date().getFullYear();
  const u = State.user;

  const roleMap = {owner:'Konateľ', admin:'Admin / Správca', store:'Pobočka'};
  $('topbarUsername').textContent = u.username || '';
  $('topbarRole').textContent = roleMap[u.role] || '';
  const avatarEl = $('topbarAvatarLetter'); if(avatarEl) avatarEl.textContent = (u.username||'?')[0].toUpperCase();

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

  // 2. AŽ POTOM skryjeme tie, na ktoré nemá používateľ právo
  // Používatelia (iba pre Majiteľa a Admina)
  if (u.role === 'admin') {
    // ADMIN / SPRÁVCA: Vidí iba sekciu Používatelia
    ['dashboard', 'zakazky', 'servis'].forEach(tab => {
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach(t => t.classList.add('d-none'));
    });
    showTab('users');
  }
  else if (u.role === 'owner') {
    // KONATEĽ: Vidí všetko vrátane Používateľov + nastavenia
    const sBtn = document.getElementById('hdrSettingsBtn');
    if (sBtn) sBtn.classList.remove('d-none');
    const fub = document.getElementById('footerUsersBtn');
    if (fub) fub.style.display = '';
    const savedTab = localStorage.getItem('storms_last_tab');
    const allowedOwner = ['dashboard','zakazky','servis','profil'];
    showTab(allowedOwner.includes(savedTab) ? savedTab : 'dashboard');
  }
  else {
    // POBOČKA: Vidí dashboard (vlastný), zákazky, servis, profil — NIE používateľov
    document.querySelectorAll('[data-tab="users"]').forEach(t => t.classList.add('d-none'));
    // Pobočka tiež má nastavenia (tmavý režim, kompaktné tabuľky, animácie)
    const sBtn = document.getElementById('hdrSettingsBtn');
    if (sBtn) sBtn.classList.remove('d-none');
    // Pobočka NESMIE vidieť sekciu Používatelia vo footeri
    const fub = document.getElementById('footerUsersBtn');
    if (fub) fub.style.display = 'none';
    const savedTabS = localStorage.getItem('storms_last_tab');
    const allowedStore = ['dashboard','zakazky','servis','profil'];
    showTab(allowedStore.includes(savedTabS) ? savedTabS : 'dashboard');
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
  try { localStorage.setItem('storms_last_tab', tabId); } catch(e) {}

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

  // Heat-in animácia pri prepnutí tabu
  if (activeEl) {
    activeEl.style.animation = 'none';
    void activeEl.offsetWidth; // reflow
    activeEl.style.animation = '';
  }
}


/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */

/* ── Dashboard widget prefs (uložené v localStorage per user) ── */
const DASH_WIDGETS_KEY       = () => `dash_widgets_${State.user?.id||'x'}`;
const STORE_DASH_WIDGETS_KEY = () => `store_dash_widgets_owner`;  // Owner nastavuje pre všetky pobočky
const APP_SETTINGS_KEY       = () => `app_settings_${State.user?.id||'x'}`;

const DASH_WIDGETS_DEFAULT = {
  z_kpi: true, stav_chips: true, s_kpi: true,
  zdroj_chart: true, prod_chart: true,
  store_cards: true, store_charts: true
};

// Čo môžu pobočky vidieť na svojom dashboarde (owner to nastavuje)
const STORE_DASH_DEFAULT = {
  sd_kpi_zakazky:  true,   // KPI karty zákazky
  sd_kpi_servis:   true,   // KPI karta servis
  sd_marza:        true,   // Marža zákaziek
  sd_stavy:        true,   // Stavy zákaziek
  sd_zdroj:        true,   // Graf zdrojov
  sd_produkt:      true,   // Graf produktov
  sd_recent:       true,   // Posledné zákazky
};

// Aplikačné nastavenia (per user)
const APP_SETTINGS_DEFAULT = {
  dark_mode:        false,
  compact_tables:   false,
  animations:       true,
  show_clock:       true,
};

function getStoreDashWidgets() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_DASH_WIDGETS_KEY())||'{}');
    return Object.assign({}, STORE_DASH_DEFAULT, saved);
  } catch(e) { return {...STORE_DASH_DEFAULT}; }
}
function setStoreDashWidget(key, val) {
  const prefs = getStoreDashWidgets();
  prefs[key] = val;
  localStorage.setItem(STORE_DASH_WIDGETS_KEY(), JSON.stringify(prefs));
}

function getAppSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY())||'{}');
    return Object.assign({}, APP_SETTINGS_DEFAULT, saved);
  } catch(e) { return {...APP_SETTINGS_DEFAULT}; }
}
function setAppSetting(key, val) {
  const s = getAppSettings();
  s[key] = val;
  localStorage.setItem(APP_SETTINGS_KEY(), JSON.stringify(s));
  applyAppSettings();
}

function applyAppSettings() {
  const s = getAppSettings();
  const isDark = !!s.dark_mode;
  document.body.classList.toggle('dark', isDark);
  document.body.classList.toggle('compact-tables', !!s.compact_tables);
  document.body.classList.toggle('no-animations', !s.animations);
  // Hodiny v hlavičke
  const clock = document.getElementById('hdrClock');
  if (clock) clock.classList.toggle('d-none', !s.show_clock);
  // Logo swap — svetlý vs tmavý režim
  const logoSrc = isDark ? 'images2.png' : 'images.png';
  document.querySelectorAll('img.hdr-logo-img, img.login-logo-img').forEach(img => img.src = logoSrc);
}
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

function renderPrivDashboard(el, d) {
  const { zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, storeBreakdown, recent, recentS } = d;
  const w = getDashWidgets();
  const stavMap = {};
  stavCounts.forEach(s => stavMap[s.stav || '—'] = s.cnt);
  const zMarzaPct  = zKpi.trzba > 0 ? (zKpi.marza / zKpi.trzba * 100) : 0;
  const sMarzaPct  = sKpi.fakturovane > 0 ? (sKpi.marza / sKpi.fakturovane * 100) : 0;
  const realizPct  = zKpi.total > 0 ? Math.round(zKpi.realizovane / zKpi.total * 100) : 0;

  const stavColor = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg    = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };

  const ico = {
    zakazky: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    trzba:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    marza:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>`,
    servis:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M5.34 5.34 3.93 3.93M12 20v2M12 2v2"/></svg>`,
    store:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
    arrow:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>`,
  };

  /* ── Pomocná funkcia: sekcia s hlavičkou ─────────── */
  function section(key, title, content, extraStyle='') {
    if (!w[key]) return '';
    return `<div class="db-section" style="${extraStyle}">
      <div class="db-section-head"><span class="db-section-title">${title}</span></div>
      ${content}
    </div>`;
  }

  /* ── Mini progress bar pre grafy ─────────────────── */
  function miniBar(items, labelKey, valKey, color) {
    if (!items || !items.length) return `<div class="db-empty">Žiadne dáta</div>`;
    const max = Math.max(...items.map(i => i[valKey] || 0), 1);
    return `<div style="display:flex;flex-direction:column;gap:8px">` +
        items.slice(0, 6).map(item => {
          const pct = Math.round((item[valKey] || 0) / max * 100);
          const val = (valKey === 'trzba' || valKey === 'marza' || valKey === 'fakturovane') ? fmtEur(item[valKey] || 0) : (item[valKey] || 0);
          return `<div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;color:var(--muted);min-width:82px;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item[labelKey] || '—'}</div>
          <div style="flex:1;height:7px;background:var(--sand-lt);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--ink);min-width:40px;text-align:right">${val}</div>
        </div>`;
        }).join('') + `</div>`;
  }

  /* ── Posledné zákazky ─────────────────────────────── */
  const POCITANE = new Set(['Objednané','Realizované']);
  const recentRows = (recent || []).slice(0, 5).map(r => {
    const sc = stavColor[r.stav] || 'var(--muted)';
    const sb = stavBg[r.stav] || 'var(--sand-lt)';
    const isPocitana = POCITANE.has(r.stav);
    const marzaColor = isPocitana ? ((r.marza_eur > 0) ? 'var(--green)' : 'var(--red)') : 'var(--muted2)';
    const trzbaColor = isPocitana ? 'var(--ink)' : 'var(--muted2)';
    const dateStr = r.dopyt_d ? r.dopyt_d.slice(0,10) : (r.created_at ? r.created_at.slice(0,10) : '');
    return `<div class="db-recent-row">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')" style="font-size:10px">${r.id||'—'}</button>
          <span style="font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.zakaznik || '—'}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted2);margin-top:2px;display:flex;gap:6px;align-items:center">
          <span>${r.typ_prod || '—'}</span>
          ${r.obchod ? `<span style="color:var(--border2)">·</span><span>${r.obchod.replace('Obchod ','')}</span>` : ''}
          ${dateStr ? `<span style="color:var(--border2)">·</span><span>${dateStr}</span>` : ''}
        </div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${sc};background:${sb};padding:3px 10px;border-radius:99px;flex-shrink:0;white-space:nowrap">${r.stav || '—'}</span>
      <div style="text-align:right;flex-shrink:0;min-width:76px">
        <div style="font-size:13px;font-weight:800;color:var(--ink)">${fmtEur(r.trzba)}</div>
        <div style="font-size:10px;color:${r.marza_eur > 0 ? 'var(--green)' : r.marza_eur < 0 ? 'var(--red)' : 'var(--muted2)'};margin-top:1px;font-weight:600">${r.marza_eur != null ? fmtEur(r.marza_eur) : '—'}</div>
      </div>
    </div>`;
  }).join('');

  /* ── Store karty ──────────────────────────────────── */
  const storeCardsHtml = (storeBreakdown || []).map(({ store, z, s }) => {
    const mp   = z.trzba > 0 ? (z.marza / z.trzba * 100) : 0;
    const rPct = z.total > 0 ? Math.round(z.realizovane / z.total * 100) : 0;
    const short = store.replace('Obchod ', '');
    return `<div class="db-store-card">
      <div class="db-store-card-top">
        <div class="db-store-icon">${ico.store}</div>
        <div>
          <div class="db-store-name">${short}</div>
          <div class="db-store-sub">${sklonuj(z.total,'zákazka','zákazky','zákaziek')}</div>
        </div>
        <span class="db-store-pill">${fmtPct(mp)}</span>
      </div>
      <div class="db-store-grid">
        <div class="db-store-stat db-store-stat-amber">
          <div class="db-store-stat-label">Tržba</div>
          <div class="db-store-stat-val">${fmtEur(z.trzba)}</div>
        </div>
        <div class="db-store-stat db-store-stat-green">
          <div class="db-store-stat-label">Marža</div>
          <div class="db-store-stat-val" style="color:var(--green)">${fmtEur(z.marza)}</div>
        </div>
        <div class="db-store-stat">
          <div class="db-store-stat-label">Realizované</div>
          <div class="db-store-stat-val">${z.realizovane}/${z.total}</div>
        </div>
        <div class="db-store-stat">
          <div class="db-store-stat-label">Servis</div>
          <div class="db-store-stat-val" style="color:var(--blue)">${fmtEur(s.fakturovane)}</div>
        </div>
      </div>
      <div class="db-store-progress-wrap">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:10px;color:var(--muted)">Realizované</span>
          <span style="font-size:10px;font-weight:700;color:var(--green)">${rPct}%</span>
        </div>
        <div class="db-progress-track"><div class="db-progress-fill" style="width:${rPct}%;background:var(--green)"></div></div>
      </div>
      <div class="db-store-footer">
        <span style="font-size:11px;color:var(--muted)">Servis zásahov: ${s.total}</span>
        <span style="font-size:11px;color:var(--muted2)">${fmtEur(s.marza || 0)} marža</span>
      </div>
    </div>`;
  }).join('');

  /* ── Store grafy (bar charts porovnávanie) ────────── */
  const trzbaData    = (storeBreakdown || []).map(({ store, z }) => ({ label: store.replace('Obchod ',''), trzba: z.trzba }));
  const marzaData    = (storeBreakdown || []).map(({ store, z }) => ({ label: store.replace('Obchod ',''), marza: z.marza }));
  const servisData   = (storeBreakdown || []).map(({ store, s }) => ({ label: store.replace('Obchod ',''), fakturovane: s.fakturovane }));

  /* ════════════════ RENDER ════════════════ */
  const h = new Date().getHours();
  const ownerGreet = h < 10 ? 'Dobré ráno' : h < 13 ? 'Dobré dopoludnie' : h < 18 ? 'Dobrý deň' : 'Dobrý večer';
  const ownerName  = State.user?.username || '—';
  const storeCount = (storeBreakdown || []).length;
  const todayDate  = new Date().toLocaleDateString('sk-SK', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  el.innerHTML = `<div class="db-root">

    <!-- OWNER HERO -->
    <div class="owner-hero">
      <div class="owner-hero-greet">${ownerGreet}</div>
      <div class="owner-hero-name">${ownerName}</div>
      <div class="owner-hero-date">${todayDate}</div>
    </div>

    ${w.z_kpi ? `
    <!-- ═══ TOP KPI KARTY ═══ -->
    <div class="db-kpi-grid">

      <div class="db-kpi-hero">
        <div class="db-kpi-hero-deco1"></div>
        <div class="db-kpi-hero-deco2"></div>
        <div class="db-kpi-hero-icon">${ico.zakazky}</div>
        <div class="db-kpi-hero-label">Zákazky celkom</div>
        <div class="db-kpi-hero-val">${zKpi.total}</div>
        <div class="db-kpi-hero-sub">${sklonuj(zKpi.realizovane,'realizovaná','realizované','realizovaných')} z ${zKpi.total}</div>
        <div class="db-progress-track" style="margin-top:14px">
          <div class="db-progress-fill" style="width:${realizPct}%;background:rgba(255,255,255,.5)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <span style="font-size:10px;opacity:.65">Úspešnosť realizácie</span>
          <span style="font-size:11px;font-weight:800;opacity:.9">${realizPct}%</span>
        </div>
      </div>

      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-amber">${ico.trzba}</div>
        <div class="db-kpi-card-label">Tržba zákaziek</div>
        <div class="db-kpi-card-val">${fmtEur(zKpi.trzba)}</div>
        <div class="db-kpi-card-sub">Náklady: <strong style="color:var(--ink)">${fmtEur(zKpi.naklady)}</strong></div>
      </div>

      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-green">${ico.marza}</div>
        <div class="db-kpi-card-label">Marža zákaziek</div>
        <div class="db-kpi-card-val" style="color:var(--green)">${fmtEur(zKpi.marza)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <span class="db-badge db-badge-green">${fmtPct(zMarzaPct)}</span>
          <span style="font-size:11px;color:var(--muted2)">marža %</span>
        </div>
      </div>

      ${w.s_kpi ? `
      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-blue">${ico.servis}</div>
        <div class="db-kpi-card-label">Servis fakturovaný</div>
        <div class="db-kpi-card-val" style="color:var(--blue)">${fmtEur(sKpi.fakturovane)}</div>
        <div class="db-kpi-card-sub">${sKpi.total} zásahov · ${fmtNum(sKpi.cas)} h</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <span class="db-badge db-badge-green">${fmtEur(sKpi.marza)}</span>
          <span style="font-size:11px;color:var(--muted2)">${fmtPct(sMarzaPct)} marža</span>
        </div>
      </div>` : ''}

    </div>` : ''}

    ${w.stav_chips ? `
    <!-- ═══ STAVY ═══ -->
    <div class="db-section">
      <div class="db-section-head">
        <span class="db-section-title">Stavy zákaziek</span>
        <span style="font-size:11px;color:var(--muted2);font-weight:500">${sklonuj(zKpi.total,'zákazka','zákazky','zákaziek')} celkom</span>
      </div>
      <div class="db-stavы">
        ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s => `
          <div class="db-stav-tile" data-stav="${s}">
            <div class="db-stav-val">${stavMap[s] || 0}</div>
            <div class="db-stav-label">${s}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${(w.zdroj_chart || w.prod_chart || (recent && recent.length > 0)) ? `
    <!-- ═══ GRAFY + POSLEDNÉ ZÁKAZKY ═══ -->
    <div class="db-mid-grid">

      ${(w.zdroj_chart || w.prod_chart) ? `
      <div style="display:flex;flex-direction:column;gap:16px">
        ${w.zdroj_chart ? `
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Zdroj zákaziek</span></div>
          <div class="db-card-body">${miniBar(zdrojCounts||[], 'zdroj', 'cnt', 'var(--amber)')}</div>
        </div>` : ''}
        ${w.prod_chart ? `
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Zákazky podľa produktu</span></div>
          <div class="db-card-body">${miniBar(prodCounts||[], 'typ_prod', 'cnt', 'var(--blue)')}</div>
        </div>` : ''}
      </div>` : ''}

      <div class="db-card">
        <div class="db-card-head">
          <span class="db-card-title">Posledné zákazky</span>
          <button onclick="showTab('zakazky')" class="db-link-btn">Všetky ${ico.arrow}</button>
        </div>
        <div class="db-card-body" style="padding-top:0">
          ${recentRows || '<div class="db-empty">Žiadne zákazky</div>'}
        </div>
      </div>

    </div>` : ''}

    ${storeBreakdown ? `

    ${w.store_cards ? `
    <!-- ═══ OBCHODY – KARTY ═══ -->
    <div class="db-section">
      <div class="db-section-head">
        <span class="db-section-title">Prehľad obchodov</span>
      </div>
      <div class="db-store-grid-outer">${storeCardsHtml}</div>
    </div>` : ''}

    ${w.store_charts ? `
    <!-- ═══ OBCHODY – GRAFY ═══ -->
    <div class="db-section">
      <div class="db-section-head"><span class="db-section-title">Porovnanie obchodov</span></div>
      <div class="db-charts-3col">
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Tržba zákaziek</span></div>
          <div class="db-card-body">${miniBar(trzbaData, 'label', 'trzba', 'var(--amber)')}</div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Marža zákaziek</span></div>
          <div class="db-card-body">${miniBar(marzaData, 'label', 'marza', 'var(--green)')}</div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Servis fakturovaný</span></div>
          <div class="db-card-body">${miniBar(servisData, 'label', 'fakturovane', 'var(--blue)')}</div>
        </div>
      </div>
    </div>` : ''}

    ` : ''}

  </div>`;
}

function renderStoreDashboard(el, d) {
  const { zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, recent } = d;
  const stavMap = {};
  if (stavCounts) stavCounts.forEach(s => stavMap[s.stav || '—'] = s.cnt);
  const realizPct  = (zKpi?.total || 0) > 0 ? Math.round((zKpi?.realizovane || 0) / zKpi.total * 100) : 0;
  const zMarzaPct  = (zKpi?.trzba || 0) > 0 ? (((zKpi?.marza || 0) / zKpi.trzba) * 100) : 0;
  const stavColor  = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg     = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };

  const u = State.user;
  const storeName = u?.store ? u.store.split(',')[0].replace('Obchod ','') : 'Moja pobočka';

  // Pozdrav podľa hodiny
  const h = new Date().getHours();
  const greet = h < 10 ? 'Dobré ráno' : h < 13 ? 'Dobré dopoludnie' : h < 18 ? 'Dobrý deň' : 'Dobrý večer';

  // SVG ikony
  const icoZak = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const icoEur = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  const icoSrv = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-4 4-4 8a4 4 0 0 0 8 0c0-4-4-8-4-8z"/><path d="M12 14c0 0-2 2-2 3.5a2 2 0 0 0 4 0C14 16 12 14 12 14z"/></svg>`;
  const icoMrz = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>`;

  // Mini bar chart helper
  function miniBarS(items, labelKey, valKey, color) {
    if (!items || !items.length) return `<div class="db-empty">Žiadne dáta</div>`;
    const max = Math.max(...items.map(i => i[valKey] || 0), 1);
    return `<div style="display:flex;flex-direction:column;gap:8px">` +
        items.slice(0, 5).map(item => {
          const pct = Math.round((item[valKey] || 0) / max * 100);
          return `<div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;color:var(--muted);min-width:80px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item[labelKey] || '—'}</div>
          <div style="flex:1;height:6px;background:var(--sand-lt);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--ink);min-width:24px;text-align:right">${item[valKey] || 0}</div>
        </div>`;
        }).join('') + `</div>`;
  }

  // Posledné zákazky pobočky
  const stavColor2 = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg2    = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };
  const POCITANE2 = new Set(['Objednané','Realizované']);
  const recentRows = (recent || []).slice(0, 5).map(r => {
    const sc = stavColor2[r.stav] || 'var(--muted)';
    const sb = stavBg2[r.stav]   || 'var(--sand-lt)';
    const isPocitana2 = POCITANE2.has(r.stav);
    const mColor = isPocitana2 ? ((r.marza_eur >= 0) ? 'var(--green)' : 'var(--red)') : 'var(--muted2)';
    const tColor = isPocitana2 ? 'var(--ink)' : 'var(--muted2)';
    return `<div class="db-recent-row">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')" style="font-size:10px">${r.id||'—'}</button>
          <span style="font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.zakaznik || '—'}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted2);margin-top:2px">${r.typ_prod || '—'}${r.dopyt_d ? ' · ' + r.dopyt_d.slice(0,10) : ''}</div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${sc};background:${sb};padding:3px 10px;border-radius:99px;flex-shrink:0">${r.stav || '—'}</span>
      <div style="text-align:right;flex-shrink:0;min-width:76px">
        <div style="font-size:13px;font-weight:800;color:var(--ink)">${fmtEur(r.trzba)}</div>
        <div style="font-size:10px;color:${r.marza_eur > 0 ? 'var(--green)' : r.marza_eur < 0 ? 'var(--red)' : 'var(--muted2)'};font-weight:600;margin-top:1px">${r.marza_eur != null ? fmtEur(r.marza_eur) : '—'}</div>
      </div>
    </div>`;
  }).join('') || `<div class="db-empty">Zatiaľ žiadne zákazky</div>`;

  const sdw = getStoreDashWidgets();
  const sMarzaPct = (sKpi?.fakturovane || 0) > 0 ? ((sKpi?.marza || 0) / sKpi.fakturovane * 100) : 0;

  const sdMarzaCard = sdw.sd_marza
      ? '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-green">' + icoMrz + '</div>'
      + '<div class="db-kpi-card-label">Marža zákaziek</div>'
      + '<div class="db-kpi-card-val" style="color:var(--green)">' + fmtEur(zKpi?.marza||0) + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="db-badge db-badge-green">' + fmtPct(zMarzaPct) + '</span>'
      + '<span style="font-size:11px;color:var(--muted2)">marža %</span></div></div>' : '';

  const sdServCard = sdw.sd_kpi_servis
      ? '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-blue">' + icoSrv + '</div>'
      + '<div class="db-kpi-card-label">Servis fakturovaný</div>'
      + '<div class="db-kpi-card-val" style="color:var(--blue)">' + fmtEur(sKpi?.fakturovane||0) + '</div>'
      + '<div class="db-kpi-card-sub">' + sklonuj(sKpi?.total||0,'zásah','zásahy','zásahov') + ' · ' + fmtNum(sKpi?.cas||0) + ' h</div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="db-badge db-badge-green">' + fmtEur(sKpi?.marza||0) + '</span><span style="font-size:11px;color:var(--muted2)">' + fmtPct(sMarzaPct) + ' marža</span></div></div>' : '';

  const stavTiles = Object.keys(stavColor).map(function(s) {
    const cnt = stavMap[s] || 0;
    const isActive = cnt > 0;
    return '<div class="db-stav-tile" data-stav="' + s + '">'
        + '<div class="db-stav-val">' + cnt + '</div>'
        + '<div class="db-stav-label">' + s + '</div></div>';
  }).join('');

  const stavSection = sdw.sd_stavy
      ? '<div class="db-section"><div class="db-section-head"><span class="db-section-title">Stavy zákaziek</span>'
      + '<span style="font-size:11px;color:var(--muted2);font-weight:500">' + sklonuj(zKpi?.total||0,'zákazka','zákazky','zákaziek') + ' celkom</span></div>'
      + '<div class="db-stavы">' + stavTiles + '</div></div>' : '';

  const zdrojChart = sdw.sd_zdroj
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Zdroj zákaziek</span></div>'
      + '<div class="db-card-body">' + miniBarS(zdrojCounts||[], 'zdroj', 'cnt', 'var(--amber)') + '</div></div>' : '';

  const prodChart = sdw.sd_produkt
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Zákazky podľa produktu</span></div>'
      + '<div class="db-card-body">' + miniBarS(prodCounts||[], 'typ_prod', 'cnt', 'var(--blue)') + '</div></div>' : '';

  const recentCard = sdw.sd_recent
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Posledné zákazky</span>'
      + '<button onclick="showTab(\'zakazky\')" class="db-link-btn">Všetky &rarr;</button></div>'
      + '<div class="db-card-body" style="padding-top:0">' + recentRows + '</div></div>' : '';

  const chartsLeft = (zdrojChart || prodChart)
      ? '<div style="display:flex;flex-direction:column;gap:16px">' + zdrojChart + prodChart + '</div>' : '';

  const midSection = (zdrojChart || prodChart || recentCard)
      ? '<div class="db-mid-grid">' + (chartsLeft || '<div></div>') + recentCard + '</div>' : '';

  const todayDate = new Date().toLocaleDateString('sk-SK', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  el.innerHTML = '<div class="db-root">'
      + '<div class="owner-hero">'
      + '<div class="owner-hero-greet">' + greet + '</div>'
      + '<div class="owner-hero-name">' + (u?.username||'—') + '</div>'
      + '<div class="owner-hero-date">Obchod ' + storeName + ' · ' + todayDate + '</div>'
      + '</div>'


      + '<div class="db-kpi-grid">'
      + '<div class="db-kpi-hero"><div class="db-kpi-hero-deco1"></div><div class="db-kpi-hero-deco2"></div>'
      + '<div class="db-kpi-hero-icon">' + icoZak + '</div>'
      + '<div class="db-kpi-hero-label">Zákazky celkom</div>'
      + '<div class="db-kpi-hero-val">' + (zKpi?.total||0) + '</div>'
      + '<div class="db-kpi-hero-sub">' + sklonuj(zKpi?.realizovane||0,'realizovaná','realizované','realizovaných') + ' z ' + (zKpi?.total||0) + '</div>'
      + '<div class="db-progress-track" style="margin-top:14px">'
      + '<div class="db-progress-fill" style="width:' + realizPct + '%;background:rgba(255,255,255,.5)"></div></div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:6px">'
      + '<span style="font-size:10px;opacity:.65">Úspešnosť</span>'
      + '<span style="font-size:11px;font-weight:800;opacity:.9">' + realizPct + '%</span></div></div>'

      + '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-amber">' + icoEur + '</div>'
      + '<div class="db-kpi-card-label">Tržba zákaziek</div>'
      + '<div class="db-kpi-card-val">' + fmtEur(zKpi?.trzba||0) + '</div>'
      + '<div class="db-kpi-card-sub">Náklady: <strong style="color:var(--ink)">' + fmtEur(zKpi?.naklady||0) + '</strong></div></div>'

      + sdMarzaCard + sdServCard + '</div>'
      + stavSection + midSection
      + '</div>';
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
    {key:'poznamka',label:'Pozn.'},
  ];
  const numCols = new Set(['trzba','naklady','marza_eur','marza_pct','zlava']);
  const centerCols = new Set(['zdroj']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numCols.has(c.key) ? ' th-num' : centerCols.has(c.key) ? ' th-center' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortZakazky('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const stavOpts = ['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'];
  const dateFields = [
    {key:'dopyt_d',      label:'Dopyt'},
    {key:'obhliadka_d',  label:'Obhliadka'},
    {key:'ponuka_d',     label:'Ponuka'},
    {key:'objednavka_d', label:'Objednávka'},
  ];

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')">${r.id||'—'}</button></td>
    ${dateFields.map(df=>`
    <td class="td-date td-inline-date" title="Klikni pre zmenu dátumu">
      <span class="inline-date-val" onclick="inlineDateEdit(this,'${r.id}','${df.key}')">${r[df.key]||'<span class=td-empty>+</span>'}</span>
    </td>`).join('')}
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    <td class="td-clip" title="${r.lokalita||''}">${r.lokalita||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td class="td-inline-stav">
      <span class="inline-stav-badge stav-${(r.stav||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'')}" onclick="inlineStavEdit(this,'${r.id}','${r.stav||''}')">${r.stav||'—'}</span>
    </td>
    <td>${r.typ_prod||'—'}</td>
    <td class="td-clip" title="${r.typ_riesenia||''}" style="color:var(--muted)">${r.typ_riesenia||'—'}</td>
    <td>${r.model||'—'}</td>
    <td class="td-center">${r.zdroj||'—'}</td>
    <td class="td-num num">${fmtEur(r.trzba)}</td>
    <td class="td-num num">${fmtEur(r.naklady)}</td>
    <td class="td-num num fw-700" style="color:${parseFloat(r.marza_eur)<0?'var(--red)':(parseFloat(r.marza_eur)>0?'var(--green)':'')}">${fmtEur(r.marza_eur)}</td>
    <td class="td-num num">${r.marza_pct!=null?fmtPct(r.marza_pct):''}</td>
    <td class="td-num num">${r.zlava?fmtPct(r.zlava):'—'}</td>
    <td class="td-pozn">${r.poznamka?`<button class="pozn-btn" onclick="showPoznámka(this,'${r.id}')" data-text="${(r.poznamka||'').replace(/"/g,'&quot;')}">Pozn.</button>`:'—'}</td>
    <td class="actions">
      <button class="btn btn-sm btn-media" onclick="openMediaModal('${r.id}')">Fotky</button>
      <button class="btn btn-edit btn-sm" onclick="editZakazka('${r.id}')">Upraviť</button>
      ${canWrite()?`<button class="btn btn-del btn-sm" onclick="deleteZakazka('${r.id}','')">Odstraniť</button>`:''}
    </td>
  </tr>`).join(''):`<tr class="empty-row"><td colspan="${cols.length+1}"><span class="empty-icon">—</span>Žiadne zákazky nevyhovujú filtrom</td></tr>`;

  const f=st.filters;
  el.innerHTML=`
    <div class="table-card">
    <div class="toolbar-v2">
      <div class="toolbar-v2-top">
        <span class="toolbar-title">Zákazky</span>
        <div class="toolbar-v2-actions">
          ${canWrite()?`<button class="btn btn-primary" onclick="openNewZakazka()">Nová zákazka</button>`:''}
          
          <button class="btn btn-success" onclick="exportZakazky()">Export XLS</button>
        </div>
      </div>
      <div class="toolbar-v2-filters">
        <div class="filter-search-wrap">
          <input class="filter-input" id="zFilterQ" type="text" placeholder="Hľadať zákazníka, ID, lokalitu, model..." value="${f.q}"
            onkeydown="if(event.key==='Enter'){setFilterZ('q',this.value)}">
          <button class="filter-search-btn" onclick="setFilterZ('q',document.getElementById('zFilterQ').value)" title="Hľadať">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <select class="filter-select filter-select-sm${f.rok?' is-active':''}" onchange="setFilterZ('rok',this.value)">${yearOptions(f.rok)}</select>
        <select class="filter-select filter-select-sm${f.mesiac?' is-active':''}" onchange="setFilterZ('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
        <select class="filter-select${f.stav?' is-active':''}" onchange="setFilterZ('stav',this.value)">
          <option value="">Všetky stavy</option>
          ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s=>`<option ${f.stav===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select${f.typ_prod?' is-active':''}" onchange="setFilterZ('typ_prod',this.value)">
          <option value="">Všetky produkty</option>
          ${['Krb','Pec','Krbová vložka','Biokrb','Elektrický krb'].map(s=>`<option ${f.typ_prod===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select${f.zdroj?' is-active':''}" onchange="setFilterZ('zdroj',this.value)">
          <option value="">Všetky zdroje</option>
          ${['Web','Showroom','Telefón','Odporúčanie','Developer','Reklama','Architekt'].map(s=>`<option ${f.zdroj===s?'selected':''}>${s}</option>`).join('')}
        </select>
        ${priv?`<select class="filter-select${f.obchod?' is-active':''}" onchange="setFilterZ('obchod',this.value)">
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
            <td colspan="${priv?13:12}" style="text-align:right;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;padding-right:12px">Spolu na strane</td>
            <td class="td-num num" style="font-size:13px">${fmtEur(totT)}</td>
            <td class="td-num num">${fmtEur(totN)}</td>
            <td class="td-num num fw-700" style="font-size:13px;color:${totM<0?'var(--red)':(totM>0?'var(--green)':'')}">${fmtEur(totM)}</td>
            <td class="td-num num">${totT>0?fmtPct(totM/totT*100):''}</td>
            <td colspan="3"></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'Z')}
    </div>`;
}

let fzT;
function setFilterZ(k,v){
  State.zakazky.filters[k]=v;
  State.zakazky.page=1;
  renderZakazky();
}
function sortZakazky(col){const st=State.zakazky;if(st.sortCol===col)st.sortDir=st.sortDir==='asc'?'desc':'asc';else{st.sortCol=col;st.sortDir='asc';}renderZakazky();}

/* ── INLINE EDITÁCIA STAVU zákazky ───────────────────────── */
function inlineStavEdit(el, id, currentStav) {
  // Ak už je otvorený iný dropdown, zatvoríme ho
  document.querySelectorAll('.inline-stav-dropdown').forEach(d => d.remove());

  const stavOpts = ['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'];
  const stavColors = {
    'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E',
    'Objednané':'#1D4ED8','Realizované':'#6B6560','Storno':'#991B1B'
  };
  const stavBgs = {
    'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A',
    'Objednané':'#BFDBFE','Realizované':'#EDEBE7','Storno':'#FECACA'
  };

  const dropdown = document.createElement('div');
  dropdown.className = 'inline-stav-dropdown';
  dropdown.innerHTML = stavOpts.map(s => `
    <div class="inline-stav-opt ${s === currentStav ? 'active' : ''}"
         style="--sc:${stavColors[s]||'#666'};--sb:${stavBgs[s]||'#eee'}"
         data-stav="${s}">${s}</div>
  `).join('');

  // Pozícia pod badge-om
  const rect = el.getBoundingClientRect();
  dropdown.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;z-index:999`;
  document.body.appendChild(dropdown);

  // Klik na option
  dropdown.addEventListener('click', async function(e) {
    const opt = e.target.closest('.inline-stav-opt');
    if (!opt) return;
    const newStav = opt.dataset.stav;
    dropdown.remove();
    if (newStav === currentStav) return;

    // Optimistická aktualizácia UI
    const cls = newStav.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
    el.textContent = newStav;
    el.className = `inline-stav-badge stav-${cls}`;

    try {
      const z = await api('GET', `/api/zakazky/${id}`);
      z.stav = newStav;
      await api('PUT', `/api/zakazky/${id}`, z);
      notify(`Stav zmenený na ${newStav}`);
      // Aktualizuj currentStav pre prípadné ďalšie kliknutie
      el.onclick = function() { inlineStavEdit(el, id, newStav); };
      if (State.tab === 'dashboard') renderDashboard();
    } catch(e) {
      notify(e.message || 'Chyba pri ukladaní', 'error');
      renderZakazky(); // rollback
    }
  });

  // Zatvor keď klikneš mimo
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dropdown.contains(e.target) && e.target !== el) {
        dropdown.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

/* ── INLINE EDITÁCIA DÁTUMU zákazky ─────────────────────── */
function inlineDateEdit(el, id, field) {
  // Ak už je input otvorený, ignorujeme
  if (el.querySelector('input')) return;

  const currentVal = el.textContent.trim();
  const isPlaceholder = el.innerHTML.includes('td-empty');
  const inputVal = isPlaceholder ? '' : currentVal;

  const originalHTML = el.innerHTML;

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'inline-date-input';
  input.value = inputVal;

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.showPicker) { try { input.showPicker(); } catch(e) {} }

  async function save() {
    const newVal = input.value; // YYYY-MM-DD alebo ''
    el.innerHTML = newVal
        ? `<span>${newVal}</span>`
        : `<span class="td-empty">+</span>`;

    if (newVal === inputVal) return; // žiadna zmena

    try {
      const z = await api('GET', `/api/zakazky/${id}`);
      // Mapovanie field → kľúč v objekte
      // Kľúče v DB sú dopyt_d, obhliadka_d, ponuka_d, objednavka_d — použijeme priamo field
      z[field] = newVal || null;
      await api('PUT', `/api/zakazky/${id}`, z);
      notify('Dátum uložený');
    } catch(e) {
      el.innerHTML = originalHTML;
      notify(e.message || 'Chyba pri ukladaní', 'error');
    }
  }

  input.addEventListener('change', save);
  input.addEventListener('blur', function() {
    setTimeout(() => {
      if (document.activeElement !== input) save();
    }, 150);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      el.innerHTML = originalHTML;
    }
    if (e.key === 'Enter') {
      input.blur();
    }
  });
}

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
    {key:'poznamka',label:'Pozn.'},
  ];
  const numColsS = new Set(['fakturovane','naklad','marza','cas']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numColsS.has(c.key) ? ' th-num' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortServis('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><button class="id-link-btn" onclick="showServisDetail('${r.id}')">${r.id||'—'}</button></td>
    <td class="td-date">${r.datum||'—'}</td>
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td>${r.technik||'—'}</td>
    <td class="td-clip" title="${r.typ||''}">${r.typ||'—'}</td>
    <td>${r.zaruka==='Áno'?badge('Záruka','zaruka'):r.zaruka==='Nie'?badge('Platené','platene'):'—'}</td>
    <td class="td-num num">${fmtEur(r.fakturovane)}</td>
    <td class="td-num num">${fmtEur(r.naklad)}</td>
    <td class="td-num num fw-700" style="color:${parseFloat(r.marza)<0?'var(--red)':(parseFloat(r.marza)>0?'var(--green)':'')}">${fmtEur(r.marza)}</td>
    <td class="td-num num">${r.cas!=null&&r.cas!==''?r.cas+'h':'—'}</td>
    <td class="td-pozn">${r.poznamka?`<button class="pozn-btn" onclick="showPoznámka(this,'${r.id}')" data-text="${(r.poznamka||'').replace(/"/g,'&quot;')}">Pozn.</button>`:'—'}</td>
    <td class="actions">
      <button class="btn btn-sm btn-media" onclick="openMediaModal('${r.id}')">Fotky</button>
      <button class="btn btn-edit btn-sm" onclick="editServis('${r.id}')">Upraviť</button>
      ${canWrite()?`<button class="btn btn-del btn-sm" onclick="deleteServis('${r.id}','')">Odstraniť</button>`:''}
    </td>
  </tr>`).join(''):`<tr class="empty-row"><td colspan="${cols.length+1}"><span class="empty-icon">—</span>Žiadne záznamy nevyhovujú filtrom</td></tr>`;

  const f=st.filters;
  el.innerHTML=`
    <div class="table-card">
    <div class="toolbar-v2">
      <div class="toolbar-v2-top">
        <span class="toolbar-title">Servis</span>
        <div class="toolbar-v2-actions">
          ${canWrite()?`<button class="btn btn-primary" onclick="openNewServis()">Nový servis</button>`:''}
          
          <button class="btn btn-success" onclick="exportServis()">Export XLS</button>
        </div>
      </div>
      <div class="toolbar-v2-filters">
        <div class="filter-search-wrap">
          <input class="filter-input" id="sFilterQ" type="text" placeholder="Hľadať zákazníka, ID, technika..." value="${f.q}"
            onkeydown="if(event.key==='Enter'){setFilterS('q',this.value)}">
          <button class="filter-search-btn" onclick="setFilterS('q',document.getElementById('sFilterQ').value)" title="Hľadať">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <select class="filter-select filter-select-sm${f.rok?' is-active':''}" onchange="setFilterS('rok',this.value)">${yearOptions(f.rok)}</select>
        <select class="filter-select filter-select-sm${f.mesiac?' is-active':''}" onchange="setFilterS('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
        <select class="filter-select${f.typ?' is-active':''}" onchange="setFilterS('typ',this.value)">
          <option value="">Všetky typy</option>
          ${['Čistenie','Revízia','Oprava','Reklamácia','Iné'].map(s=>`<option ${f.typ===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select${f.zaruka?' is-active':''}" onchange="setFilterS('zaruka',this.value)">
          <option value="">Záruka / Platené</option>
          <option value="Áno" ${f.zaruka==='Áno'?'selected':''}>Iba záruka</option>
          <option value="Nie" ${f.zaruka==='Nie'?'selected':''}>Iba platené</option>
        </select>
        ${priv?`<select class="filter-select${f.obchod?' is-active':''}" onchange="setFilterS('obchod',this.value)">
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
            <td colspan="2"></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'S')}
    </div>`;
}

let fsT;
function setFilterS(k,v){
  State.servis.filters[k]=v;
  State.servis.page=1;
  renderServis();
}
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
    notify(State.editingZakazkaId?'Zákazka uložená':'Zákazka pridaná');
    closeModal('modalZakazka');renderZakazky();
    if(State.tab==='dashboard') renderDashboard();
  }catch(e){notify(e.message,'error');}finally{loading(false);}
});
async function deleteZakazka(id,name){
  if(!confirm(`Naozaj chcete vymazať zákazku "${name}" (${id})?`)) return;
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
  if(!zakaznik){notify('Zadajte meno zákazníka','error');return;}
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
    notify(State.editingServisId?'Servis uložený':'Servis pridaný');
    closeModal('modalServis');renderServis();
    if(State.tab==='dashboard') renderDashboard();
  }catch(e){notify(e.message,'error');}finally{loading(false);}
});
async function deleteServis(id,name){
  if(!confirm(`Naozaj chcete vymazať servis "${name}" (${id})?`)) return;
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
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();notify('Export dokončený');
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

// Event delegation pre tlačidlá v tabuľke používateľov
(function setupUserTableDelegation() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-user-action]');
    if (!btn) return;
    const action   = btn.dataset.userAction;
    const userId   = Number(btn.dataset.userId);
    const username = btn.dataset.username;
    if (action === 'reset-password') openResetPasswordModal(userId, username);
    if (action === 'reset-2fa')      resetUser2FA(userId, username);
    if (action === 'delete')         deleteUser(userId, username);
  });
})();

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

      const tr = document.createElement('tr');
      tr.className = isSelf ? 'users-row-self' : '';
      tr.innerHTML = `
        <td><div class="users-name-cell"><div class="users-avatar">${(u.username||'?')[0].toUpperCase()}</div><span class="users-username">${u.username}</span></div></td>
        <td><span class="users-role-badge ${roleCls[u.role]||''}">${roleMap[u.role]||u.role}</span></td>
        <td>${storeHtml}</td>
        <td>${mfaHtml}</td>
        <td class="users-cell-muted">${new Date(u.created_at).toLocaleDateString('sk-SK')}</td>
        <td>${isSelf ? '<span class="users-cell-muted">Váš účet</span>' : '<div class="users-actions"><button class="users-btn btn-pw">Zmena hesla</button><button class="users-btn btn-2fa">Reset 2FA</button><button class="users-btn users-btn-danger btn-del">Zmazať</button></div>'}</td>
      `;

      // Priame event listenery na tlačidlá (najbezpečnejší spôsob, bez inline onclick)
      if (!isSelf) {
        const uid = u.id;
        const uname = u.username;
        tr.querySelector('.btn-pw').addEventListener('click', function() { openResetPasswordModal(uid, uname); });
        tr.querySelector('.btn-2fa').addEventListener('click', function() { resetUser2FA(uid, uname); });
        tr.querySelector('.btn-del').addEventListener('click', function() { deleteUser(uid, uname); });
      }

      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error('Chyba pri načítaní používateľov:', e);
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
    err.textContent = 'Vyplňte všetky polia a vyberte rolu používateľa.'; err.classList.remove('d-none');
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
  if (!confirm(`Naozaj chcete zmazať konto '${username}'? Táto akcia je nevratná.`)) return;
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
    alert(`2FA pre používateľa ${username} bolo úspešne zresetované.`);
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* --- FUNKCIE PRE ZMENU HESLA --- */
let resetPasswordUserId = null;

function openResetPasswordModal(id, username) {
  console.log('[STORMS] openResetPasswordModal called, id=', id, 'username=', username);
  resetPasswordUserId = id;
  var usernameEl = document.getElementById('resetPasswordUsername');
  var passwordEl = document.getElementById('newResetPassword');
  var errEl      = document.getElementById('resetPasswordError');
  var modalEl    = document.getElementById('modalResetPassword');

  if (!modalEl) { console.error('[STORMS] CHYBA: modal #modalResetPassword neexistuje v DOM!'); return; }

  if (usernameEl) usernameEl.textContent = username;
  if (passwordEl) passwordEl.value = '';
  if (errEl) { errEl.classList.add('d-none'); errEl.textContent = ''; }

  // Odstránime d-none ak by bol omylom nastavený, a pridáme open
  modalEl.classList.remove('d-none');
  modalEl.classList.add('open');
  console.log('[STORMS] modal classes:', modalEl.className);
  setTimeout(function(){ if (passwordEl) passwordEl.focus(); }, 150);
}

function closePasswordModal() {
  closeModal('modalResetPassword');
}

async function saveNewPassword() {
  var newPassword = $('newResetPassword').value.trim();
  var err = $('resetPasswordError');
  err.classList.add('d-none');

  if (!newPassword || newPassword.length < 6) {
    err.textContent = 'Heslo musí mať aspoň 6 znakov.';
    err.classList.remove('d-none');
    return;
  }

  try {
    loading(true);
    await api('PUT', `/api/users/${resetPasswordUserId}/reset-password`, { newPassword });
    closePasswordModal();
    notify('Heslo bolo zmenené');
  } catch (e) {
    err.textContent = e.message || 'Chyba pri zmene hesla';
    err.classList.remove('d-none');
  } finally {
    loading(false);
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
    notify('Heslo bolo zmenené');
  } catch(e) {
    if (err) { err.textContent = e.message || 'Chyba pri zmene hesla.'; err.classList.remove('d-none'); }
  } finally {
    loading(false);
  }
}

/* ══════════════════════════════════════════════════════════
   PROFIL – Môj profil
   ══════════════════════════════════════════════════════════ */
function renderPrivDashboard(el, d) {
  const { zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, storeBreakdown, recent, recentS } = d;
  const w = getDashWidgets();
  const stavMap = {};
  stavCounts.forEach(s => stavMap[s.stav || '—'] = s.cnt);
  const zMarzaPct  = zKpi.trzba > 0 ? (zKpi.marza / zKpi.trzba * 100) : 0;
  const sMarzaPct  = sKpi.fakturovane > 0 ? (sKpi.marza / sKpi.fakturovane * 100) : 0;
  const realizPct  = zKpi.total > 0 ? Math.round(zKpi.realizovane / zKpi.total * 100) : 0;

  const stavColor = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg    = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };

  const ico = {
    zakazky: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    trzba:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    marza:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>`,
    servis:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M5.34 5.34 3.93 3.93M12 20v2M12 2v2"/></svg>`,
    store:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
    arrow:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>`,
  };

  /* ── Pomocná funkcia: sekcia s hlavičkou ─────────── */
  function section(key, title, content, extraStyle='') {
    if (!w[key]) return '';
    return `<div class="db-section" style="${extraStyle}">
      <div class="db-section-head"><span class="db-section-title">${title}</span></div>
      ${content}
    </div>`;
  }

  /* ── Mini progress bar pre grafy ─────────────────── */
  function miniBar(items, labelKey, valKey, color) {
    if (!items || !items.length) return `<div class="db-empty">Žiadne dáta</div>`;
    const max = Math.max(...items.map(i => i[valKey] || 0), 1);
    return `<div style="display:flex;flex-direction:column;gap:8px">` +
        items.slice(0, 6).map(item => {
          const pct = Math.round((item[valKey] || 0) / max * 100);
          const val = (valKey === 'trzba' || valKey === 'marza' || valKey === 'fakturovane') ? fmtEur(item[valKey] || 0) : (item[valKey] || 0);
          return `<div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;color:var(--muted);min-width:82px;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item[labelKey] || '—'}</div>
          <div style="flex:1;height:7px;background:var(--sand-lt);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--ink);min-width:40px;text-align:right">${val}</div>
        </div>`;
        }).join('') + `</div>`;
  }

  /* ── Posledné zákazky ─────────────────────────────── */
  /* ── Posledné zákazky ─────────────────────────────── */
  const POCITANE_P = new Set(['Objednané','Realizované']);
  const recentRows = (recent || []).slice(0, 5).map(r => {
    const sc = stavColor[r.stav] || 'var(--muted)';
    const sb = stavBg[r.stav] || 'var(--sand-lt)';
    const dateStr = r.dopyt_d ? r.dopyt_d.slice(0,10) : (r.created_at ? r.created_at.slice(0,10) : '');
    return `<div class="db-recent-row">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')" style="font-size:10px">${r.id||'—'}</button>
          <span style="font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.zakaznik || '—'}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted2);margin-top:2px;display:flex;gap:6px;align-items:center">
          <span>${r.typ_prod || '—'}</span>
          ${r.obchod ? `<span style="color:var(--border2)">·</span><span>${r.obchod.replace('Obchod ','')}</span>` : ''}
          ${dateStr ? `<span style="color:var(--border2)">·</span><span>${dateStr}</span>` : ''}
        </div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${sc};background:${sb};padding:3px 10px;border-radius:99px;flex-shrink:0;white-space:nowrap">${r.stav || '—'}</span>
      <div style="text-align:right;flex-shrink:0;min-width:76px">
        <div style="font-size:13px;font-weight:800;color:var(--ink)">${fmtEur(r.trzba)}</div>
        <div style="font-size:10px;color:${r.marza_eur > 0 ? 'var(--green)' : r.marza_eur < 0 ? 'var(--red)' : 'var(--muted2)'};margin-top:1px;font-weight:600">${r.marza_eur != null ? fmtEur(r.marza_eur) : '—'}</div>
      </div>
    </div>`;
  }).join('');

  /* ── Store karty ──────────────────────────────────── */
  const storeCardsHtml = (storeBreakdown || []).map(({ store, z, s }) => {
    const mp   = z.trzba > 0 ? (z.marza / z.trzba * 100) : 0;
    const rPct = z.total > 0 ? Math.round(z.realizovane / z.total * 100) : 0;
    const short = store.replace('Obchod ', '');
    return `<div class="db-store-card">
      <div class="db-store-card-top">
        <div class="db-store-icon">${ico.store}</div>
        <div>
          <div class="db-store-name">${short}</div>
          <div class="db-store-sub">${sklonuj(z.total,'zákazka','zákazky','zákaziek')}</div>
        </div>
        <span class="db-store-pill">${fmtPct(mp)}</span>
      </div>
      <div class="db-store-grid">
        <div class="db-store-stat db-store-stat-amber">
          <div class="db-store-stat-label">Tržba</div>
          <div class="db-store-stat-val">${fmtEur(z.trzba)}</div>
        </div>
        <div class="db-store-stat db-store-stat-green">
          <div class="db-store-stat-label">Marža</div>
          <div class="db-store-stat-val" style="color:var(--green)">${fmtEur(z.marza)}</div>
        </div>
        <div class="db-store-stat">
          <div class="db-store-stat-label">Realizované</div>
          <div class="db-store-stat-val">${z.realizovane}/${z.total}</div>
        </div>
        <div class="db-store-stat">
          <div class="db-store-stat-label">Servis</div>
          <div class="db-store-stat-val" style="color:var(--blue)">${fmtEur(s.fakturovane)}</div>
        </div>
      </div>
      <div class="db-store-progress-wrap">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:10px;color:var(--muted)">Realizované</span>
          <span style="font-size:10px;font-weight:700;color:var(--green)">${rPct}%</span>
        </div>
        <div class="db-progress-track"><div class="db-progress-fill" style="width:${rPct}%;background:var(--green)"></div></div>
      </div>
      <div class="db-store-footer">
        <span style="font-size:11px;color:var(--muted)">Servis zásahov: ${s.total}</span>
        <span style="font-size:11px;color:var(--muted2)">${fmtEur(s.marza || 0)} marža</span>
      </div>
    </div>`;
  }).join('');

  /* ── Store grafy (bar charts porovnávanie) ────────── */
  const trzbaData    = (storeBreakdown || []).map(({ store, z }) => ({ label: store.replace('Obchod ',''), trzba: z.trzba }));
  const marzaData    = (storeBreakdown || []).map(({ store, z }) => ({ label: store.replace('Obchod ',''), marza: z.marza }));
  const servisData   = (storeBreakdown || []).map(({ store, s }) => ({ label: store.replace('Obchod ',''), fakturovane: s.fakturovane }));

  /* ════════════════ RENDER ════════════════ */
  const h = new Date().getHours();
  const ownerGreet = h < 10 ? 'Dobré ráno' : h < 13 ? 'Dobré dopoludnie' : h < 18 ? 'Dobrý deň' : 'Dobrý večer';
  const ownerName  = State.user?.username || '—';
  const storeCount = (storeBreakdown || []).length;
  const todayDate  = new Date().toLocaleDateString('sk-SK', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  el.innerHTML = `<div class="db-root">

    <!-- OWNER HERO -->
    <div class="owner-hero">
      <div class="owner-hero-greet">${ownerGreet}</div>
      <div class="owner-hero-name">${ownerName}</div>
      <div class="owner-hero-date">${todayDate}</div>
    </div>

    ${w.z_kpi ? `
    <!-- ═══ TOP KPI KARTY ═══ -->
    <div class="db-kpi-grid">

      <div class="db-kpi-hero">
        <div class="db-kpi-hero-deco1"></div>
        <div class="db-kpi-hero-deco2"></div>
        <div class="db-kpi-hero-icon">${ico.zakazky}</div>
        <div class="db-kpi-hero-label">Zákazky celkom</div>
        <div class="db-kpi-hero-val">${zKpi.total}</div>
        <div class="db-kpi-hero-sub">${sklonuj(zKpi.realizovane,'realizovaná','realizované','realizovaných')} z ${zKpi.total}</div>
        <div class="db-progress-track" style="margin-top:14px">
          <div class="db-progress-fill" style="width:${realizPct}%;background:rgba(255,255,255,.5)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <span style="font-size:10px;opacity:.65">Úspešnosť realizácie</span>
          <span style="font-size:11px;font-weight:800;opacity:.9">${realizPct}%</span>
        </div>
      </div>

      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-amber">${ico.trzba}</div>
        <div class="db-kpi-card-label">Tržba zákaziek</div>
        <div class="db-kpi-card-val">${fmtEur(zKpi.trzba)}</div>
        <div class="db-kpi-card-sub">Náklady: <strong style="color:var(--ink)">${fmtEur(zKpi.naklady)}</strong></div>
      </div>

      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-green">${ico.marza}</div>
        <div class="db-kpi-card-label">Marža zákaziek</div>
        <div class="db-kpi-card-val" style="color:var(--green)">${fmtEur(zKpi.marza)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <span class="db-badge db-badge-green">${fmtPct(zMarzaPct)}</span>
          <span style="font-size:11px;color:var(--muted2)">marža %</span>
        </div>
      </div>

      ${w.s_kpi ? `
      <div class="db-kpi-card">
        <div class="db-kpi-card-icon db-kpi-icon-blue">${ico.servis}</div>
        <div class="db-kpi-card-label">Servis fakturovaný</div>
        <div class="db-kpi-card-val" style="color:var(--blue)">${fmtEur(sKpi.fakturovane)}</div>
        <div class="db-kpi-card-sub">${sKpi.total} zásahov · ${fmtNum(sKpi.cas)} h</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <span class="db-badge db-badge-green">${fmtEur(sKpi.marza)}</span>
          <span style="font-size:11px;color:var(--muted2)">${fmtPct(sMarzaPct)} marža</span>
        </div>
      </div>` : ''}

    </div>` : ''}

    ${w.stav_chips ? `
    <!-- ═══ STAVY ═══ -->
    <div class="db-section">
      <div class="db-section-head">
        <span class="db-section-title">Stavy zákaziek</span>
        <span style="font-size:11px;color:var(--muted2);font-weight:500">${sklonuj(zKpi.total,'zákazka','zákazky','zákaziek')} celkom</span>
      </div>
      <div class="db-stavы">
        ${['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'].map(s => `
          <div class="db-stav-tile" data-stav="${s}">
            <div class="db-stav-val">${stavMap[s] || 0}</div>
            <div class="db-stav-label">${s}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${(w.zdroj_chart || w.prod_chart || (recent && recent.length > 0)) ? `
    <!-- ═══ GRAFY + POSLEDNÉ ZÁKAZKY ═══ -->
    <div class="db-mid-grid">

      ${(w.zdroj_chart || w.prod_chart) ? `
      <div style="display:flex;flex-direction:column;gap:16px">
        ${w.zdroj_chart ? `
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Zdroj zákaziek</span></div>
          <div class="db-card-body">${miniBar(zdrojCounts||[], 'zdroj', 'cnt', 'var(--amber)')}</div>
        </div>` : ''}
        ${w.prod_chart ? `
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Zákazky podľa produktu</span></div>
          <div class="db-card-body">${miniBar(prodCounts||[], 'typ_prod', 'cnt', 'var(--blue)')}</div>
        </div>` : ''}
      </div>` : ''}

      <div class="db-card">
        <div class="db-card-head">
          <span class="db-card-title">Posledné zákazky</span>
          <button onclick="showTab('zakazky')" class="db-link-btn">Všetky ${ico.arrow}</button>
        </div>
        <div class="db-card-body" style="padding-top:0">
          ${recentRows || '<div class="db-empty">Žiadne zákazky</div>'}
        </div>
      </div>

    </div>` : ''}

    ${storeBreakdown ? `

    ${w.store_cards ? `
    <!-- ═══ OBCHODY – KARTY ═══ -->
    <div class="db-section">
      <div class="db-section-head">
        <span class="db-section-title">Prehľad obchodov</span>
      </div>
      <div class="db-store-grid-outer">${storeCardsHtml}</div>
    </div>` : ''}

    ${w.store_charts ? `
    <!-- ═══ OBCHODY – GRAFY ═══ -->
    <div class="db-section">
      <div class="db-section-head"><span class="db-section-title">Porovnanie obchodov</span></div>
      <div class="db-charts-3col">
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Tržba zákaziek</span></div>
          <div class="db-card-body">${miniBar(trzbaData, 'label', 'trzba', 'var(--amber)')}</div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Marža zákaziek</span></div>
          <div class="db-card-body">${miniBar(marzaData, 'label', 'marza', 'var(--green)')}</div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><span class="db-card-title">Servis fakturovaný</span></div>
          <div class="db-card-body">${miniBar(servisData, 'label', 'fakturovane', 'var(--blue)')}</div>
        </div>
      </div>
    </div>` : ''}

    ` : ''}

  </div>`;
}

function renderStoreDashboard(el, d) {
  const { zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, recent } = d;
  const stavMap = {};
  if (stavCounts) stavCounts.forEach(s => stavMap[s.stav || '—'] = s.cnt);
  const realizPct  = (zKpi?.total || 0) > 0 ? Math.round((zKpi?.realizovane || 0) / zKpi.total * 100) : 0;
  const zMarzaPct  = (zKpi?.trzba || 0) > 0 ? (((zKpi?.marza || 0) / zKpi.trzba) * 100) : 0;
  const stavColor  = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg     = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };

  const u = State.user;
  const storeName = u?.store ? u.store.split(',')[0].replace('Obchod ','') : 'Moja pobočka';

  // Pozdrav podľa hodiny
  const h = new Date().getHours();
  const greet = h < 10 ? 'Dobré ráno' : h < 13 ? 'Dobré dopoludnie' : h < 18 ? 'Dobrý deň' : 'Dobrý večer';

  // SVG ikony
  const icoZak = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const icoEur = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  const icoSrv = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-4 4-4 8a4 4 0 0 0 8 0c0-4-4-8-4-8z"/><path d="M12 14c0 0-2 2-2 3.5a2 2 0 0 0 4 0C14 16 12 14 12 14z"/></svg>`;
  const icoMrz = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>`;

  // Mini bar chart helper
  function miniBarS(items, labelKey, valKey, color) {
    if (!items || !items.length) return `<div class="db-empty">Žiadne dáta</div>`;
    const max = Math.max(...items.map(i => i[valKey] || 0), 1);
    return `<div style="display:flex;flex-direction:column;gap:8px">` +
        items.slice(0, 5).map(item => {
          const pct = Math.round((item[valKey] || 0) / max * 100);
          return `<div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;color:var(--muted);min-width:80px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item[labelKey] || '—'}</div>
          <div style="flex:1;height:6px;background:var(--sand-lt);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--ink);min-width:24px;text-align:right">${item[valKey] || 0}</div>
        </div>`;
        }).join('') + `</div>`;
  }

  // Posledné zákazky pobočky
  const stavColor2 = { 'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E','Objednané':'#1D4ED8','Realizované':'#1A5C3A','Storno':'#991B1B' };
  const stavBg2    = { 'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A','Objednané':'#BFDBFE','Realizované':'#D0EAD8','Storno':'#FECACA' };
  const POCITANE_S = new Set(['Objednané','Realizované']);
  const sdw = getStoreDashWidgets();
  const sMarzaPct = (sKpi?.fakturovane || 0) > 0 ? ((sKpi?.marza || 0) / sKpi.fakturovane * 100) : 0;

  const recentRows = (recent || []).slice(0, 5).map(r => {
    const sc = stavColor2[r.stav] || 'var(--muted)';
    const sb = stavBg2[r.stav]   || 'var(--sand-lt)';
    const isPocitanaS = POCITANE_S.has(r.stav);
    const mColor  = isPocitanaS ? ((r.marza_eur >= 0) ? 'var(--green)' : 'var(--red)') : 'var(--muted2)';
    const tColorS = isPocitanaS ? 'var(--ink)' : 'var(--muted2)';
    return `<div class="db-recent-row">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')" style="font-size:10px">${r.id||'—'}</button>
          <span style="font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.zakaznik || '—'}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted2);margin-top:2px">${r.typ_prod || '—'}${r.dopyt_d ? ' · ' + r.dopyt_d.slice(0,10) : ''}</div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${sc};background:${sb};padding:3px 10px;border-radius:99px;flex-shrink:0">${r.stav || '—'}</span>
      <div style="text-align:right;flex-shrink:0;min-width:76px">
        <div style="font-size:13px;font-weight:800;color:var(--ink)">${fmtEur(r.trzba)}</div>
        <div style="font-size:10px;color:${r.marza_eur > 0 ? 'var(--green)' : r.marza_eur < 0 ? 'var(--red)' : 'var(--muted2)'};font-weight:600;margin-top:1px">${r.marza_eur != null ? fmtEur(r.marza_eur) : '—'}</div>
      </div>
    </div>`;
  }).join('') || `<div class="db-empty">Zatiaľ žiadne zákazky</div>`;




  const sdMarzaCard = sdw.sd_marza
      ? '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-green">' + icoMrz + '</div>'
      + '<div class="db-kpi-card-label">Marža zákaziek</div>'
      + '<div class="db-kpi-card-val" style="color:var(--green)">' + fmtEur(zKpi?.marza||0) + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="db-badge db-badge-green">' + fmtPct(zMarzaPct) + '</span>'
      + '<span style="font-size:11px;color:var(--muted2)">marža %</span></div></div>' : '';

  const sdServCard = sdw.sd_kpi_servis
      ? '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-blue">' + icoSrv + '</div>'
      + '<div class="db-kpi-card-label">Servis fakturovaný</div>'
      + '<div class="db-kpi-card-val" style="color:var(--blue)">' + fmtEur(sKpi?.fakturovane||0) + '</div>'
      + '<div class="db-kpi-card-sub">' + sklonuj(sKpi?.total||0,'zásah','zásahy','zásahov') + ' · ' + fmtNum(sKpi?.cas||0) + ' h</div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="db-badge db-badge-green">' + fmtEur(sKpi?.marza||0) + '</span><span style="font-size:11px;color:var(--muted2)">' + fmtPct(sMarzaPct) + ' marža</span></div></div>' : '';

  const stavTiles = Object.keys(stavColor).map(function(s) {
    const cnt = stavMap[s] || 0;
    const isActive = cnt > 0;
    return '<div class="db-stav-tile" data-stav="' + s + '">'
        + '<div class="db-stav-val">' + cnt + '</div>'
        + '<div class="db-stav-label">' + s + '</div></div>';
  }).join('');

  const stavSection = sdw.sd_stavy
      ? '<div class="db-section"><div class="db-section-head"><span class="db-section-title">Stavy zákaziek</span>'
      + '<span style="font-size:11px;color:var(--muted2);font-weight:500">' + sklonuj(zKpi?.total||0,'zákazka','zákazky','zákaziek') + ' celkom</span></div>'
      + '<div class="db-stavы">' + stavTiles + '</div></div>' : '';

  const zdrojChart = sdw.sd_zdroj
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Zdroj zákaziek</span></div>'
      + '<div class="db-card-body">' + miniBarS(zdrojCounts||[], 'zdroj', 'cnt', 'var(--amber)') + '</div></div>' : '';

  const prodChart = sdw.sd_produkt
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Zákazky podľa produktu</span></div>'
      + '<div class="db-card-body">' + miniBarS(prodCounts||[], 'typ_prod', 'cnt', 'var(--blue)') + '</div></div>' : '';

  const recentCard = sdw.sd_recent
      ? '<div class="db-card"><div class="db-card-head"><span class="db-card-title">Posledné zákazky</span>'
      + '<button onclick="showTab(\'zakazky\')" class="db-link-btn">Všetky &rarr;</button></div>'
      + '<div class="db-card-body" style="padding-top:0">' + recentRows + '</div></div>' : '';

  const chartsLeft = (zdrojChart || prodChart)
      ? '<div style="display:flex;flex-direction:column;gap:16px">' + zdrojChart + prodChart + '</div>' : '';

  const midSection = (zdrojChart || prodChart || recentCard)
      ? '<div class="db-mid-grid">' + (chartsLeft || '<div></div>') + recentCard + '</div>' : '';

  const todayStr = new Date().toLocaleDateString('sk-SK', {weekday:'long', day:'numeric', month:'long'});
  el.innerHTML = '<div class="db-root">'
      + '<div class="store-hero">'
      + '<div class="store-hero-content">'
      + '<div class="store-hero-greet">' + greet + '</div>'
      + '<div class="store-hero-name">' + (u?.username||'—') + '</div>'
      + '<div class="store-hero-sub">' + todayStr + '</div>'
      + '</div>'
      + '</div>'

      + '<div class="db-kpi-grid">'
      + '<div class="db-kpi-hero"><div class="db-kpi-hero-deco1"></div><div class="db-kpi-hero-deco2"></div>'
      + '<div class="db-kpi-hero-icon">' + icoZak + '</div>'
      + '<div class="db-kpi-hero-label">Zákazky celkom</div>'
      + '<div class="db-kpi-hero-val">' + (zKpi?.total||0) + '</div>'
      + '<div class="db-kpi-hero-sub">' + sklonuj(zKpi?.realizovane||0,'realizovaná','realizované','realizovaných') + ' z ' + (zKpi?.total||0) + '</div>'
      + '<div class="db-progress-track" style="margin-top:14px">'
      + '<div class="db-progress-fill" style="width:' + realizPct + '%;background:rgba(255,255,255,.5)"></div></div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:6px">'
      + '<span style="font-size:10px;opacity:.65">Úspešnosť</span>'
      + '<span style="font-size:11px;font-weight:800;opacity:.9">' + realizPct + '%</span></div></div>'

      + '<div class="db-kpi-card"><div class="db-kpi-card-icon db-kpi-icon-amber">' + icoEur + '</div>'
      + '<div class="db-kpi-card-label">Tržba zákaziek</div>'
      + '<div class="db-kpi-card-val">' + fmtEur(zKpi?.trzba||0) + '</div>'
      + '<div class="db-kpi-card-sub">Náklady: <strong style="color:var(--ink)">' + fmtEur(zKpi?.naklady||0) + '</strong></div></div>'

      + sdMarzaCard + sdServCard + '</div>'
      + stavSection + midSection
      + '</div>';
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
    {key:'poznamka',label:'Pozn.'},
  ];
  const numCols = new Set(['trzba','naklady','marza_eur','marza_pct','zlava']);
  const centerCols = new Set(['zdroj']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numCols.has(c.key) ? ' th-num' : centerCols.has(c.key) ? ' th-center' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortZakazky('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const stavOpts = ['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'];
  const dateFields = [
    {key:'dopyt_d',      label:'Dopyt'},
    {key:'obhliadka_d',  label:'Obhliadka'},
    {key:'ponuka_d',     label:'Ponuka'},
    {key:'objednavka_d', label:'Objednávka'},
  ];

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><button class="id-link-btn" onclick="showZakazkaDetail('${r.id}')">${r.id||'—'}</button></td>
    ${dateFields.map(df=>`
    <td class="td-date td-inline-date" title="Klikni pre zmenu dátumu">
      <span class="inline-date-val" onclick="inlineDateEdit(this,'${r.id}','${df.key}')">${r[df.key]||'<span class=td-empty>+</span>'}</span>
    </td>`).join('')}
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    <td class="td-clip" title="${r.lokalita||''}">${r.lokalita||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td class="td-inline-stav">
      <span class="inline-stav-badge stav-${(r.stav||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'')}" onclick="inlineStavEdit(this,'${r.id}','${r.stav||''}')">${r.stav||'—'}</span>
    </td>
    <td>${r.typ_prod||'—'}</td>
    <td class="td-clip" title="${r.typ_riesenia||''}" style="color:var(--muted)">${r.typ_riesenia||'—'}</td>
    <td>${r.model||'—'}</td>
    <td class="td-center">${r.zdroj||'—'}</td>
    <td class="td-num num">${fmtEur(r.trzba)}</td>
    <td class="td-num num">${fmtEur(r.naklady)}</td>
    <td class="td-num num fw-700" style="color:${parseFloat(r.marza_eur)<0?'var(--red)':(parseFloat(r.marza_eur)>0?'var(--green)':'')}">${fmtEur(r.marza_eur)}</td>
    <td class="td-num num">${r.marza_pct!=null?fmtPct(r.marza_pct):''}</td>
    <td class="td-num num">${r.zlava?fmtPct(r.zlava):'—'}</td>
    <td class="td-pozn">${r.poznamka?`<button class="pozn-btn" onclick="showPoznámka(this,'${r.id}')" data-text="${(r.poznamka||'').replace(/"/g,'&quot;')}">Pozn.</button>`:'—'}</td>
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
        <div class="filter-search-wrap">
          <input class="filter-input" id="zFilterQ" type="text" placeholder="Hľadať zákazníka, ID, lokalitu, model..." value="${f.q}"
            onkeydown="if(event.key==='Enter'){setFilterZ('q',this.value)}">
          <button class="filter-search-btn" onclick="setFilterZ('q',document.getElementById('zFilterQ').value)" title="Hľadať">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <select class="filter-select filter-select-sm" onchange="setFilterZ('rok',this.value)">${yearOptions(f.rok)}</select>
        <select class="filter-select filter-select-sm" onchange="setFilterZ('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
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
            <td colspan="${priv?13:12}" style="text-align:right;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;padding-right:12px">Spolu na strane</td>
            <td class="td-num num" style="font-size:13px">${fmtEur(totT)}</td>
            <td class="td-num num">${fmtEur(totN)}</td>
            <td class="td-num num fw-700" style="font-size:13px;color:${totM<0?'var(--red)':(totM>0?'var(--green)':'')}">${fmtEur(totM)}</td>
            <td class="td-num num">${totT>0?fmtPct(totM/totT*100):''}</td>
            <td colspan="3"></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'Z')}`;
}

// fzT already declared
function setFilterZ(k,v){
  State.zakazky.filters[k]=v;
  State.zakazky.page=1;
  renderZakazky();
}
function sortZakazky(col){const st=State.zakazky;if(st.sortCol===col)st.sortDir=st.sortDir==='asc'?'desc':'asc';else{st.sortCol=col;st.sortDir='asc';}renderZakazky();}

/* ── INLINE EDITÁCIA STAVU zákazky ───────────────────────── */
function inlineStavEdit(el, id, currentStav) {
  // Ak už je otvorený iný dropdown, zatvoríme ho
  document.querySelectorAll('.inline-stav-dropdown').forEach(d => d.remove());

  const stavOpts = ['Dopyt','Obhliadka','Ponuka','Objednané','Realizované','Storno'];
  const stavColors = {
    'Dopyt':'#9C3D0A','Obhliadka':'#5B21B6','Ponuka':'#854D0E',
    'Objednané':'#1D4ED8','Realizované':'#6B6560','Storno':'#991B1B'
  };
  const stavBgs = {
    'Dopyt':'#FCDEC8','Obhliadka':'#E4D5FF','Ponuka':'#FEF08A',
    'Objednané':'#BFDBFE','Realizované':'#EDEBE7','Storno':'#FECACA'
  };

  const dropdown = document.createElement('div');
  dropdown.className = 'inline-stav-dropdown';
  dropdown.innerHTML = stavOpts.map(s => `
    <div class="inline-stav-opt ${s === currentStav ? 'active' : ''}"
         style="--sc:${stavColors[s]||'#666'};--sb:${stavBgs[s]||'#eee'}"
         data-stav="${s}">${s}</div>
  `).join('');

  // Pozícia pod badge-om
  const rect = el.getBoundingClientRect();
  dropdown.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;z-index:999`;
  document.body.appendChild(dropdown);

  // Klik na option
  dropdown.addEventListener('click', async function(e) {
    const opt = e.target.closest('.inline-stav-opt');
    if (!opt) return;
    const newStav = opt.dataset.stav;
    dropdown.remove();
    if (newStav === currentStav) return;

    // Optimistická aktualizácia UI
    const cls = newStav.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
    el.textContent = newStav;
    el.className = `inline-stav-badge stav-${cls}`;

    try {
      const z = await api('GET', `/api/zakazky/${id}`);
      z.stav = newStav;
      await api('PUT', `/api/zakazky/${id}`, z);
      notify(`Stav zmenený na ${newStav}`);
      // Aktualizuj currentStav pre prípadné ďalšie kliknutie
      el.onclick = function() { inlineStavEdit(el, id, newStav); };
      if (State.tab === 'dashboard') renderDashboard();
    } catch(e) {
      notify(e.message || 'Chyba pri ukladaní', 'error');
      renderZakazky(); // rollback
    }
  });

  // Zatvor keď klikneš mimo
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dropdown.contains(e.target) && e.target !== el) {
        dropdown.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

/* ── INLINE EDITÁCIA DÁTUMU zákazky ─────────────────────── */
function inlineDateEdit(el, id, field) {
  // Ak už je input otvorený, ignorujeme
  if (el.querySelector('input')) return;

  const currentVal = el.textContent.trim();
  const isPlaceholder = el.innerHTML.includes('td-empty');
  const inputVal = isPlaceholder ? '' : currentVal;

  const originalHTML = el.innerHTML;

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'inline-date-input';
  input.value = inputVal;

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.showPicker) { try { input.showPicker(); } catch(e) {} }

  async function save() {
    const newVal = input.value; // YYYY-MM-DD alebo ''
    el.innerHTML = newVal
        ? `<span>${newVal}</span>`
        : `<span class="td-empty">+</span>`;

    if (newVal === inputVal) return; // žiadna zmena

    try {
      const z = await api('GET', `/api/zakazky/${id}`);
      // Mapovanie field → kľúč v objekte
      // Kľúče v DB sú dopyt_d, obhliadka_d, ponuka_d, objednavka_d — použijeme priamo field
      z[field] = newVal || null;
      await api('PUT', `/api/zakazky/${id}`, z);
      notify('Dátum uložený');
    } catch(e) {
      el.innerHTML = originalHTML;
      notify(e.message || 'Chyba pri ukladaní', 'error');
    }
  }

  input.addEventListener('change', save);
  input.addEventListener('blur', function() {
    setTimeout(() => {
      if (document.activeElement !== input) save();
    }, 150);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      el.innerHTML = originalHTML;
    }
    if (e.key === 'Enter') {
      input.blur();
    }
  });
}

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
    {key:'poznamka',label:'Pozn.'},
  ];
  const numColsS = new Set(['fakturovane','naklad','marza','cas']);
  const thHtml=cols.map(c=>{
    const cur=st.sortCol===c.key;
    const align = numColsS.has(c.key) ? ' th-num' : '';
    return `<th class="${cur?(st.sortDir==='asc'?'sort-asc':'sort-desc'):''}${align}" onclick="sortServis('${c.key}')">${c.label}</th>`;
  }).join('')+`<th class="no-sort" style="text-align:center">Akcie</th>`;

  const tdHtml=rows.length?rows.map(r=>`<tr>
    <td><button class="id-link-btn" onclick="showServisDetail('${r.id}')">${r.id||'—'}</button></td>
    <td class="td-date">${r.datum||'—'}</td>
    <td class="td-clip td-zakaznik" title="${r.zakaznik||''}">${r.zakaznik||'—'}</td>
    ${priv?`<td>${storeBadge(r.obchod)}</td>`:''}
    <td>${r.technik||'—'}</td>
    <td class="td-clip" title="${r.typ||''}">${r.typ||'—'}</td>
    <td>${r.zaruka==='Áno'?badge('Záruka','zaruka'):r.zaruka==='Nie'?badge('Platené','platene'):'—'}</td>
    <td class="td-num num">${fmtEur(r.fakturovane)}</td>
    <td class="td-num num">${fmtEur(r.naklad)}</td>
    <td class="td-num num fw-700" style="color:${parseFloat(r.marza)<0?'var(--red)':(parseFloat(r.marza)>0?'var(--green)':'')}">${fmtEur(r.marza)}</td>
    <td class="td-num num">${r.cas!=null&&r.cas!==''?r.cas+'h':'—'}</td>
    <td class="td-pozn">${r.poznamka?`<button class="pozn-btn" onclick="showPoznámka(this,'${r.id}')" data-text="${(r.poznamka||'').replace(/"/g,'&quot;')}">Pozn.</button>`:'—'}</td>
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
        <div class="filter-search-wrap">
          <input class="filter-input" id="sFilterQ" type="text" placeholder="Hľadať zákazníka, ID, technika..." value="${f.q}"
            onkeydown="if(event.key==='Enter'){setFilterS('q',this.value)}">
          <button class="filter-search-btn" onclick="setFilterS('q',document.getElementById('sFilterQ').value)" title="Hľadať">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <select class="filter-select filter-select-sm${f.rok?' is-active':''}" onchange="setFilterS('rok',this.value)">${yearOptions(f.rok)}</select>
        <select class="filter-select filter-select-sm${f.mesiac?' is-active':''}" onchange="setFilterS('mesiac',this.value)">${monthOptions(f.mesiac)}</select>
        <select class="filter-select${f.typ?' is-active':''}" onchange="setFilterS('typ',this.value)">
          <option value="">Všetky typy</option>
          ${['Čistenie','Revízia','Oprava','Reklamácia','Iné'].map(s=>`<option ${f.typ===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select${f.zaruka?' is-active':''}" onchange="setFilterS('zaruka',this.value)">
          <option value="">Záruka / Platené</option>
          <option value="Áno" ${f.zaruka==='Áno'?'selected':''}>Iba záruka</option>
          <option value="Nie" ${f.zaruka==='Nie'?'selected':''}>Iba platené</option>
        </select>
        ${priv?`<select class="filter-select${f.obchod?' is-active':''}" onchange="setFilterS('obchod',this.value)">
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
            <td colspan="2"></td>
          </tr>`:''}
        </tbody>
      </table>
    </div>
    ${renderPagination(total,st.page,st.perPage,'S')}`;
}

fsT;
function setFilterS(k,v){
  State.servis.filters[k]=v;
  State.servis.page=1;
  renderServis();
}
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


async function deleteZakazka(id,name){
  if(!confirm(`Naozaj chcete vymazať zákazku "${name}" (${id})?`)) return;
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


async function deleteServis(id,name){
  if(!confirm(`Naozaj chcete vymazať servis "${name}" (${id})?`)) return;
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
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();notify('Export dokončený');
  }catch(e){notify(e.message,'error');}finally{loading(false);}
}
// td already defined above

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

// Event delegation pre tlačidlá v tabuľke používateľov
(function setupUserTableDelegation() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-user-action]');
    if (!btn) return;
    const action   = btn.dataset.userAction;
    const userId   = Number(btn.dataset.userId);
    const username = btn.dataset.username;
    if (action === 'reset-password') openResetPasswordModal(userId, username);
    if (action === 'reset-2fa')      resetUser2FA(userId, username);
    if (action === 'delete')         deleteUser(userId, username);
  });
})();

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

      const tr = document.createElement('tr');
      tr.className = isSelf ? 'users-row-self' : '';
      tr.innerHTML = `
        <td><div class="users-name-cell"><div class="users-avatar">${(u.username||'?')[0].toUpperCase()}</div><span class="users-username">${u.username}</span></div></td>
        <td><span class="users-role-badge ${roleCls[u.role]||''}">${roleMap[u.role]||u.role}</span></td>
        <td>${storeHtml}</td>
        <td>${mfaHtml}</td>
        <td class="users-cell-muted">${new Date(u.created_at).toLocaleDateString('sk-SK')}</td>
        <td>${isSelf ? '<span class="users-cell-muted">Váš účet</span>' : '<div class="users-actions"><button class="users-btn btn-pw">Zmena hesla</button><button class="users-btn btn-2fa">Reset 2FA</button><button class="users-btn users-btn-danger btn-del">Zmazať</button></div>'}</td>
      `;

      // Priame event listenery na tlačidlá (najbezpečnejší spôsob, bez inline onclick)
      if (!isSelf) {
        const uid = u.id;
        const uname = u.username;
        tr.querySelector('.btn-pw').addEventListener('click', function() { openResetPasswordModal(uid, uname); });
        tr.querySelector('.btn-2fa').addEventListener('click', function() { resetUser2FA(uid, uname); });
        tr.querySelector('.btn-del').addEventListener('click', function() { deleteUser(uid, uname); });
      }

      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error('Chyba pri načítaní používateľov:', e);
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
    err.textContent = 'Vyplňte všetky polia a vyberte rolu používateľa.'; err.classList.remove('d-none');
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
  if (!confirm(`Naozaj chcete zmazať konto '${username}'? Táto akcia je nevratná.`)) return;
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
    alert(`2FA pre používateľa ${username} bolo úspešne zresetované.`);
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* --- FUNKCIE PRE ZMENU HESLA --- */
resetPasswordUserId = null;

function openResetPasswordModal(id, username) {
  console.log('[STORMS] openResetPasswordModal called, id=', id, 'username=', username);
  resetPasswordUserId = id;
  var usernameEl = document.getElementById('resetPasswordUsername');
  var passwordEl = document.getElementById('newResetPassword');
  var errEl      = document.getElementById('resetPasswordError');
  var modalEl    = document.getElementById('modalResetPassword');

  if (!modalEl) { console.error('[STORMS] CHYBA: modal #modalResetPassword neexistuje v DOM!'); return; }

  if (usernameEl) usernameEl.textContent = username;
  if (passwordEl) passwordEl.value = '';
  if (errEl) { errEl.classList.add('d-none'); errEl.textContent = ''; }

  // Odstránime d-none ak by bol omylom nastavený, a pridáme open
  modalEl.classList.remove('d-none');
  modalEl.classList.add('open');
  console.log('[STORMS] modal classes:', modalEl.className);
  setTimeout(function(){ if (passwordEl) passwordEl.focus(); }, 150);
}

function closePasswordModal() {
  closeModal('modalResetPassword');
}

async function saveNewPassword() {
  var newPassword = $('newResetPassword').value.trim();
  var err = $('resetPasswordError');
  err.classList.add('d-none');

  if (!newPassword || newPassword.length < 6) {
    err.textContent = 'Heslo musí mať aspoň 6 znakov.';
    err.classList.remove('d-none');
    return;
  }

  try {
    loading(true);
    await api('PUT', `/api/users/${resetPasswordUserId}/reset-password`, { newPassword });
    closePasswordModal();
    notify('Heslo bolo zmenené');
  } catch (e) {
    err.textContent = e.message || 'Chyba pri zmene hesla';
    err.classList.remove('d-none');
  } finally {
    loading(false);
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
_lightboxImages = [], _lightboxIdx = 0;

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
    notify('Heslo bolo zmenené');
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



    const stores = u.store ? u.store.split(',').map(s => s.trim()) : [];
    const storeDisplay = stores.map(s => s.replace('Obchod ','')).join(', ') || '—';
    const h = new Date().getHours();
    const greet = h < 10 ? 'Dobré ráno' : h < 13 ? 'Dobré dopoludnie' : h < 18 ? 'Dobrý deň' : 'Dobrý večer';

    el.innerHTML = `
      <div class="profil-wrap">

        <!-- HERO karta -->
        <div class="profil-hero-card">
          <div class="profil-hero-bg"></div>
          <div class="profil-hero-body">
            <div class="profil-hero-avatar">${initial}</div>
            <div class="profil-hero-info">
              <div class="profil-hero-greet">${greet}</div>
              <div class="profil-hero-name">${u.username || '—'}</div>
              <div class="profil-hero-meta">
                <span class="profil-role-badge ${roleClass[u.role] || 'profil-role-store'}">${roleMap[u.role] || u.role || '—'}</span>
                ${stores.length ? `<span class="profil-hero-stores">${stores.map(s=>s.replace('Obchod ','')).join(' · ')}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="profil-hero-stats">
            <div class="profil-hero-stat">
              <div class="profil-hero-stat-label">Člen od</div>
              <div class="profil-hero-stat-val">${u.created_at ? new Date(u.created_at).toLocaleDateString('sk-SK',{month:'long',year:'numeric'}) : '—'}</div>
            </div>
            <div class="profil-hero-stat-sep"></div>
            <div class="profil-hero-stat">
              <div class="profil-hero-stat-label">2FA ochrana</div>
              <div class="profil-hero-stat-val" style="color:${u.mfa_enabled ? 'var(--green)' : 'var(--amber)'}">
                ${u.mfa_enabled ? 'Aktívna' : 'Nastavuje sa'}
              </div>
            </div>
            <div class="profil-hero-stat-sep"></div>
            <div class="profil-hero-stat">
              <div class="profil-hero-stat-label">Pobočka</div>
              <div class="profil-hero-stat-val">${storeDisplay}</div>
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
              <div style="position:relative">
                <input id="profil_pw1" type="password" class="input" placeholder="Zadajte nové heslo" style="padding-right:42px;width:100%">
                <button type="button" onclick="togglePwVisibility('profil_pw1',this)" tabindex="-1"
                  style="position:absolute;right:0;top:0;height:100%;width:40px;background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;padding:0;transition:color .15s"
                  onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--muted)'" title="Zobraziť/skryť heslo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <div style="margin-bottom:18px">
              <label class="form-label" style="display:block;margin-bottom:6px">Potvrdiť heslo</label>
              <div style="position:relative">
                <input id="profil_pw2" type="password" class="input" placeholder="Zopakujte nové heslo" style="padding-right:42px;width:100%">
                <button type="button" onclick="togglePwVisibility('profil_pw2',this)" tabindex="-1"
                  style="position:absolute;right:0;top:0;height:100%;width:40px;background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;padding:0;transition:color .15s"
                  onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--muted)'" title="Zobraziť/skryť heslo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <div id="profil_pw_err" class="d-none" style="font-size:12px;color:var(--red);background:var(--red-lt);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px"></div>
            <div id="profil_pw_ok"  class="d-none" style="font-size:12px;color:var(--green);background:var(--green-lt);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px">Heslo bolo zmenené</div>
            <button class="btn btn-primary" onclick="profilChangePassword()">Zmeniť heslo</button>
          </div>
        </div>



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
  notify('Nastavenia boli obnovené');
}

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL
   ══════════════════════════════════════════════════════════ */
function toggleSettingsPanel() {
  const panel   = document.getElementById('settingsPanel');
  const overlay = document.getElementById('settingsOverlay');
  const btn     = document.getElementById('hdrSettingsBtn');
  const isOpen  = panel.classList.contains('open');
  if (isOpen) {
    closeSettingsPanel();
  } else {
    renderSettingsPanel();
    panel.classList.add('open');
    overlay.classList.add('open');
    btn.classList.add('active');
  }
}

function closeSettingsPanel() {
  document.getElementById('settingsPanel')?.classList.remove('open');
  document.getElementById('settingsOverlay')?.classList.remove('open');
  document.getElementById('hdrSettingsBtn')?.classList.remove('active');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSettingsPanel();
});

function renderSettingsPanel() {
  const body = document.getElementById('settingsPanelBody');
  if (!body) return;
  const u   = State.user;
  const s   = getAppSettings();
  const sdw = getStoreDashWidgets();
  const isOwner = u?.role === 'owner';

  const toggle = (key, val, fn) => `
    <label class="toggle-switch sp-toggle">
      <input type="checkbox" ${val ? 'checked' : ''} onchange="${fn}('${key}',this.checked)">
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>`;

  const storeDashDefs = [
    { key:'sd_kpi_zakazky', name:'KPI — Zákazky',     desc:'Celkové čísla: počty, tržba, marža zákaziek' },
    { key:'sd_kpi_servis',  name:'KPI — Servis',       desc:'Fakturovaný servis a odpracované hodiny' },
    { key:'sd_marza',       name:'Marža zákaziek',     desc:'Karta s maržou v eurách a percentách' },
    { key:'sd_stavy',       name:'Stavy zákaziek',     desc:'Farebné dlaždice so stavmi (Dopyt, Realizované...)' },
    { key:'sd_zdroj',       name:'Graf zdrojov',       desc:'Odkiaľ prichádzajú zákazky pobočky' },
    { key:'sd_produkt',     name:'Graf produktov',     desc:'Zákazky podľa typu produktu (Krb, Pec...)' },
    { key:'sd_recent',      name:'Posledné zákazky',   desc:'Zoznam najnovších zákaziek pobočky' },
  ];

  body.innerHTML = `

    <!-- VZHĽAD -->
    <div class="sp-section">
      <div class="sp-section-title">Vzhľad</div>
      <div class="sp-theme-grid">
        <button class="sp-theme-btn ${!s.dark_mode ? 'active' : ''}" onclick="setAppSetting('dark_mode',false);renderSettingsPanel()">
          <div class="sp-theme-dot" style="background:#F7F4EE;border-color:#D8CFBA"></div>
          Svetlý
        </button>
        <button class="sp-theme-btn ${s.dark_mode ? 'active' : ''}" onclick="setAppSetting('dark_mode',true);renderSettingsPanel()">
          <div class="sp-theme-dot" style="background:#1A1714;border-color:#3A342C"></div>
          Tmavý
        </button>
      </div>
    </div>

    <!-- VŠEOBECNÉ -->
    <div class="sp-section">
      <div class="sp-section-title">Všeobecné</div>
      <div class="sp-row">
        <div class="sp-row-info">
          <div class="sp-row-name">Hodiny v hlavičke</div>
          <div class="sp-row-desc">Zobraziť aktuálny čas a dátum v navigačnej lište</div>
        </div>
        ${toggle('show_clock', s.show_clock, 'setAppSetting')}
      </div>
      <div class="sp-row">
        <div class="sp-row-info">
          <div class="sp-row-name">Kompaktné tabuľky</div>
          <div class="sp-row-desc">Menší riadkový odstup v tabuľkách zákaziek a servisu</div>
        </div>
        ${toggle('compact_tables', s.compact_tables, 'setAppSetting')}
      </div>
      <div class="sp-row">
        <div class="sp-row-info">
          <div class="sp-row-name">Animácie</div>
          <div class="sp-row-desc">Plynulé prechody a efekty pri načítaní sekcií</div>
        </div>
        ${toggle('animations', s.animations, 'setAppSetting')}
      </div>
    </div>

    ${isOwner ? `
    <!-- DASHBOARD KONATEĽA -->
    <div class="sp-section">
      <div class="sp-section-title">Môj dashboard</div>
      ${[
    { key:'z_kpi',       name:'KPI — Zákazky',         desc:'Hlavné KPI karty (zákazky, tržba, marža)' },
    { key:'s_kpi',       name:'KPI — Servis',          desc:'KPI karta pre servisné zásahy' },
    { key:'stav_chips',  name:'Stavy zákaziek',         desc:'Farebné dlaždice so stavmi' },
    { key:'zdroj_chart', name:'Graf zdrojov',           desc:'Zákazky podľa zdroja (web, showroom...)' },
    { key:'prod_chart',  name:'Graf produktov',         desc:'Zákazky podľa typu produktu' },
    { key:'store_cards', name:'Karty obchodov',         desc:'Prehľad každej pobočky zvlášť' },
    { key:'store_charts',name:'Grafy porovnania',       desc:'Porovnávacie grafy tržieb pobočiek' },
  ].map(wd => {
    const w = getDashWidgets();
    return `<div class="sp-row">
          <div class="sp-row-info">
            <div class="sp-row-name">${wd.name}</div>
            <div class="sp-row-desc">${wd.desc}</div>
          </div>
          ${toggle(wd.key, w[wd.key], 'spToggleOwnerDash')}
        </div>`;
  }).join('')}
    </div>

    <!-- DASHBOARD POBOČIEK — owner nastavuje -->
    <div class="sp-section">
      <div class="sp-section-title">Dashboard pobočiek</div>
      <div style="font-size:11px;color:var(--muted2);margin-bottom:14px;line-height:1.5">
        Nastavte čo majú vidieť pobočky na svojom vlastnom dashboarde.
      </div>
      ${storeDashDefs.map(wd => `
        <div class="sp-row">
          <div class="sp-row-info">
            <div class="sp-row-name">${wd.name}</div>
            <div class="sp-row-desc">${wd.desc}</div>
          </div>
          ${toggle(wd.key, sdw[wd.key], 'spToggleStoreDash')}
        </div>`).join('')}
      <div style="margin-top:14px">
        <button class="btn btn-ghost btn-sm" onclick="localStorage.removeItem(STORE_DASH_WIDGETS_KEY());renderSettingsPanel();if(State.tab==='dashboard')renderDashboard();notify('Predvolené nastavenia pobočiek obnovené')">Obnoviť predvolené</button>
      </div>
    </div>` : ''}

  `;
}

function spToggleOwnerDash(key, val) {
  setDashWidget(key, val);
  if (State.tab === 'dashboard') renderDashboard();
}

function spToggleStoreDash(key, val) {
  setStoreDashWidget(key, val);
  // Ak je práve aktívny store dashboard, prerender
  if (State.tab === 'dashboard') renderDashboard();
}
'use strict';
const router = require('express').Router();
const { query, queryOne, queryCount, run } = require('../db');
const { authenticate, storeWhere, canWrite } = require('../middleware/auth');

router.use(authenticate);

const CALC = r => {
  if (!r) return r;
  r.trzba   = (r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0);
  r.naklady = (r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0);
  r.marza_eur = r.trzba - r.naklady;
  r.marza_pct = r.trzba > 0 ? +(r.marza_eur/r.trzba*100).toFixed(2) : 0;
  return r;
};

function genId(store) {
  const code = store.replace('Obchod ','').replace('V.O.','VO').replace(/\s/g,'');
  const cnt = queryCount('SELECT COUNT(*) as c FROM zakazky WHERE obchod=?',[store]);
  return `${code}-${String(cnt+1).padStart(4,'0')}`;
}

function buildWhere(req) {
  const sw = storeWhere(req);
  const {stav,typ_prod,zdroj,q,obchod} = req.query;
  const parts=[], params=[];
  if (sw.sql)    { parts.push(sw.sql);         params.push(...sw.params); }
  else if (obchod){ parts.push('obchod=?');    params.push(obchod); }
  if (stav)     { parts.push('stav=?');        params.push(stav); }
  if (typ_prod) { parts.push('typ_prod=?');    params.push(typ_prod); }
  if (zdroj)    { parts.push('zdroj=?');       params.push(zdroj); }
  if (q) {
    parts.push('(zakaznik LIKE ? OR id LIKE ? OR lokalita LIKE ? OR model LIKE ?)');
    const l=`%${q}%`; params.push(l,l,l,l);
  }
  const { mesiac } = req.query;
  if (mesiac) {
    parts.push("(dopyt_d LIKE ? OR objednavka_d LIKE ? OR ponuka_d LIKE ?)");
    const m = mesiac + '%';
    params.push(m, m, m);
  }
  return { where: parts.length?'WHERE '+parts.join(' AND '):'', params };
}

const COLS = ['id','zakaznik','dopyt_d','stav','typ_prod','obchod','lokalita','created_at'];

router.get('/', (req,res) => {
  const {page=1,perPage=25,sortCol='created_at',sortDir='desc'} = req.query;
  const {where,params} = buildWhere(req);
  const col = COLS.includes(sortCol)?sortCol:'created_at';
  const dir = sortDir==='asc'?'ASC':'DESC';
  const total = queryCount(`SELECT COUNT(*) as c FROM zakazky ${where}`,params);
  const offset = (parseInt(page)-1)*parseInt(perPage);
  const rows = query(`SELECT * FROM zakazky ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
    [...params,parseInt(perPage),offset]).map(CALC);
  res.json({rows,total,page:+page,perPage:+perPage});
});

router.get('/:id',(req,res)=>{
  const sw=storeWhere(req);
  const r=CALC(queryOne('SELECT * FROM zakazky WHERE id=?',[req.params.id]));
  if (!r) return res.status(404).json({error:'Zákazka nenájdená'});
  if (sw.sql && (!req.user.store || !req.user.store.split(',').includes(r.obchod))) return res.status(403).json({error:'Prístup zamietnutý'});
  res.json(r);
});

router.post('/',(req,res)=>{
  const d=req.body;
  if (!d.zakaznik?.trim()) return res.status(400).json({error:'Zákazník je povinný'});
  if (!d.stav) return res.status(400).json({error:'Stav je povinný'});
  
  // Ak niekto z výberu poslal obchod, použije sa ten. Inak zoberie prvý priradený obchod používateľa.
  let obchod = d.obchod;
  if (!obchod) {
    obchod = ['admin','owner'].includes(req.user.role) ? 'Obchod KE' : (req.user.store ? req.user.store.split(',')[0] : 'Nezaradené');
  }

  if (req.user.role==='store' && !canWrite(req, obchod)) return res.status(403).json({error:'Nemáte oprávnenie pre tento obchod'});
  
  const id=genId(obchod); const s=san(d);
  run(`INSERT INTO zakazky (id,obchod,dopyt_d,obhliadka_d,ponuka_d,objednavka_d,zakaznik,typ_zak,lokalita,
    stav,zdroj,vysledok,typ_prod,typ_riesenia,model,cena_krb,nakup_krb,cena_komin,nakup_komin,
    cena_montaz,naklad_montaz,cena_prislus,nakup_prislus,doprava_fakt,naklad_doprava,zlava,poznamka)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,obchod,s.dopyt_d,s.obhliadka_d,s.ponuka_d,s.objednavka_d,s.zakaznik,s.typ_zak,s.lokalita,
     s.stav,s.zdroj,s.vysledok,s.typ_prod,s.typ_riesenia,s.model,s.cena_krb,s.nakup_krb,s.cena_komin,s.nakup_komin,
     s.cena_montaz,s.naklad_montaz,s.cena_prislus,s.nakup_prislus,s.doprava_fakt,s.naklad_doprava,s.zlava,s.poznamka]);
  res.status(201).json(CALC(queryOne('SELECT * FROM zakazky WHERE id=?',[id])));
});

router.put('/:id',(req,res)=>{
  const r=queryOne('SELECT * FROM zakazky WHERE id=?',[req.params.id]);
  if (!r) return res.status(404).json({error:'Zákazka nenájdená'});
  if (!canWrite(req,r.obchod)) return res.status(403).json({error:'Prístup zamietnutý'});
  const s=san(req.body);
  run(`UPDATE zakazky SET dopyt_d=?,obhliadka_d=?,ponuka_d=?,objednavka_d=?,zakaznik=?,typ_zak=?,lokalita=?,
    stav=?,zdroj=?,vysledok=?,typ_prod=?,typ_riesenia=?,model=?,cena_krb=?,nakup_krb=?,cena_komin=?,nakup_komin=?,
    cena_montaz=?,naklad_montaz=?,cena_prislus=?,nakup_prislus=?,doprava_fakt=?,naklad_doprava=?,zlava=?,poznamka=?,
    updated_at=datetime('now') WHERE id=?`,
    [s.dopyt_d,s.obhliadka_d,s.ponuka_d,s.objednavka_d,s.zakaznik,s.typ_zak,s.lokalita,
     s.stav,s.zdroj,s.vysledok,s.typ_prod,s.typ_riesenia,s.model,s.cena_krb,s.nakup_krb,s.cena_komin,s.nakup_komin,
     s.cena_montaz,s.naklad_montaz,s.cena_prislus,s.nakup_prislus,s.doprava_fakt,s.naklad_doprava,s.zlava,s.poznamka,req.params.id]);
  res.json(CALC(queryOne('SELECT * FROM zakazky WHERE id=?',[req.params.id])));
});

router.delete('/:id',(req,res)=>{
  const r=queryOne('SELECT * FROM zakazky WHERE id=?',[req.params.id]);
  if (!r) return res.status(404).json({error:'Zákazka nenájdená'});
  if (!canWrite(req,r.obchod)) return res.status(403).json({error:'Prístup zamietnutý'});
  run('DELETE FROM zakazky WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

function san(d){
  const n=k=>parseFloat(d[k])||0;
  return {
    dopyt_d:d.dopyt_d||null,obhliadka_d:d.obhliadka_d||null,ponuka_d:d.ponuka_d||null,objednavka_d:d.objednavka_d||null,
    zakaznik:(d.zakaznik||'').trim(),typ_zak:d.typ_zak||null,lokalita:d.lokalita||null,stav:d.stav||null,
    zdroj:d.zdroj||null,vysledok:d.vysledok||null,typ_prod:d.typ_prod||null,typ_riesenia:d.typ_riesenia||null,model:d.model||null,
    cena_krb:n('cena_krb'),nakup_krb:n('nakup_krb'),cena_komin:n('cena_komin'),nakup_komin:n('nakup_komin'),
    cena_montaz:n('cena_montaz'),naklad_montaz:n('naklad_montaz'),cena_prislus:n('cena_prislus'),nakup_prislus:n('nakup_prislus'),
    doprava_fakt:n('doprava_fakt'),naklad_doprava:n('naklad_doprava'),zlava:n('zlava'),poznamka:d.poznamka||null
  };
}
module.exports=router;
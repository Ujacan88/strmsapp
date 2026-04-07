'use strict';
const router = require('express').Router();
const { query, queryOne, queryCount, run } = require('../db');
const { authenticate, storeWhere, canWrite } = require('../middleware/auth');

router.use(authenticate);

const CALC = r => r ? { ...r, marza: (r.fakturovane||0)-(r.naklad||0) } : r;

function genId(store) {
  const code = store.replace('Obchod ','').replace('V.O.','VO').replace(/\s/g,'');
  const cnt = queryCount('SELECT COUNT(*) as c FROM servis WHERE obchod=?',[store]);
  return `S-${code}-${String(cnt+1).padStart(4,'0')}`;
}

function buildWhere(req) {
  const sw=storeWhere(req);
  const {typ,zaruka,q,obchod}=req.query;
  const parts=[],params=[];
  if (sw.sql)    { parts.push(sw.sql);       params.push(...sw.params); }
  else if (obchod){ parts.push('obchod=?');  params.push(obchod); }
  if (typ)    { parts.push('typ=?');    params.push(typ); }
  if (zaruka) { parts.push('zaruka=?'); params.push(zaruka); }
  if (q) { parts.push('(zakaznik LIKE ? OR id LIKE ? OR technik LIKE ?)'); const l=`%${q}%`; params.push(l,l,l); }
  const { mesiac, rok } = req.query;
  // Servis filtruje podľa datum (dátum zásahu) — to je hlavný dátum servisu
  if (rok && mesiac) {
    parts.push("datum LIKE ?");
    params.push(`${rok}-${mesiac}%`);
  } else if (rok) {
    parts.push("datum LIKE ?");
    params.push(`${rok}-%`);
  } else if (mesiac) {
    parts.push("datum LIKE ?");
    params.push(`%-${mesiac}-%`);
  }
  return { where:parts.length?'WHERE '+parts.join(' AND '):'', params };
}

const COLS=['id','datum','zakaznik','technik','typ','fakturovane','cas','obchod','created_at'];

router.get('/',(req,res)=>{
  const {page=1,perPage=25,sortCol='created_at',sortDir='desc'}=req.query;
  const {where,params}=buildWhere(req);
  const col=COLS.includes(sortCol)?sortCol:'created_at';
  const dir=sortDir==='asc'?'ASC':'DESC';
  const total=queryCount(`SELECT COUNT(*) as c FROM servis ${where}`,params);
  const offset=(parseInt(page)-1)*parseInt(perPage);
  const rows=query(`SELECT * FROM servis ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
      [...params,parseInt(perPage),offset]).map(CALC);
  res.json({rows,total,page:+page,perPage:+perPage});
});

router.get('/:id',(req,res)=>{
  const sw=storeWhere(req);
  const r=CALC(queryOne('SELECT * FROM servis WHERE id=?',[req.params.id]));
  if (!r) return res.status(404).json({error:'Servis nenájdený'});
  if (sw.sql && (!req.user.store || !req.user.store.split(',').includes(r.obchod))) return res.status(403).json({error:'Prístup zamietnutý'});
  res.json(r);
});

router.post('/',(req,res)=>{
  const d=req.body;
  if (!d.zakaznik?.trim()) return res.status(400).json({error:'Zákazník je povinný'});
  if (!d.datum) return res.status(400).json({error:'Dátum je povinný'});

  let obchod = d.obchod;
  if (!obchod) {
    obchod = ['admin','owner'].includes(req.user.role) ? 'Obchod KE' : (req.user.store ? req.user.store.split(',')[0] : 'Nezaradené');
  }

  if (!canWrite(req,obchod)) return res.status(403).json({error:'Nemáte oprávnenie'});

  const id=genId(obchod);
  run(`INSERT INTO servis (id,obchod,datum,technik,zakaznik,typ,zaruka,fakturovane,naklad,cas,poznamka)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [id,obchod,d.datum,d.technik||null,(d.zakaznik||'').trim(),d.typ||null,d.zaruka||null,
        parseFloat(d.fakturovane)||0,parseFloat(d.naklad)||0,parseFloat(d.cas)||0,d.poznamka||null]);
  res.status(201).json(CALC(queryOne('SELECT * FROM servis WHERE id=?',[id])));
});

router.put('/:id',(req,res)=>{
  const r=queryOne('SELECT * FROM servis WHERE id=?',[req.params.id]);
  if (!r) return res.status(404).json({error:'Servis nenájdený'});
  if (!canWrite(req,r.obchod)) return res.status(403).json({error:'Prístup zamietnutý'});
  const d=req.body;
  run(`UPDATE servis SET datum=?,technik=?,zakaznik=?,typ=?,zaruka=?,fakturovane=?,naklad=?,cas=?,
    poznamka=?,updated_at=datetime('now') WHERE id=?`,
      [d.datum,d.technik||null,(d.zakaznik||'').trim(),d.typ||null,d.zaruka||null,
        parseFloat(d.fakturovane)||0,parseFloat(d.naklad)||0,parseFloat(d.cas)||0,d.poznamka||null,req.params.id]);
  res.json(CALC(queryOne('SELECT * FROM servis WHERE id=?',[req.params.id])));
});

router.delete('/:id',(req,res)=>{
  const r=queryOne('SELECT * FROM servis WHERE id=?',[req.params.id]);
  if (!r) return res.status(404).json({error:'Servis nenájdený'});
  if (!canWrite(req,r.obchod)) return res.status(403).json({error:'Prístup zamietnutý'});
  run('DELETE FROM servis WHERE id=?',[req.params.id]);
  res.json({ok:true});
});
module.exports=router;
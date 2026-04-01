'use strict';
const router = require('express').Router();
const { query, queryOne, queryCount } = require('../db');
const { authenticate, storeWhere } = require('../middleware/auth');

router.use(authenticate);

function calc(rows) {
  return rows.map(r => {
    r.trzba   = (r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0);
    r.naklady = (r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0);
    r.marza_eur = r.trzba - r.naklady;
    return r;
  });
}

router.get('/', (req, res) => {
  const sw = storeWhere(req);
  const wZ = sw.sql ? `WHERE ${sw.sql}` : '';
  const wS = sw.sql ? `WHERE ${sw.sql}` : '';
  const p  = sw.params;

  // aggregate zakazky
  const allZ = calc(query(`SELECT * FROM zakazky ${wZ}`, p));
  const zKpi = {
    total:      allZ.length,
    realizovane: allZ.filter(r=>r.stav==='Realizované').length,
    trzba:      allZ.reduce((s,r)=>s+r.trzba,0),
    naklady:    allZ.reduce((s,r)=>s+r.naklady,0),
    marza:      allZ.reduce((s,r)=>s+r.marza_eur,0),
  };

  // aggregate servis
  const allS = query(`SELECT * FROM servis ${wS}`, p);
  const sKpi = {
    total:       allS.length,
    fakturovane: allS.reduce((s,r)=>s+(r.fakturovane||0),0),
    naklad:      allS.reduce((s,r)=>s+(r.naklad||0),0),
    marza:       allS.reduce((s,r)=>s+((r.fakturovane||0)-(r.naklad||0)),0),
    cas:         allS.reduce((s,r)=>s+(r.cas||0),0),
  };

  // stav breakdown
  const stavMap = {};
  allZ.forEach(r => { stavMap[r.stav||'—'] = (stavMap[r.stav||'—']||0)+1; });
  const stavCounts = Object.entries(stavMap).map(([stav,cnt])=>({stav,cnt}));

  // zdroj breakdown
  const zdrojMap = {};
  allZ.filter(r=>r.zdroj).forEach(r => { zdrojMap[r.zdroj] = (zdrojMap[r.zdroj]||0)+1; });
  const zdrojCounts = Object.entries(zdrojMap).map(([zdroj,cnt])=>({zdroj,cnt})).sort((a,b)=>b.cnt-a.cnt);

  // produkt breakdown
  const prodMap = {};
  allZ.filter(r=>r.typ_prod).forEach(r => { prodMap[r.typ_prod] = (prodMap[r.typ_prod]||0)+1; });
  const prodCounts = Object.entries(prodMap).map(([typ_prod,cnt])=>({typ_prod,cnt})).sort((a,b)=>b.cnt-a.cnt);

  // store breakdown (owner only)
  let storeBreakdown = null;
  if (!sw.sql) {
    const stores = ['Obchod KE','Obchod SL','Obchod BA','Obchod CZ','V.O.'];
    storeBreakdown = stores.map(store => {
      const zs = calc(query('SELECT * FROM zakazky WHERE obchod = ?', [store]));
      const ss = query('SELECT fakturovane, naklad FROM servis WHERE obchod = ?', [store]);
      return {
        store,
        z: {
          total: zs.length,
          realizovane: zs.filter(r=>r.stav==='Realizované').length,
          trzba: zs.reduce((s,r)=>s+r.trzba,0),
          marza: zs.reduce((s,r)=>s+r.marza_eur,0),
        },
        s: {
          total: ss.length,
          fakturovane: ss.reduce((s,r)=>s+(r.fakturovane||0),0),
          marza: ss.reduce((s,r)=>s+((r.fakturovane||0)-(r.naklad||0)),0),
        }
      };
    });
  }

  // recent 10 zakazky
  const recent = calc(query(`SELECT * FROM zakazky ${wZ} ORDER BY created_at DESC LIMIT 10`, p));
  const recentS = query(`SELECT * FROM servis ${wS} ORDER BY created_at DESC LIMIT 5`, p)
    .map(r => ({ ...r, marza: (r.fakturovane||0)-(r.naklad||0) }));

  res.json({ zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, storeBreakdown, recent, recentS });
});

module.exports = router;

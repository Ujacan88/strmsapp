'use strict';
const router = require('express').Router();
const { query, queryOne, queryCount } = require('../db');
const { authenticate, storeWhere } = require('../middleware/auth');

router.use(authenticate);

const KPI_STAVY = new Set(['Objednané','Realizované']);

function calc(rows) {
    return rows.map(r => {
        const pocitat = KPI_STAVY.has(r.stav);
        r.trzba     = pocitat ? (r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0) : 0;
        r.naklady   = pocitat ? (r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0) : 0;
        r.marza_eur = r.trzba - r.naklady;
        return r;
    });
}

function calcFull(rows) {
    return rows.map(r => {
        r.trzba     = (r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0);
        r.naklady   = (r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0);
        r.marza_eur = r.trzba - r.naklady;
        return r;
    });
}

router.get('/', (req, res) => {
    const sw = storeWhere(req);
    const p  = sw.params;

    // Rok/mesiac filter — len pre privilegovaných (owner/admin)
    const rok    = req.query.rok    ? parseInt(req.query.rok)    : null;
    const mesiac = req.query.mesiac ? parseInt(req.query.mesiac) : null;

    // Zostavenie WHERE podmienok
    function buildWhere(extraConds = [], extraParams = []) {
        const conds = [];
        const params = [...p, ...extraParams];
        if (sw.sql) conds.push(sw.sql);
        if (rok) {
            if (mesiac) {
                const mm = String(mesiac).padStart(2,'0');
                conds.push(`created_at LIKE ?`);
                params.push(`${rok}-${mm}-%`);
            } else {
                conds.push(`created_at LIKE ?`);
                params.push(`${rok}-%`);
            }
        }
        conds.push(...extraConds);
        return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
    }

    const { where: wZ, params: pZ } = buildWhere();
    const { where: wS, params: pS } = buildWhere();

    const allZ = calc(query(`SELECT * FROM zakazky ${wZ}`, pZ));
    const zKpi = {
        total:       allZ.length,
        realizovane: allZ.filter(r=>r.stav==='Realizované').length,
        trzba:       allZ.reduce((s,r)=>s+r.trzba,0),
        naklady:     allZ.reduce((s,r)=>s+r.naklady,0),
        marza:       allZ.reduce((s,r)=>s+r.marza_eur,0),
    };

    const allS = query(`SELECT * FROM servis ${wS}`, pS);
    const sKpi = {
        total:       allS.length,
        fakturovane: allS.reduce((s,r)=>s+(r.fakturovane||0),0),
        naklad:      allS.reduce((s,r)=>s+(r.naklad||0),0),
        marza:       allS.reduce((s,r)=>s+((r.fakturovane||0)-(r.naklad||0)),0),
        cas:         allS.reduce((s,r)=>s+(r.cas||0),0),
    };

    const stavMap = {};
    allZ.forEach(r => { stavMap[r.stav||'—'] = (stavMap[r.stav||'—']||0)+1; });
    const stavCounts = Object.entries(stavMap).map(([stav,cnt])=>({stav,cnt}));

    const zdrojMap = {};
    allZ.filter(r=>r.zdroj).forEach(r => { zdrojMap[r.zdroj] = (zdrojMap[r.zdroj]||0)+1; });
    const zdrojCounts = Object.entries(zdrojMap).map(([zdroj,cnt])=>({zdroj,cnt})).sort((a,b)=>b.cnt-a.cnt);

    const prodMap = {};
    allZ.filter(r=>r.typ_prod).forEach(r => { prodMap[r.typ_prod] = (prodMap[r.typ_prod]||0)+1; });
    const prodCounts = Object.entries(prodMap).map(([typ_prod,cnt])=>({typ_prod,cnt})).sort((a,b)=>b.cnt-a.cnt);

    // store breakdown — aplikuje rok/mesiac filter
    let storeBreakdown = null;
    if (!sw.sql) {
        const stores = ['Obchod KE','Obchod SL','Obchod BA','Obchod CZ','V.O.'];
        storeBreakdown = stores.map(store => {
            const { where: wzStore, params: pzStore } = buildWhere(['obchod = ?'], [store]);
            const { where: wsStore, params: psStore } = buildWhere(['obchod = ?'], [store]);
            // Pre storeBreakdown nechceme globálny storeWhere filter — ideme priamo cez obchod
            let wzS2, pzS2, wsS2, psS2;
            if (rok && mesiac) {
                const mm = String(mesiac).padStart(2,'0');
                wzS2 = `WHERE obchod = ? AND created_at LIKE ?`;
                pzS2 = [store, `${rok}-${mm}-%`];
                wsS2 = wzS2; psS2 = pzS2;
            } else if (rok) {
                wzS2 = `WHERE obchod = ? AND created_at LIKE ?`;
                pzS2 = [store, `${rok}-%`];
                wsS2 = wzS2; psS2 = pzS2;
            } else {
                wzS2 = `WHERE obchod = ?`;
                pzS2 = [store];
                wsS2 = wzS2; psS2 = pzS2;
            }
            const zs = calc(query(`SELECT * FROM zakazky ${wzS2}`, pzS2));
            const ss = query(`SELECT fakturovane, naklad FROM servis ${wsS2}`, psS2);
            return {
                store,
                z: {
                    total:      zs.length,
                    realizovane:zs.filter(r=>r.stav==='Realizované').length,
                    trzba:      zs.reduce((s,r)=>s+r.trzba,0),
                    marza:      zs.reduce((s,r)=>s+r.marza_eur,0),
                },
                s: {
                    total:       ss.length,
                    fakturovane: ss.reduce((s,r)=>s+(r.fakturovane||0),0),
                    marza:       ss.reduce((s,r)=>s+((r.fakturovane||0)-(r.naklad||0)),0),
                }
            };
        });
    }

    const recent  = calcFull(query(`SELECT * FROM zakazky ${wZ} ORDER BY created_at DESC LIMIT 5`, pZ));
    const recentS = query(`SELECT * FROM servis ${wS} ORDER BY created_at DESC LIMIT 5`, pS)
        .map(r => ({ ...r, marza: (r.fakturovane||0)-(r.naklad||0) }));

    res.json({ zKpi, sKpi, stavCounts, zdrojCounts, prodCounts, storeBreakdown, recent, recentS });
});

module.exports = router;
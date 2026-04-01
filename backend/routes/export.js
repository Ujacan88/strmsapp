'use strict';
const router = require('express').Router();
const XLSX   = require('xlsx');
const { query } = require('../db');
const { authenticate, storeWhere } = require('../middleware/auth');

router.use(authenticate);

function buildWhere(req, type) {
  const sw = storeWhere(req);
  const parts = [], params = [];
  if (sw.sql) { parts.push(sw.sql); params.push(...sw.params); }
  else {
    const obchod = req.query.obchod;
    if (obchod) { parts.push('obchod = ?'); params.push(obchod); }
  }
  if (type==='zakazky') {
    const { stav, typ_prod, zdroj, q } = req.query;
    if (stav)     { parts.push('stav = ?');     params.push(stav); }
    if (typ_prod) { parts.push('typ_prod = ?'); params.push(typ_prod); }
    if (zdroj)    { parts.push('zdroj = ?');    params.push(zdroj); }
    if (q) { parts.push('(zakaznik LIKE ? OR id LIKE ? OR lokalita LIKE ?)'); const l=`%${q}%`; params.push(l,l,l); }
  } else {
    const { typ, zaruka, q } = req.query;
    if (typ)    { parts.push('typ = ?');    params.push(typ); }
    if (zaruka) { parts.push('zaruka = ?'); params.push(zaruka); }
    if (q) { parts.push('(zakaznik LIKE ? OR id LIKE ?)'); const l=`%${q}%`; params.push(l,l); }
  }
  return { where: parts.length ? 'WHERE '+parts.join(' AND ') : '', params };
}

/* ── Zákazky ── */
router.get('/zakazky', (req, res) => {
  const { where, params } = buildWhere(req, 'zakazky');
  const rows = query(`SELECT * FROM zakazky ${where} ORDER BY created_at DESC`, params);

  const sections = [
    {
      label: 'Identifikácia',
      cols: [
        { header: 'ID zákazky',        key: r => r.id,            w: 12, type: 'text' },
        { header: 'Obchod',            key: r => r.obchod,        w: 14, type: 'text' },
        { header: 'Zákazník',          key: r => r.zakaznik,      w: 22, type: 'text' },
        { header: 'Typ zákazníka',     key: r => r.typ_zak,       w: 14, type: 'text' },
        { header: 'Lokalita',          key: r => r.lokalita,      w: 16, type: 'text' },
      ]
    },
    {
      label: 'Dátumy',
      cols: [
        { header: 'Dátum dopytu',      key: r => r.dopyt_d,       w: 13, type: 'date' },
        { header: 'Dátum obhliadky',   key: r => r.obhliadka_d,   w: 14, type: 'date' },
        { header: 'Dátum ponuky',      key: r => r.ponuka_d,      w: 13, type: 'date' },
        { header: 'Dátum objednávky',  key: r => r.objednavka_d,  w: 15, type: 'date' },
      ]
    },
    {
      label: 'Produkt',
      cols: [
        { header: 'Stav zákazky',      key: r => r.stav,          w: 14, type: 'stav' },
        { header: 'Typ produktu',      key: r => r.typ_prod,      w: 16, type: 'text' },
        { header: 'Typ riešenia',      key: r => r.typ_riesenia,  w: 20, type: 'text' },
        { header: 'Model / Značka',    key: r => r.model,         w: 18, type: 'text' },
        { header: 'Zdroj leadu',       key: r => r.zdroj,         w: 14, type: 'text' },
        { header: 'Výsledok obhliadky',key: r => r.vysledok,      w: 16, type: 'text' },
      ]
    },
    {
      label: 'Financie (€)',
      cols: [
        { header: 'Cena krb/pec',      key: r => r.cena_krb,      w: 13, type: 'eur' },
        { header: 'Nákup krb/pec',     key: r => r.nakup_krb,     w: 13, type: 'eur' },
        { header: 'Cena komín',        key: r => r.cena_komin,    w: 12, type: 'eur' },
        { header: 'Nákup komín',       key: r => r.nakup_komin,   w: 12, type: 'eur' },
        { header: 'Cena montáž',       key: r => r.cena_montaz,   w: 12, type: 'eur' },
        { header: 'Náklad montáž',     key: r => r.naklad_montaz, w: 13, type: 'eur' },
        { header: 'Cena príslušenstvo',key: r => r.cena_prislus,  w: 15, type: 'eur' },
        { header: 'Nákup príslušenstvo',key: r => r.nakup_prislus,w: 16, type: 'eur' },
        { header: 'Doprava faktur.',   key: r => r.doprava_fakt,  w: 13, type: 'eur' },
        { header: 'Náklad doprava',    key: r => r.naklad_doprava,w: 13, type: 'eur' },
        { header: 'Tržba',             key: r => (r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0), w: 13, type: 'eur-bold' },
        { header: 'Náklady',           key: r => (r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0), w: 13, type: 'eur-bold' },
        { header: 'Marža €',           key: r => { const t=(r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0); const n=(r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0); return t-n; }, w: 12, type: 'marza-eur' },
        { header: 'Marža %',           key: r => { const t=(r.cena_krb||0)+(r.cena_komin||0)+(r.cena_montaz||0)+(r.cena_prislus||0)+(r.doprava_fakt||0); const n=(r.nakup_krb||0)+(r.nakup_komin||0)+(r.naklad_montaz||0)+(r.nakup_prislus||0)+(r.naklad_doprava||0); return t>0?+((t-n)/t*100).toFixed(2):0; }, w: 10, type: 'marza-pct' },
        { header: 'Zľava %',           key: r => r.zlava,         w: 9,  type: 'num' },
      ]
    },
    {
      label: 'Poznámka',
      cols: [
        { header: 'Poznámka',          key: r => r.poznamka,      w: 32, type: 'text' },
      ]
    },
  ];

  sendSectionedXlsx(res, sections, rows, 'Zákazky', `STORMS_Zakazky_${today()}.xlsx`);
});

/* ── Servis ── */
router.get('/servis', (req, res) => {
  const { where, params } = buildWhere(req, 'servis');
  const rows = query(`SELECT * FROM servis ${where} ORDER BY created_at DESC`, params);

  const sections = [
    {
      label: 'Identifikácia',
      cols: [
        { header: 'ID servisu',        key: r => r.id,            w: 12, type: 'text' },
        { header: 'Obchod',            key: r => r.obchod,        w: 14, type: 'text' },
        { header: 'Zákazník',          key: r => r.zakaznik,      w: 22, type: 'text' },
        { header: 'Dátum',             key: r => r.datum,         w: 13, type: 'date' },
        { header: 'Technik',           key: r => r.technik,       w: 16, type: 'text' },
        { header: 'Typ zásahu',        key: r => r.typ,           w: 16, type: 'text' },
        { header: 'Záruka',            key: r => r.zaruka,        w: 10, type: 'text' },
      ]
    },
    {
      label: 'Financie (€)',
      cols: [
        { header: 'Fakturované €',     key: r => r.fakturovane,   w: 14, type: 'eur-bold' },
        { header: 'Náklad €',          key: r => r.naklad,        w: 12, type: 'eur' },
        { header: 'Marža €',           key: r => (r.fakturovane||0)-(r.naklad||0), w: 12, type: 'marza-eur' },
        { header: 'Čas (hod.)',        key: r => r.cas,           w: 11, type: 'num' },
      ]
    },
    {
      label: 'Poznámka',
      cols: [
        { header: 'Poznámka',          key: r => r.poznamka,      w: 32, type: 'text' },
      ]
    },
  ];

  sendSectionedXlsx(res, sections, rows, 'Servis', `STORMS_Servis_${today()}.xlsx`);
});

/* ═══════════════════════════════════════════════════════
   XLSX generator — sekciová hlavička + štýly
   ═══════════════════════════════════════════════════════ */
function sendSectionedXlsx(res, sections, rows, sheetName, filename) {
  const wb = XLSX.utils.book_new();

  // Flatten columns
  const allCols = sections.flatMap(s => s.cols);
  const totalCols = allCols.length;

  // Colors
  const C = {
    AMBER:    'C4621F',
    AMBER_LT: 'F5E6D6',
    AMBER_XLT:'FDF8F3',
    INK:      '18150F',
    INK2:     '3A3428',
    WHITE:    'FFFFFF',
    CREAM:    'F7F4EE',
    CREAM2:   'FDFCF9',
    SAND_LT:  'EDE8DF',
    BORDER:   'BEB29A',
    BORDER_HVY:'8C7B65',
    GREEN:    '306B47',
    GREEN_LT: 'E0EEE7',
    RED:      '9E2828',
    RED_LT:   'F5E0E0',
    MUTED:    '78705F',
    BLUE:     '284F96',
    BLUE_LT:  'D8E5F6',
  };

  const thin = c => ({ style:'thin',   color:{rgb:c} });
  const med  = c => ({ style:'medium', color:{rgb:c} });
  const no   =     () => ({ style:'none' });

  function bord(t,b,l,r) { return {top:t,bottom:b,left:l,right:r}; }
  function allBord(s,c)  { const x=s(c); return bord(x,x,x,x); }

  const addr = (r,c) => XLSX.utils.encode_cell({r,c});
  function sc(ws, r, c, style) {
    const a = addr(r,c);
    if (!ws[a]) ws[a] = {t:'s', v:''};
    ws[a].s = style;
  }

  // ── Build rows ──
  // Row 0: Company title (merged full width)
  // Row 1: Export info (merged full width)
  // Row 2: Section headers (grouped)
  // Row 3: Column headers
  // Row 4+: Data

  const TITLE_ROW   = 0;
  const INFO_ROW    = 1;
  const SEC_ROW     = 2;
  const HDR_ROW     = 3;
  const DATA_START  = 4;

  const titleRowData  = [`STORMS — ${sheetName}`];
  const infoRowData   = [`Export: ${new Date().toLocaleDateString('sk-SK', {day:'2-digit',month:'long',year:'numeric'})}   |   Počet záznamov: ${rows.length}`];
  
  // Section row: section label for first col of each section, empty for rest
  const secRowData = [];
  let ci = 0;
  for (const sec of sections) {
    secRowData.push(sec.label);
    for (let i = 1; i < sec.cols.length; i++) secRowData.push('');
    ci += sec.cols.length;
  }

  const hdrRowData = allCols.map(c => c.header);
  const dataRows   = rows.map(r => allCols.map(c => {
    const v = c.key(r);
    return (v === null || v === undefined) ? '' : v;
  }));

  const allData = [titleRowData, infoRowData, secRowData, hdrRowData, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allData);

  // ── Column widths ──
  ws['!cols'] = allCols.map(c => ({wch: c.w}));

  // ── Merges ──
  const merges = [];
  merges.push({s:{r:TITLE_ROW,c:0}, e:{r:TITLE_ROW,c:totalCols-1}});
  merges.push({s:{r:INFO_ROW,c:0},  e:{r:INFO_ROW,c:totalCols-1}});
  // Section merges
  let secStart = 0;
  for (const sec of sections) {
    if (sec.cols.length > 1) {
      merges.push({s:{r:SEC_ROW,c:secStart}, e:{r:SEC_ROW,c:secStart+sec.cols.length-1}});
    }
    secStart += sec.cols.length;
  }
  ws['!merges'] = merges;

  // ── Row heights ──
  ws['!rows'] = [
    {hpt: 36},  // title
    {hpt: 20},  // info
    {hpt: 20},  // section
    {hpt: 32},  // headers
    ...Array(rows.length).fill({hpt: 19}),
  ];

  // ── TITLE ROW ──
  sc(ws, TITLE_ROW, 0, {
    font:  {bold:true, sz:16, color:{rgb:C.WHITE}, name:'Calibri'},
    fill:  {fgColor:{rgb:C.AMBER}, patternType:'solid'},
    alignment: {horizontal:'left', vertical:'center', indent:1},
    border: allBord(med, C.AMBER),
  });
  for (let c=1; c<totalCols; c++) {
    sc(ws, TITLE_ROW, c, {fill:{fgColor:{rgb:C.AMBER},patternType:'solid'}, border:allBord(thin,C.AMBER)});
  }

  // ── INFO ROW ──
  sc(ws, INFO_ROW, 0, {
    font:  {sz:10, color:{rgb:C.MUTED}, name:'Calibri', italic:true},
    fill:  {fgColor:{rgb:C.AMBER_LT}, patternType:'solid'},
    alignment: {horizontal:'left', vertical:'center', indent:1},
    border: {top:thin(C.AMBER_LT), bottom:thin(C.BORDER), left:med(C.AMBER), right:med(C.AMBER)},
  });
  for (let c=1; c<totalCols; c++) {
    sc(ws, INFO_ROW, c, {fill:{fgColor:{rgb:C.AMBER_LT},patternType:'solid'}, border:{top:thin(C.AMBER_LT),bottom:thin(C.BORDER),left:thin(C.AMBER_LT),right:c===totalCols-1?med(C.AMBER):thin(C.AMBER_LT)}});
  }

  // ── SECTION ROW ──
  secStart = 0;
  for (const sec of sections) {
    const isLast = secStart + sec.cols.length === totalCols;
    sc(ws, SEC_ROW, secStart, {
      font:  {bold:true, sz:9, color:{rgb:C.AMBER}, name:'Calibri'},
      fill:  {fgColor:{rgb:C.AMBER_XLT}, patternType:'solid'},
      alignment: {horizontal:'center', vertical:'center'},
      border: {
        top:    thin(C.BORDER),
        bottom: thin(C.BORDER),
        left:   secStart===0 ? med(C.AMBER) : thin(C.BORDER),
        right:  isLast ? med(C.AMBER) : thin(C.SAND_LT),
      },
    });
    for (let i=1; i<sec.cols.length; i++) {
      const c = secStart+i;
      const isLastCol = c === totalCols-1;
      sc(ws, SEC_ROW, c, {
        fill:  {fgColor:{rgb:C.AMBER_XLT}, patternType:'solid'},
        border: {
          top:    thin(C.BORDER),
          bottom: thin(C.BORDER),
          left:   thin(C.AMBER_XLT),
          right:  isLastCol ? med(C.AMBER) : thin(C.SAND_LT),
        },
      });
    }
    secStart += sec.cols.length;
  }

  // ── HEADER ROW ──
  secStart = 0;
  let secIdx = 0;
  let inSecOffset = 0;
  for (let c=0; c<totalCols; c++) {
    const isFirstInSec = inSecOffset === 0;
    const sec = sections[secIdx];
    const isLastInSec = inSecOffset === sec.cols.length - 1;
    const isFirstCol = c === 0;
    const isLastCol  = c === totalCols - 1;

    sc(ws, HDR_ROW, c, {
      font:  {bold:true, sz:9, color:{rgb:C.WHITE}, name:'Calibri'},
      fill:  {fgColor:{rgb:C.INK2}, patternType:'solid'},
      alignment: {horizontal:'center', vertical:'center', wrapText:true},
      border: {
        top:    med(C.BORDER_HVY),
        bottom: med(C.AMBER),
        left:   (isFirstCol||isFirstInSec) ? thin(C.BORDER) : thin(C.INK2),
        right:  (isLastCol||isLastInSec)   ? thin(C.BORDER) : thin(C.INK2),
      },
    });

    inSecOffset++;
    if (inSecOffset >= sec.cols.length) {
      secIdx++;
      inSecOffset = 0;
    }
  }

  // ── DATA ROWS ──
  secStart = 0;
  const secBoundaries = [];
  let col = 0;
  for (const sec of sections) {
    secBoundaries.push({start: col, end: col + sec.cols.length - 1});
    col += sec.cols.length;
  }

  for (let r = DATA_START; r < allData.length; r++) {
    const isEven  = (r - DATA_START) % 2 === 0;
    const isLast  = r === allData.length - 1;
    const rowBg   = isEven ? C.WHITE : C.CREAM;

    for (let c=0; c<totalCols; c++) {
      const a   = addr(r, c);
      if (!ws[a]) ws[a] = {t:'s', v:''};
      const val = allData[r][c];
      const colDef = allCols[c];
      const type = colDef.type;
      const isFirstCol = c === 0;
      const isLastCol  = c === totalCols - 1;

      // Find section boundary
      let isSecStart = false, isSecEnd = false;
      for (const sb of secBoundaries) {
        if (sb.start === c) isSecStart = true;
        if (sb.end   === c) isSecEnd   = true;
      }

      let bg   = rowBg;
      let fg   = C.INK2;
      let bold = false;
      let numFmt = undefined;
      let align = 'left';

      if (type === 'eur' || type === 'eur-bold' || type === 'num') {
        align = 'right';
        numFmt = '#,##0.00';
        if (type === 'eur-bold') bold = true;
      }
      if (type === 'marza-eur') {
        align = 'right';
        numFmt = '#,##0.00';
        if (typeof val === 'number') {
          if (val > 0) { fg = C.GREEN; bold = true; }
          else if (val < 0) { bg = C.RED_LT; fg = C.RED; bold = true; }
        }
      }
      if (type === 'marza-pct') {
        align = 'right';
        numFmt = '0.00"%"';
        if (typeof val === 'number') {
          if (val >= 20) { fg = C.GREEN; bold = true; }
          else if (val < 0) { bg = C.RED_LT; fg = C.RED; bold = true; }
        }
      }
      if (type === 'stav' && val) {
        const stavColors = {
          'Realizované': {bg:C.GREEN_LT, fg:C.GREEN},
          'Storno':      {bg:C.RED_LT,   fg:C.RED},
          'Objednané':   {bg:C.AMBER_LT, fg:C.AMBER},
        };
        if (stavColors[val]) { bg = stavColors[val].bg; fg = stavColors[val].fg; bold = true; }
      }

      ws[a].s = {
        font:  {sz:10, color:{rgb:fg}, bold, name:'Calibri'},
        fill:  {fgColor:{rgb:bg}, patternType:'solid'},
        alignment: {horizontal:align, vertical:'center'},
        border: {
          top:    thin(isEven ? C.SAND_LT : C.BORDER),
          bottom: isLast ? med(C.BORDER_HVY) : thin(C.BORDER),
          left:   (isFirstCol||isSecStart) ? thin(C.BORDER) : thin(C.SAND_LT),
          right:  (isLastCol||isSecEnd)    ? thin(C.BORDER) : thin(C.SAND_LT),
        },
        numFmt,
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, {type:'buffer', bookType:'xlsx', cellStyles:true});
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

function today() { return new Date().toISOString().slice(0,10); }

module.exports = router;

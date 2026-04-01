'use strict';
const router = require('express').Router();
const XLSX   = require('xlsx');
const { run, query } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

/* ─────────────────────────────────────────────────────────────
   POMOCNÉ FUNKCIE
───────────────────────────────────────────────────────────── */

// Normalizuje string: lowercase, bez diakritiky, bez medzier/špeciálnych znakov
const norm = s => (s === null || s === undefined ? '' : String(s))
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

// Parsuje dátum z rôznych formátov
const parseDate = v => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // Excel sériové číslo (napr. 45123)
  if (/^\d{4,5}$/.test(s)) {
    const n = parseInt(s);
    if (n > 25000 && n < 60000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  // ISO alebo DD.MM.YYYY alebo MM/DD/YYYY
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Ostatné — vráť prvých 10 znakov ak vyzerá ako dátum
  if (s.length >= 8) return s.slice(0, 10);
  return null;
};

// Parsuje číslo bezpečne
const parseNum = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

// Nájde index stĺpca podľa zoznamu možných názvov (normalizovaných)
const findCol = (headerNorms, aliases) => {
  for (const alias of aliases) {
    const n = norm(alias);
    const idx = headerNorms.indexOf(n);
    if (idx >= 0) return idx;
  }
  // Fuzzy match — hľadaj alias ako substring normalizovaného headera
  for (const alias of aliases) {
    const n = norm(alias);
    const idx = headerNorms.findIndex(h => h.includes(n) || n.includes(h) && n.length > 3);
    if (idx >= 0) return idx;
  }
  return -1;
};

// Vytvorí getter z riadku
const makeGetters = (headerNorms, row) => {
  const get = (aliases) => {
    const idx = findCol(headerNorms, aliases);
    if (idx < 0) return '';
    const v = row[idx];
    return (v === null || v === undefined) ? '' : String(v).trim();
  };
  const getDate = (aliases) => parseDate(get(aliases) || (findCol(headerNorms, aliases) >= 0 ? row[findCol(headerNorms, aliases)] : null));
  const getNum  = (aliases) => parseNum(get(aliases));
  return { get, getDate, getNum };
};

// Nájde riadok s hlavičkou (preskočí titulné/prázdne riadky)
const findHeaderRow = (raw, keywords) => {
  for (let i = 0; i < Math.min(raw.length, 8); i++) {
    const joined = norm((raw[i] || []).join(' '));
    if (keywords.some(k => joined.includes(norm(k)))) return i;
  }
  return 0;
};

// Debugovací výpis hlavičiek
const debugHeaders = (headerNorms) => {
  console.log('[IMPORT] Hlavičky nájdené:', headerNorms.join(' | '));
};

/* ─────────────────────────────────────────────────────────────
   IMPORT ZÁKAZIEK
───────────────────────────────────────────────────────────── */
router.post('/zakazky', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'Chýbajú dáta súboru' });

    const buf = Buffer.from(fileBase64, 'base64');
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    // Nájdi riadok s hlavičkou
    const hIdx = findHeaderRow(raw, ['zakaznik', 'zákazník', 'id zákazky', 'id zakazky', 'obchod', 'stav']);
    const headerRaw   = (raw[hIdx] || []).map(c => String(c || ''));
    const headerNorms = headerRaw.map(norm);
    const dataRows    = raw.slice(hIdx + 1).filter(r =>
      Array.isArray(r) && r.some(c => c !== '' && c !== null && c !== undefined)
    );

    debugHeaders(headerNorms);
    if (!dataRows.length) return res.status(400).json({ error: 'Súbor neobsahuje žiadne dáta po hlavičke' });

    const defaultStore = req.user.store ? req.user.store.split(',')[0].trim() : 'Nezaradené';
    let added = 0, updated = 0, skipped = 0, counter = 0;
    const errors = [];

    for (const row of dataRows) {
      counter++;
      const { get, getDate, getNum } = makeGetters(headerNorms, row);

      const currentStore = get(['obchod', 'pobočka', 'pobocka']) || defaultStore;
      const code = currentStore.replace('Obchod ', '').replace('V.O.', 'VO').replace(/\s/g, '');
      const importedId = get(['id zákazky', 'id zakazky', 'id', 'ID zákazky', 'ID zakazky']);
      const id = importedId || `${code}-IMP-${Date.now()}-${counter}`;

      const zakaznik = get(['zákazník', 'zakaznik', 'meno zákazníka', 'meno zakaznika', 'customer', 'klient']);
      if (!zakaznik) { skipped++; continue; }

      const values = [
        id,
        currentStore,
        getDate(['dátum dopytu', 'datum dopytu', 'dopyt d', 'dopyt', 'dátum záujmu']),
        getDate(['dátum obhliadky', 'datum obhliadky', 'obhliadka d', 'obhliadka']),
        getDate(['dátum ponuky', 'datum ponuky', 'ponuka d', 'ponuka']),
        getDate(['dátum objednávky', 'datum objednavky', 'dátum objednávky / zmluvy', 'objednavka d', 'objednavka', 'zmluva']),
        zakaznik,
        get(['typ zákazníka', 'typ zakaznika', 'typ zak']),
        get(['lokalita', 'adresa', 'miesto']),
        get(['stav zákazky', 'stav zakazky', 'stav']),
        get(['zdroj leadu', 'zdroj leadu', 'zdroj', 'source']),
        get(['výsledok obhliadky', 'vysledok obhliadky', 'výsledok', 'vysledok', 'outcome']),
        get(['typ produktu', 'typ prod', 'typ_prod', 'produkt']),
        get(['typ riešenia', 'typ riesenia', 'typ_riesenia', 'riesenie']),
        get(['model / značka', 'model/značka', 'model / znacka', 'model', 'značka', 'znacka']),
        getNum(['cena krb/pec', 'cena krb/pec (predaj)', 'cena krb', 'cena pec', 'cena_krb']),
        getNum(['nákup krb/pec', 'nakup krb/pec', 'nákup krb', 'nakup krb', 'nakup_krb']),
        getNum(['cena komín', 'cena komin', 'cena_komin']),
        getNum(['nákup komín', 'nakup komin', 'nakup_komin']),
        getNum(['cena montáž', 'cena montaz', 'cena_montaz']),
        getNum(['náklad montáž', 'naklad montaz', 'naklad_montaz']),
        getNum(['cena príslušenstvo', 'cena prislusenstvo', 'cena_prislus', 'príslušenstvo predaj']),
        getNum(['nákup príslušenstvo', 'nakup prislusenstvo', 'nakup_prislus', 'príslušenstvo nákup']),
        getNum(['doprava faktur.', 'doprava fakturovaná', 'doprava fakturovana', 'doprava_fakt', 'doprava predaj']),
        getNum(['náklad doprava', 'naklad doprava', 'naklad_doprava', 'doprava náklad']),
        getNum(['zľava %', 'zlava %', 'zlava', 'zľava', 'discount']),
        get(['poznámka', 'poznamka', 'note', 'notes', 'komentár', 'komentar']),
      ];

      try {
        // Skús INSERT, ak existuje ID tak UPDATE
        const exists = importedId
          ? query('SELECT id FROM zakazky WHERE id = ?', [id]).length > 0
          : false;

        if (exists) {
          run(`UPDATE zakazky SET
            obchod=?,dopyt_d=?,obhliadka_d=?,ponuka_d=?,objednavka_d=?,zakaznik=?,typ_zak=?,lokalita=?,
            stav=?,zdroj=?,vysledok=?,typ_prod=?,typ_riesenia=?,model=?,cena_krb=?,nakup_krb=?,
            cena_komin=?,nakup_komin=?,cena_montaz=?,naklad_montaz=?,cena_prislus=?,nakup_prislus=?,
            doprava_fakt=?,naklad_doprava=?,zlava=?,poznamka=?,updated_at=datetime('now')
            WHERE id=?`,
            [...values.slice(1), id]
          );
          updated++;
        } else {
          run(`INSERT OR IGNORE INTO zakazky
            (id,obchod,dopyt_d,obhliadka_d,ponuka_d,objednavka_d,zakaznik,typ_zak,lokalita,stav,zdroj,vysledok,
             typ_prod,typ_riesenia,model,cena_krb,nakup_krb,cena_komin,nakup_komin,cena_montaz,naklad_montaz,
             cena_prislus,nakup_prislus,doprava_fakt,naklad_doprava,zlava,poznamka)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            values
          );
          added++;
        }
      } catch (e) {
        console.error(`[IMPORT] Riadok ${counter} chyba:`, e.message, '| hodnoty:', values.slice(0,5));
        errors.push(`Riadok ${counter}: ${e.message}`);
        skipped++;
      }
    }

    const resp = { ok: true, added, updated, skipped };
    if (errors.length) resp.errors = errors.slice(0, 5);
    res.json(resp);
  } catch (e) {
    console.error('[IMPORT zákazky] Fatálna chyba:', e);
    res.status(400).json({ error: 'Chyba pri importe: ' + e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   IMPORT SERVISU
───────────────────────────────────────────────────────────── */
router.post('/servis', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'Chýbajú dáta súboru' });

    const buf = Buffer.from(fileBase64, 'base64');
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    const hIdx = findHeaderRow(raw, ['zakaznik', 'zákazník', 'technik', 'datum', 'dátum', 'typ zásahu']);
    const headerRaw   = (raw[hIdx] || []).map(c => String(c || ''));
    const headerNorms = headerRaw.map(norm);
    const dataRows    = raw.slice(hIdx + 1).filter(r =>
      Array.isArray(r) && r.some(c => c !== '' && c !== null && c !== undefined)
    );

    debugHeaders(headerNorms);
    if (!dataRows.length) return res.status(400).json({ error: 'Súbor neobsahuje žiadne dáta po hlavičke' });

    const defaultStore = req.user.store ? req.user.store.split(',')[0].trim() : 'Nezaradené';
    let added = 0, updated = 0, skipped = 0, counter = 0;
    const errors = [];

    for (const row of dataRows) {
      counter++;
      const { get, getDate, getNum } = makeGetters(headerNorms, row);

      const currentStore = get(['obchod', 'pobočka', 'pobocka']) || defaultStore;
      const code = currentStore.replace('Obchod ', '').replace('V.O.', 'VO').replace(/\s/g, '');
      const importedId = get(['id servisu', 'id servis', 'id', 'ID servisu']);
      const id = importedId || `S-${code}-IMP-${Date.now()}-${counter}`;

      const zakaznik = get(['zákazník', 'zakaznik', 'meno zákazníka', 'klient', 'customer']);
      if (!zakaznik) { skipped++; continue; }

      const values = [
        id,
        currentStore,
        getDate(['dátum', 'datum', 'dátum zásahu', 'datum zasahu', 'date']),
        get(['technik', 'mechanik', 'technician']),
        zakaznik,
        get(['typ zásahu', 'typ zasahu', 'typ', 'type', 'druh zásahu']),
        get(['záruka?', 'zaruka?', 'záruka', 'zaruka', 'warranty', 'garancia']),
        getNum(['fakturované €', 'fakturovane €', 'fakturované', 'fakturovane', 'suma', 'cena', 'invoice']),
        getNum(['náklad €', 'naklad €', 'náklad', 'naklad', 'cost', 'náklady']),
        getNum(['čas (hod.)', 'cas (hod.)', 'čas', 'cas', 'hodiny', 'hours', 'time']),
        get(['poznámka', 'poznamka', 'note', 'notes', 'komentár']),
      ];

      try {
        const exists = importedId
          ? query('SELECT id FROM servis WHERE id = ?', [id]).length > 0
          : false;

        if (exists) {
          run(`UPDATE servis SET
            obchod=?,datum=?,technik=?,zakaznik=?,typ=?,zaruka=?,fakturovane=?,naklad=?,cas=?,poznamka=?,
            updated_at=datetime('now') WHERE id=?`,
            [...values.slice(1), id]
          );
          updated++;
        } else {
          run(`INSERT OR IGNORE INTO servis (id,obchod,datum,technik,zakaznik,typ,zaruka,fakturovane,naklad,cas,poznamka)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            values
          );
          added++;
        }
      } catch (e) {
        console.error(`[IMPORT servis] Riadok ${counter} chyba:`, e.message);
        errors.push(`Riadok ${counter}: ${e.message}`);
        skipped++;
      }
    }

    const resp = { ok: true, added, updated, skipped };
    if (errors.length) resp.errors = errors.slice(0, 5);
    res.json(resp);
  } catch (e) {
    console.error('[IMPORT servis] Fatálna chyba:', e);
    res.status(400).json({ error: 'Chyba pri importe: ' + e.message });
  }
});

module.exports = router;

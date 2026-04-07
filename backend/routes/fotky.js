'use strict';
const router = require('express').Router();
const { query, run } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// POZOR: špecifické routes MUSIA byť pred generickými /:parentId

// 5. Počet súborov – /count/:parentId (musí byť pred /:parentId)
router.get('/count/:parentId', (req, res) => {
  try {
    const rows = query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN 1 ELSE 0 END) as fotky,
        SUM(CASE WHEN mime_type NOT LIKE 'image/%' THEN 1 ELSE 0 END) as prilohy
       FROM fotky WHERE parent_id = ?`,
      [req.params.parentId]
    );
    res.json(rows[0] || { total: 0, fotky: 0, prilohy: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Presuň fotky z dočasného ID na reálne (po uložení novej zákazky/servisu)
router.post('/move', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Chýbajú parametre' });
  try {
    run('UPDATE fotky SET parent_id = ? WHERE parent_id = ?', [to, from]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 1. Načítaj všetky súbory pre zákazku/servis
router.get('/:parentId', (req, res) => {
  try {
    const rows = query(
      'SELECT id, nazov, mime_type, created_at FROM fotky WHERE parent_id = ? ORDER BY created_at ASC',
      [req.params.parentId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Chyba pri načítaní súborov: ' + e.message });
  }
});

// 2. Načítaj konkrétny súbor (lazy load dát)
router.get('/:parentId/:id/data', (req, res) => {
  try {
    const row = query(
      'SELECT id, nazov, mime_type, data_b64 FROM fotky WHERE id = ? AND parent_id = ?',
      [req.params.id, req.params.parentId]
    )[0];
    if (!row) return res.status(404).json({ error: 'Súbor nenájdený' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Nahraj nový súbor (fotka alebo príloha)
router.post('/', (req, res) => {
  const { parent_id, typ, nazov, data_b64, mime_type } = req.body;
  if (!parent_id || !data_b64) return res.status(400).json({ error: 'Chýbajú dáta súboru' });

  try {
    // Oprava: správna detekcia MIME (predtým chyba v priorite ternárneho operátora)
    let detectedMime = mime_type;
    if (!detectedMime) {
      const n = (nazov || '').toLowerCase();
      if (n.match(/\.(jpg|jpeg)$/)) detectedMime = 'image/jpeg';
      else if (n.match(/\.png$/))   detectedMime = 'image/png';
      else if (n.match(/\.gif$/))   detectedMime = 'image/gif';
      else if (n.match(/\.webp$/))  detectedMime = 'image/webp';
      else if (n.match(/\.pdf$/))   detectedMime = 'application/pdf';
      else detectedMime = 'application/octet-stream';
    }

    run('INSERT INTO fotky (parent_id, typ, nazov, mime_type, data_b64) VALUES (?, ?, ?, ?, ?)',
      [parent_id, typ || 'zakazka', nazov || 'subor', detectedMime, data_b64]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Chyba pri ukladaní: ' + e.message });
  }
});

// 4. Vymaž súbor
router.delete('/:id', (req, res) => {
  try {
    run('DELETE FROM fotky WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

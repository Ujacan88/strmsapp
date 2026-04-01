'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { run, queryOne } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/profil/me – vráti info o prihlásenom používateľovi
router.get('/me', (req, res) => {
  try {
    const user = queryOne(
      'SELECT id, username, role, store, mfa_enabled, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Používateľ nenájdený' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/profil/password – zmena vlastného hesla
router.put('/password', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Heslo musí mať aspoň 6 znakov' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

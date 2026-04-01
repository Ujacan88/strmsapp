'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');

// Poistka: Iba Majiteľ a Admin môžu do tejto sekcie
const requireAdmin = (req, res, next) => {
    if (!['admin', 'owner'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Prístup zamietnutý' });
    }
    next();
};

router.use(authenticate, requireAdmin);

// Získaj všetkých používateľov do tabuľky
router.get('/', (req, res) => {
    // Schválne neposielame heslá ani tajné kľúče z databázy
    const users = query('SELECT id, username, role, store, mfa_enabled, created_at FROM users ORDER BY id DESC');
    res.json(users);
});

// Vytvor nového používateľa
router.post('/', (req, res) => {
    const { username, password, role, store } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: 'Chýbajú údaje' });
    
    // Skontrolujeme, či už taký nie je
    const exist = queryOne('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (exist) return res.status(400).json({ error: 'Toto meno už existuje' });

    // Zašifrujeme heslo a uložíme
    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, password, role, store) VALUES (?, ?, ?, ?)', 
        [username.trim(), hash, role, store || null]);
    
    res.json({ ok: true });
});

// Reset 2FA (Ak stratia mobil, nastavíme mfa_enabled na 0 a vymažeme tajný kľúč)
router.put('/:id/reset-2fa', (req, res) => {
    run('UPDATE users SET mfa_secret = NULL, mfa_enabled = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
});

// Reset hesla (Admin zadá nové heslo pre používateľa)
router.put('/:id/reset-password', (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Heslo musí mať aspoň 6 znakov' });
    }
    // Zašifrujeme nové heslo a uložíme
    const hash = bcrypt.hashSync(newPassword, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ ok: true });
});

// Zmaž používateľa
router.delete('/:id', (req, res) => {
    if (req.params.id == req.user.id) return res.status(400).json({ error: 'Nemôžete zmazať sami seba!' });
    run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
});

module.exports = router;
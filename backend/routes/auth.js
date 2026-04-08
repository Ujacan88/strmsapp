'use strict';
const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode    = require('qrcode');
const { queryOne, run } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const TRUSTED_DEVICE_DAYS = 5;
const TRUSTED_DEVICE_MS   = TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;

const cookieName = (userId) => `td_${userId}`;

const SET_TRUSTED_DEVICE_COOKIE = (res, userId) => {
    const token = jwt.sign({ id: userId, trusted: true }, JWT_SECRET, { expiresIn: `${TRUSTED_DEVICE_DAYS}d` });
    res.cookie(cookieName(userId), token, {
        httpOnly: true,
        secure: false,  // HTTP server - secure:true funguje len na HTTPS
        maxAge: TRUSTED_DEVICE_MS,
        sameSite: 'lax',
        path: '/',
    });
};

const CLEAR_TRUSTED_DEVICE_COOKIE = (res, userId) => {
    res.clearCookie(cookieName(userId), { path: '/' });
};

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vyplňte prihlasovacie údaje' });

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Nesprávne meno alebo heslo' });
    }

    const userCookie = req.cookies[cookieName(user.id)];
    if (userCookie) {
        try {
            const decoded = jwt.verify(userCookie, JWT_SECRET);
            if (decoded.id === user.id && decoded.trusted) {
                SET_TRUSTED_DEVICE_COOKIE(res, user.id);
                const payload = { id: user.id, username: user.username, role: user.role, store: user.store };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
                return res.json({ complete: true, token, user: payload });
            }
        } catch (e) {
            CLEAR_TRUSTED_DEVICE_COOKIE(res, user.id);
        }
    }

    const tempToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '5m' });

    if (!user.mfa_enabled) {
        const secret = speakeasy.generateSecret({ name: `STORMS (${user.username})` });
        run('UPDATE users SET mfa_secret = ? WHERE id = ?', [secret.base32, user.id]);
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        return res.json({ complete: false, requireSetup: true, tempToken, qrImage: qrCodeUrl });
    }

    res.json({ complete: false, requireSetup: false, tempToken });
});

router.post('/verify-2fa', (req, res) => {
    const { tempToken, totp_code, rememberMe } = req.body;
    if (!tempToken || !totp_code) return res.status(400).json({ error: 'Chýbajúce údaje' });

    try {
        const decoded = jwt.verify(tempToken, JWT_SECRET);
        const user = queryOne('SELECT * FROM users WHERE id = ?', [decoded.id]);

        const verified = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: totp_code.replace(/\s+/g, '')
        });

        if (!verified) return res.status(401).json({ error: 'Nesprávny kód' });

        if (!user.mfa_enabled) run('UPDATE users SET mfa_enabled = 1 WHERE id = ?', [user.id]);
        if (rememberMe) SET_TRUSTED_DEVICE_COOKIE(res, user.id);

        const payload = { id: user.id, username: user.username, role: user.role, store: user.store };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        res.json({ complete: true, token, user: payload });
    } catch (e) {
        res.status(401).json({ error: 'Platnosť relácie vypršala.' });
    }
});

router.get('/me', authenticate, (req, res) => res.json(req.user));
module.exports = router;
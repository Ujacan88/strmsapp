'use strict';
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { initDb } = require('./db');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Railway proxy
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// Static frontend
const FRONTEND = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(FRONTEND));

initDb().then(() => {
  app.use('/api/auth',      require('./routes/auth'));
  app.use('/api/zakazky',   require('./routes/zakazky'));
  app.use('/api/servis',    require('./routes/servis'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/export',    require('./routes/export'));
  app.use('/api/import',    require('./routes/import'));
  app.use('/api/users',     require('./routes/users'));
  app.use('/api/profil',    require('./routes/profil'));
  app.use('/api/fotky',     require('./routes/fotky'));

  app.get('/api/health', (_, res) => res.json({ ok: true }));
  app.get('*', (_, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

  app.use((err, req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  app.listen(PORT, () => console.log(`\n⚡ STORMS beží → http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('Chyba pri štarte DB:', err);
  process.exit(1);
});
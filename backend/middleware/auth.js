const jwt = require('jsonwebtoken');

// Tajný kľúč na šifrovanie
const JWT_SECRET = process.env.JWT_SECRET || 'storms_secret_key_2025'; 

// 1. Overenie, či je človek vôbec prihlásený
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Chýba token' });
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Platnosť prihlásenia vypršala' });
  }
}

// 2. TVRDÝ FILTER NA ZOBRAZENIE DÁT (Čítanie)
function storeWhere(req) {
  // Majiteľ a Admin vidia absolútne všetko (žiadny filter na pozadí)
  if (['owner', 'admin'].includes(req.user.role)) {
    return { sql: null, params: [] };
  }
  
  // Ak pobočka (store) nemá priradený žiadny obchod, poistka aby nič nevidela
  if (!req.user.store) {
    return { sql: '1=0', params: [] }; 
  }

  // Rozdelíme zoznam obchodov (napr. "Obchod KE,Obchod SL" -> ['Obchod KE', 'Obchod SL'])
  const stores = req.user.store.split(',');
  
  // Vytvoríme otázniky pre SQL podľa počtu obchodov (napr. "?, ?")
  const placeholders = stores.map(() => '?').join(',');
  
  return { sql: `obchod IN (${placeholders})`, params: stores };
}

// 3. OCHRANA ZÁPISU A MAZANIA
function canWrite(req, obchod) {
  // Majiteľ a Admin môžu upravovať a mazať hocičo
  if (['owner', 'admin'].includes(req.user.role)) return true;
  
  // Pobočka môže upravovať len zákazky/servisy, ktoré patria do zoznamu jej obchodov
  if (!req.user.store) return false;
  const stores = req.user.store.split(',');
  
  return stores.includes(obchod);
}

module.exports = { authenticate, storeWhere, canWrite, JWT_SECRET };
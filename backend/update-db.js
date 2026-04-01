const { initDb, run } = require('./db');

async function update() {
    await initDb(); 
    try {
        run('ALTER TABLE users ADD COLUMN mfa_secret TEXT;');
        run('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0;');
        console.log('✅ Databáza úspešne aktualizovaná!');
    } catch (e) {
        console.log('Stĺpce už existujú alebo chyba:', e.message);
    }
    process.exit(0);
}
update();
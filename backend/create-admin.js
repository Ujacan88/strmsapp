const bcrypt = require('bcryptjs');
const { initDb, run, queryOne } = require('./db');

async function forceAdmin() {
    await initDb(); 
    
    try {
        const myUsername = 'adm.herstekandrej';
        const myPassword = 'Herstek0208?!';
        
        // Zašifrujeme tvoje nové heslo
        const hash = bcrypt.hashSync(myPassword, 10);
        
        // Zistíme, či náhodou takýto používateľ už neexistuje
        const exist = queryOne("SELECT id FROM users WHERE username = ?", [myUsername]);
        
        if (exist) {
            // Účet existuje - zmeníme heslo, nastavíme rolu Majiteľa a zrušíme 2FA
            run("UPDATE users SET password = ?, role = 'owner', mfa_enabled = 0, mfa_secret = NULL WHERE username = ?", [hash, myUsername]);
            console.log('✅ Existujúce konto bolo úspešne VYRESETOVANÉ!');
        } else {
            // Účet neexistuje - vytvoríme ho
            run("INSERT INTO users (username, password, role, store) VALUES (?, ?, 'owner', NULL)", [myUsername, hash]);
            console.log('✅ Nové konto bolo úspešne VYTVORENÉ!');
        }
        
        console.log('➡️ Prihlasovacie meno: adm.herstekandrej');
        console.log('➡️ Heslo: Herstek0208?!');
        
    } catch (e) {
        console.log('❌ Nastala chyba:', e.message);
    }
    
    // Malá pauza pre Windows, aby nevypísalo tú škaredú chybu
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

forceAdmin();
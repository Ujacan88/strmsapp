const bcrypt = require('bcryptjs');
const { initDb, run, queryOne } = require('./db');

async function forceAdmin() {
    await initDb();

    try {
        const myUsername = 'adm.herstekmatej';
        const myPassword = 'Stormsadmin103';

        const hash = bcrypt.hashSync(myPassword, 10);
        const exist = queryOne("SELECT id FROM users WHERE username = ?", [myUsername]);

        if (exist) {
            run("UPDATE users SET password = ?, role = 'admin', mfa_enabled = 0, mfa_secret = NULL WHERE username = ?", [hash, myUsername]);
            console.log('✅ Existujúce konto bolo úspešne VYRESETOVANÉ!');
        } else {
            run("INSERT INTO users (username, password, role, store) VALUES (?, ?, 'admin', NULL)", [myUsername, hash]);
            console.log('✅ Nové konto bolo úspešne VYTVORENÉ!');
        }

        console.log('➡️  Prihlasovacie meno: adm.herstekmatej');
        console.log('➡️  Heslo: Stormsadmin103');

    } catch (e) {
        console.log('❌ Nastala chyba:', e.message);
    }

    setTimeout(() => { process.exit(0); }, 500);
}

forceAdmin();
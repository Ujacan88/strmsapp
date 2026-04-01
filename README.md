# STORMS — Obchodný systém

## Rýchly štart (localhost)

```bash
cd backend
npm install
node server.js
# → http://localhost:3000
```

Alebo cez Docker:
```bash
docker compose up -d
# → http://localhost
```

---

## Prihlasovacie údaje

| Používateľ          | Heslo       | Rola             |
|---------------------|-------------|------------------|
| majitel             | storms2025  | Konateľ          |
| veduci_ke           | ke2025      | Pobočka KE       |
| veduci_sl           | sl2025      | Pobočka SL       |
| veduci_ba           | ba2025      | Pobočka BA       |
| veduci_cz           | cz2025      | Pobočka CZ       |
| veduci_vo           | vo2025      | V.O.             |

---

## Nasadenie na cloud server (VPS / Railway / Render)

### Možnosť A — Docker Compose na VPS (odporúčané)

**Požiadavky:** Ubuntu 20.04+, Docker, Docker Compose

```bash
# 1. Nahraj projekt na server (napr. cez scp alebo git)
scp -r STORMS-APP-FIXED/ user@server:/opt/storms/

# 2. Choď do priečinka
cd /opt/storms

# 3. Vytvor .env
cp .env.example .env
# Uprav .env — nastav silný JWT_SECRET:
openssl rand -hex 32   # → skopíruj výsledok do .env ako JWT_SECRET

# 4. Vytvor adresáre pre dáta
mkdir -p data backups

# 5. Spusti produkciu
docker compose -f docker-compose.prod.yml up -d --build

# Aplikácia beží na porte 80
```

**Logy:**
```bash
docker compose -f docker-compose.prod.yml logs -f
```

**Záloha DB:**
```bash
docker compose -f docker-compose.prod.yml exec backup /bin/sh /backup.sh
```

---

### Možnosť B — bez Dockeru (priamo Node.js)

**Požiadavky:** Node.js 18+, nginx

```bash
# 1. Nainštaluj závislosti
cd backend
npm install --production

# 2. Nastav environment
export JWT_SECRET="tvoj_dlhy_nahodny_string"
export PORT=3000
export NODE_ENV=production
export DB_PATH=/opt/storms/data/storms.db

# 3. Spusti server
node server.js

# 4. Nginx config — skopíruj nginx.conf ako:
# /etc/nginx/sites-available/storms
# a uprav server_name na tvoju doménu
```

**Systemd service** (auto-reštart):
```ini
# /etc/systemd/system/storms.service
[Unit]
Description=STORMS Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/storms/backend
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=JWT_SECRET=tvoj_jwt_secret
Environment=DB_PATH=/opt/storms/data/storms.db
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable storms
systemctl start storms
```

---

### Možnosť C — Railway.app (najjednoduchšie)

1. Vytvor účet na [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo** (nahraj projekt na GitHub)
3. Nastav premenné prostredia:
   - `JWT_SECRET` = dlhý náhodný string
   - `PORT` = 3000
   - `NODE_ENV` = production
4. Root directory: `backend`
5. Start command: `node server.js`
6. Frontend nasaď zvlášť cez **Netlify** alebo **Vercel** (len `frontend/public` priečinok)
   - Nastav environment variable `API_URL` na URL Railway backendu

---

## Import z Excelu

Podporované stĺpce (názvy sa detekujú automaticky, diakritika sa ignoruje):

**Zákazky:**
`ID zákazky` · `Obchod` · `Zákazník` · `Dátum dopytu` · `Dátum obhliadky` · `Dátum ponuky` · `Dátum objednávky` · `Stav zákazky` · `Typ produktu` · `Typ riešenia` · `Model / Značka` · `Zdroj leadu` · `Výsledok obhliadky` · `Cena krb/pec` · `Nákup krb/pec` · `Cena komín` · `Nákup komín` · `Cena montáž` · `Náklad montáž` · `Cena príslušenstvo` · `Nákup príslušenstvo` · `Doprava faktur.` · `Náklad doprava` · `Zľava %` · `Poznámka`

**Servis:**
`ID servisu` · `Obchod` · `Zákazník` · `Dátum` · `Technik` · `Typ zásahu` · `Záruka` · `Fakturované €` · `Náklad €` · `Čas (hod.)` · `Poznámka`

**Tip:** Exportuj existujúce dáta → uprav v Exceli → importuj späť. Záznamy s rovnakým ID sa aktualizujú.

---

## Zálohovanie

DB súbor: `data/storms.db` (pri Docker deploymente) alebo cesta z `DB_PATH`

Manuálna záloha:
```bash
cp data/storms.db backups/storms_$(date +%Y%m%d).db
```

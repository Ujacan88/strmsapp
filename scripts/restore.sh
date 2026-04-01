#!/bin/sh
# ============================================================
#  STORMS — obnova databázy zo zálohy
#  Použitie: ./scripts/restore.sh [súbor_zálohy.db.gz]
#  Príklad:  ./scripts/restore.sh backups/storms_2025-04-01_03-00.db.gz
# ============================================================

BACKUP_FILE="$1"
DATA_DIR="./data"
DB_FILE="${DATA_DIR}/storms.db"

if [ -z "$BACKUP_FILE" ]; then
    echo ""
    echo "Dostupné zálohy:"
    ls -lht ./backups/storms_*.db.gz 2>/dev/null | head -20
    echo ""
    echo "Použitie: $0 <súbor_zálohy.db.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "CHYBA: Súbor nenájdený: $BACKUP_FILE"
    exit 1
fi

echo ""
echo "=== OBNOVA DATABÁZY ==="
echo "Záloha: $BACKUP_FILE"
echo "Cieľ:   $DB_FILE"
echo ""
printf "Naozaj chcete obnoviť databázu? Aktuálne dáta budú PREPÍSANÉ! [ano/nie]: "
read CONFIRM

if [ "$CONFIRM" != "ano" ]; then
    echo "Obnova zrušená."
    exit 0
fi

# Zastav aplikáciu
echo "Zastavujem kontajnery..."
docker compose stop backend

# Záloha aktuálnej DB pred obnovou
SAFETY="${DB_FILE}.before_restore_$(date +%Y%m%d_%H%M).bak"
cp "$DB_FILE" "$SAFETY" 2>/dev/null && echo "Bezpečnostná záloha: $SAFETY"

# Obnov
gunzip -c "$BACKUP_FILE" > "$DB_FILE"

if [ $? -eq 0 ]; then
    echo "OK: Databáza obnovená."
    docker compose start backend
    echo "Aplikácia spustená."
else
    echo "CHYBA: Obnova zlyhala. Obnova pôvodnej DB..."
    cp "$SAFETY" "$DB_FILE"
    docker compose start backend
    exit 1
fi

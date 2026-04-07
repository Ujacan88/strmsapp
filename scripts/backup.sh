#!/bin/sh
# ============================================================
#  STORMS — automatická záloha databázy
#  Spúšťa sa každý deň o 03:00 cez crond
# ============================================================

DB_FILE="/data/storms.db"
BACKUP_DIR="/backups"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_FILE="${BACKUP_DIR}/storms_${DATE}.db.gz"

# Skontroluj či existuje DB
if [ ! -f "$DB_FILE" ]; then
    echo "[$(date)] CHYBA: DB súbor nenájdený: $DB_FILE"
    exit 1
fi

# Vytvor zálohu (gzip kompresia ~85-90% úspora priestoru)
gzip -c "$DB_FILE" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] OK: Záloha vytvorená → $BACKUP_FILE ($SIZE)"
else
    echo "[$(date)] CHYBA: Zlyhalo vytvorenie zálohy"
    exit 1
fi

# Vymaž zálohy staršie ako KEEP_DAYS dní
DELETED=$(find "$BACKUP_DIR" -name "storms_*.db.gz" -mtime +${KEEP_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt "0" ]; then
    echo "[$(date)] Vymazaných starých záloh: $DELETED (limit: ${KEEP_DAYS} dní)"
fi

# Vypíš aktuálny stav záloh
COUNT=$(find "$BACKUP_DIR" -name "storms_*.db.gz" | wc -l)
TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "[$(date)] Celkom záloh: $COUNT | Celková veľkosť: $TOTAL"

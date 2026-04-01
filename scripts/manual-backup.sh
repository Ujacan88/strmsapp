#!/bin/sh
# ============================================================
#  STORMS — manuálna záloha (spustiť kedykoľvek)
#  Použitie: ./scripts/manual-backup.sh
# ============================================================
DATE=$(date +%Y-%m-%d_%H-%M)
mkdir -p ./backups
gzip -c ./data/storms.db > "./backups/storms_MANUAL_${DATE}.db.gz"
SIZE=$(du -h "./backups/storms_MANUAL_${DATE}.db.gz" | cut -f1)
echo "OK: Manuálna záloha: backups/storms_MANUAL_${DATE}.db.gz ($SIZE)"

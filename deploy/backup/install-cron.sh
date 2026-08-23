#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${1:-/projects/jurisponto}"
SCRIPT="$PROJECT_DIR/deploy/backup/backup-to-drive.sh"
[[ -x "$SCRIPT" ]] || { echo "Torne o script executável primeiro: chmod 700 $SCRIPT" >&2; exit 1; }

cron_line="17 3 * * * $SCRIPT >> /var/log/jurisponto-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -Fv "$SCRIPT"; echo "$cron_line") | crontab -
echo "Cron instalado: backup diário às 03:17 UTC."

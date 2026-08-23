#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${BACKUP_CONFIG_FILE:-/etc/jurisponto/backup.env}"
LOCK_FILE="/var/lock/jurisponto-backup.lock"

[[ -r "$CONFIG_FILE" ]] || { echo "Arquivo de configuração ausente: $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"

for command in mysqldump rclone tar flock; do command -v "$command" >/dev/null || { echo "Comando obrigatório ausente: $command" >&2; exit 1; }; done
for variable in MYSQL_HOST MYSQL_PORT MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD BACKUP_RCLONE_REMOTE UPLOADS_DIR BACKUP_LOCAL_DIR; do
  [[ -n "${!variable:-}" ]] || { echo "Variável obrigatória ausente: $variable" >&2; exit 1; }
done
[[ -d "$UPLOADS_DIR" ]] || { echo "Diretório de documentos ausente: $UPLOADS_DIR" >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Outro backup já está em execução." >&2; exit 1; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_LOCAL_DIR"
work_dir="$(mktemp -d "${BACKUP_LOCAL_DIR%/}/work.XXXXXX")"
archive_name="jurisponto-${timestamp}.tar.gz"
archive_path="$work_dir/$archive_name"
mysql_defaults="$work_dir/mysql.cnf"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

mkdir -p "$work_dir/content/uploads"
cat >"$mysql_defaults" <<EOF
[client]
host=$MYSQL_HOST
port=$MYSQL_PORT
user=$MYSQL_USER
password=$MYSQL_PASSWORD
EOF
chmod 600 "$mysql_defaults"

echo "[$(date -Is)] Gerando dump do banco..."
mysqldump --defaults-extra-file="$mysql_defaults" --single-transaction --skip-lock-tables --quick --hex-blob "$MYSQL_DATABASE" >"$work_dir/content/database.sql"

echo "[$(date -Is)] Empacotando documentos..."
tar -C "$UPLOADS_DIR" -cf - . | tar -C "$work_dir/content/uploads" -xf -
tar -C "$work_dir/content" -czf "$archive_path" database.sql uploads

remote_path="daily/$timestamp/$archive_name"
echo "[$(date -Is)] Enviando backup criptografado..."
rclone copyto "$archive_path" "${BACKUP_RCLONE_REMOTE%/}/$remote_path" --retries 3 --low-level-retries 10
mkdir -p "$work_dir/verify"
cp "$archive_path" "$work_dir/verify/$archive_name"
rclone cryptcheck "$work_dir/verify" "${BACKUP_RCLONE_REMOTE%/}/daily/$timestamp" --one-way >/dev/null

if [[ "$(date -u +%d)" == "01" ]]; then
  monthly_path="monthly/$(date -u +%Y-%m)/$archive_name"
  rclone copyto "$archive_path" "${BACKUP_RCLONE_REMOTE%/}/$monthly_path" --retries 3 --low-level-retries 10
fi

rclone delete "${BACKUP_RCLONE_REMOTE%/}/daily" --min-age "${RETENTION_DAYS:-30}d"
rclone rmdirs "${BACKUP_RCLONE_REMOTE%/}/daily" --leave-root
rclone delete "${BACKUP_RCLONE_REMOTE%/}/monthly" --min-age "$(( ${MONTHLY_RETENTION_MONTHS:-12} * 31 ))d"
rclone rmdirs "${BACKUP_RCLONE_REMOTE%/}/monthly" --leave-root
echo "[$(date -Is)] Backup concluído e verificado: $remote_path"

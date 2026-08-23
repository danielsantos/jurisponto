#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${BACKUP_CONFIG_FILE:-/etc/jurisponto/backup.env}"
[[ -r "$CONFIG_FILE" ]] || { echo "Arquivo de configuração ausente: $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
for command in rclone tar mysql mktemp; do command -v "$command" >/dev/null || { echo "Comando obrigatório ausente: $command" >&2; exit 1; }; done
for variable in BACKUP_RCLONE_REMOTE BACKUP_LOCAL_DIR RESTORE_TEST_DATABASE MYSQL_ADMIN_HOST MYSQL_ADMIN_PORT MYSQL_ADMIN_USER MYSQL_ADMIN_PASSWORD; do
  [[ -n "${!variable:-}" ]] || { echo "Variável obrigatória ausente: $variable" >&2; exit 1; }
done
[[ "$RESTORE_TEST_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nome inválido para RESTORE_TEST_DATABASE" >&2; exit 1; }

latest="$(rclone lsf "${BACKUP_RCLONE_REMOTE%/}/daily" --recursive --files-only | sort | tail -n 1)"
[[ -n "$latest" ]] || { echo "Nenhum backup diário foi encontrado no destino remoto." >&2; exit 1; }
mkdir -p "$BACKUP_LOCAL_DIR"
work_dir="$(mktemp -d "${BACKUP_LOCAL_DIR%/}/restore.XXXXXX")"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT
archive_path="$work_dir/backup.tar.gz"

echo "[$(date -Is)] Baixando e descriptografando: $latest"
rclone copyto "${BACKUP_RCLONE_REMOTE%/}/daily/$latest" "$archive_path"
tar -xzf "$archive_path" -C "$work_dir"
[[ -s "$work_dir/database.sql" && -d "$work_dir/uploads" ]] || { echo "Arquivo de backup inválido." >&2; exit 1; }

admin=(mysql -h "$MYSQL_ADMIN_HOST" -P "$MYSQL_ADMIN_PORT" -u "$MYSQL_ADMIN_USER")
export MYSQL_PWD="$MYSQL_ADMIN_PASSWORD"
echo "[$(date -Is)] Restaurando em banco temporário: $RESTORE_TEST_DATABASE"
"${admin[@]}" -e "DROP DATABASE IF EXISTS \`$RESTORE_TEST_DATABASE\`; CREATE DATABASE \`$RESTORE_TEST_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
"${admin[@]}" "$RESTORE_TEST_DATABASE" <"$work_dir/database.sql"
table_count="$("${admin[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$RESTORE_TEST_DATABASE';")"
[[ "$table_count" -gt 0 ]] || { echo "Restauração não criou tabelas." >&2; exit 1; }
document_count="$(find "$work_dir/uploads" -type f | wc -l)"
echo "[$(date -Is)] Restauração validada: $table_count tabelas e $document_count arquivos recuperados."
"${admin[@]}" -e "DROP DATABASE \`$RESTORE_TEST_DATABASE\`;"
unset MYSQL_PWD

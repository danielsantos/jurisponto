# Backup remoto no Google Drive

Este procedimento protege banco MySQL e documentos contra perda total do VPS. Ele usa `rclone crypt`: o conteúdo e os nomes são criptografados no VPS antes do upload. O Drive receberá somente arquivos ilegíveis sem a configuração/segredos do rclone. [Documentação do rclone crypt](https://rclone.org/crypt/)

## 1. Preparar a conta Google

Use a nova conta Google apenas para backup, ative verificação em duas etapas e guarde os códigos de recuperação fora do VPS. Não compartilhe a pasta de backup.

## 2. Instalar e configurar o rclone no VPS

Instale o `rclone` pelo método adequado ao sistema e execute `rclone config` como o mesmo usuário que executará o cron (neste VPS, `root`). Crie:

1. Um remote `jurisponto_drive` do tipo `drive`, autorizando a conta Google no fluxo OAuth.
2. Um remote `jurisponto_crypt` do tipo `crypt`, apontando para `jurisponto_drive:jurisponto-backups`.
3. Escolha `standard` para criptografar nomes de arquivos, `true` para diretórios e gere senhas aleatórias para a senha e o salt.
4. Defina senha para o arquivo de configuração do rclone e guarde, fora do VPS, as duas senhas do crypt e uma cópia segura de `~/.config/rclone/rclone.conf`.

Valide sem expor dados:

```bash
rclone lsd jurisponto_crypt:
```

## 3. Criar o usuário de backup do MySQL

No MySQL, crie um usuário somente leitura para o dump. Não reutilize as credenciais da aplicação nem o usuário root:

```sql
CREATE USER 'rotadocaso_backup'@'localhost' IDENTIFIED BY 'uma-senha-longa-e-única';
GRANT SELECT, SHOW VIEW, TRIGGER ON rotadocaso.* TO 'rotadocaso_backup'@'localhost';
FLUSH PRIVILEGES;
```

Use essas credenciais em `/etc/jurisponto/backup.env`.

## 4. Configurar e executar

```bash
mkdir -p /etc/jurisponto /var/backups/jurisponto
cp deploy/backup/backup.env.example /etc/jurisponto/backup.env
chmod 600 /etc/jurisponto/backup.env
nano /etc/jurisponto/backup.env
chmod 700 deploy/backup/*.sh
deploy/backup/backup-to-drive.sh
```

O script guarda 30 backups diários e 12 mensais, por padrão. Ele usa `copyto`, não `sync`, para que uma exclusão local não seja replicada ao destino.

## 5. Testar restauração antes de confiar no backup

Preencha as credenciais administrativas temporariamente necessárias no arquivo de configuração e execute:

```bash
deploy/backup/test-restore.sh
```

O script baixa o backup mais recente, valida a extração, importa o dump em `jurisponto_restore_test`, verifica se existem tabelas e então apaga somente esse banco temporário. Execute mensalmente e guarde o resultado no log operacional.

## 6. Agendar

```bash
deploy/backup/install-cron.sh /projects/jurisponto
crontab -l
```

Verifique periodicamente `/var/log/jurisponto-backup.log`. Uma falha de backup deve ser tratada como incidente operacional.

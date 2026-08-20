# Publicacao no VPS

Este projeto deve deixar a aplicacao Node na porta local `127.0.0.1:3000` e
usar o Nginx para atender o dominio na porta publica `80`. Assim, varios sites
podem compartilhar o mesmo endereco IP e a porta 80: o Nginx escolhe o destino
por `server_name`.

## 1. DNS

No provedor do dominio, crie ou confirme estes registros A apontando para o IP
publico do VPS:

| Host | Destino |
| --- | --- |
| `@` | IP publico do VPS |
| `www` | IP publico do VPS |

O dominio precisa resolver para o VPS antes de habilitar o virtual host. A tela
atual indica que o DNS ja chega ao VPS, mas ainda esta sendo atendido pela
configuracao do outro site.

## 2. Aplicacao e banco

No VPS, na pasta do projeto:

```bash
cp deploy/.env.production.example .env.production
nano .env.production
```

Preencha `DATABASE_URL` com um usuario MySQL exclusivo do sistema e gere um
`AUTH_SECRET` forte, por exemplo com `openssl rand -hex 32`. Em producao use a
URL publica real em `APP_URL` e mantenha `TRUST_PROXY=1`. Como a aplicacao
roda em container, `127.0.0.1` apontaria para o proprio container, e nao para o
MySQL do VPS. Para um MySQL instalado no host, use `host.docker.internal` e
configure o MySQL para aceitar conexoes somente da rede Docker; para banco
gerenciado, use o hostname do provedor.

Crie o banco e o usuario (substitua os valores entre aspas):

```sql
CREATE DATABASE rotadocaso CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rotadocaso'@'localhost' IDENTIFIED BY 'UMA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON rotadocaso.* TO 'rotadocaso'@'localhost';
FLUSH PRIVILEGES;
```

Depois, suba a aplicacao e aplique somente as migrations:

```bash
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml exec app npm run migrate
docker compose -f docker-compose.production.yml ps
```

Nao execute `npm run seed:demo` no ambiente real.

## 3. Nginx na porta 80

Copie o virtual host fornecido e habilite-o:

```bash
sudo cp deploy/nginx/rotadocaso.com.br.conf /etc/nginx/sites-available/rotadocaso.com.br
sudo ln -s /etc/nginx/sites-available/rotadocaso.com.br /etc/nginx/sites-enabled/rotadocaso.com.br
sudo nginx -t
sudo systemctl reload nginx
```

Se o dominio estiver listado na configuracao do outro site, remova **apenas**
`rotadocaso.com.br` e `www.rotadocaso.com.br` daquele `server_name`; nao deixe
o mesmo dominio em dois blocos Nginx. O site anterior pode continuar atendendo
o seu proprio dominio normalmente. Caso ele seja somente o `default_server`, o
novo bloco acima passa a atender Rota do Caso assim que o Nginx for recarregado.

## 4. Verificacao

No VPS, confirme primeiro a aplicacao e depois o roteamento por dominio:

```bash
curl -I http://127.0.0.1:3000/
curl -I -H 'Host: rotadocaso.com.br' http://127.0.0.1/
curl -I http://rotadocaso.com.br/
```

Se os dois primeiros funcionarem e o ultimo nao, verifique o DNS e o firewall
do provedor/VPS para liberar TCP 80.

## HTTPS (recomendado antes de uso real)

Assim que o HTTP estiver respondendo corretamente, instale o certificado:

```bash
sudo certbot --nginx -d rotadocaso.com.br -d www.rotadocaso.com.br
```

O Certbot atualiza o Nginx para usar 443 e normalmente redireciona a porta 80
para HTTPS. Depois disso, altere `APP_URL` para `https://rotadocaso.com.br` e
recrie o container:

```bash
docker compose -f docker-compose.production.yml up -d --force-recreate app
```

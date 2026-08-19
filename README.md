# Rota do Caso

Portal para escritorios juridicos organizarem casos, coleta de documentos e comunicacao simples com clientes.

## Stack inicial

- Frontend: HTML, CSS e JavaScript servidos pelo Express.
- API: Node.js + Express.
- Banco de dados: MySQL 8.
- Ambiente local: Docker Compose.

## Como executar localmente

1. Instale [Node.js LTS](https://nodejs.org/) e Docker Desktop.
2. Crie o arquivo de ambiente: copie `.env.example` para `.env`.
3. Inicie o MySQL: `docker compose up -d db`.
4. Instale as dependencias: `npm install`.
5. Aplique as atualizacoes do banco: `npm run migrate`.
6. Se quiser dados de demonstracao, carregue o seed opcional: `npm run seed:demo`.
7. Inicie a aplicacao: `npm run dev`.
8. Acesse `http://localhost:3000`.

O bootstrap do banco agora segue este padrao:

- Schema somente em migrations versionadas dentro de `db/migrations`.
- Dados de demonstracao somente em seeds opcionais dentro de `db/seeds`.
- Ambientes reais nao carregam dados fake automaticamente.

Para reiniciar completamente o banco de desenvolvimento, execute `docker compose down -v`, depois `docker compose up -d db`, `npm run migrate` e, se quiser a massa de exemplo, `npm run seed:demo`.

### Conexao no VPS

No servidor, nao execute o conteiner `db` se o MySQL ja estiver instalado. Defina `DATABASE_URL` com as credenciais do seu servidor, por exemplo: `mysql://usuario:senha@127.0.0.1:3306/rotadocaso`. Antes de iniciar a aplicacao, crie o banco `rotadocaso`, crie um usuario com acesso somente a esse banco e execute apenas `npm run migrate`. Nao rode `npm run seed:demo` em ambiente real.

## O que ja esta conectado ao banco

- Listagem de casos e progresso de documentos.
- Documentos pendentes.
- Criacao de casos e clientes.
- Registro de envio de lembrete.
- Isolamento de clientes, casos e documentos por escritorio.
- Perfis e permissoes por tipo de usuario.

## Rotas da interface

- `/`: site institucional da Rota do Caso, com apresentacao, periodo de teste de 14 dias e cadastro real de escritorio/usuario.
- `/app`: painel do escritorio.

O cadastro cria um escritorio e um usuario administrador com senha protegida por hash no MySQL. Antes do primeiro login, o usuario confirma o e-mail com um codigo de seis digitos valido por 15 minutos. A recuperacao de senha usa o mesmo padrao e invalida sessoes anteriores quando a senha e alterada. Com `EMAIL_PROVIDER=development`, os codigos aparecem na propria tela e no terminal; a integracao com Resend ja esta preparada pelas variaveis de ambiente.

Cada conta pertence a um escritorio. Clientes sao vinculados ao escritorio e toda consulta de casos, documentos e lembretes e filtrada pelo escritorio do usuario autenticado. O sistema diferencia os perfis `admin`, `lawyer`, `assistant` e `client`; clientes enxergam apenas os proprios casos e documentos. Administradores podem criar novos acessos pelo painel.

## Observabilidade operacional

O backend agora registra erros em formato estruturado JSON, sempre com contexto minimo de `requestId`, metodo HTTP, rota, `officeId` e `userId` quando disponiveis. As respostas de erro para o cliente continuam sem stack trace.

Defina o destino dos logs pelo ambiente:

- `LOG_DESTINATION=console`: envia JSON para stdout/stderr, ideal para desenvolvimento e containers.
- `LOG_DESTINATION=file`: grava em `LOG_FILE_PATH` (padrao `./logs/app.log`), preparando o projeto para plugar um coletor externo depois.

## Auditoria de documentos

Cada evento relevante de documento agora gera trilha em `document_audit_logs`, cobrindo criacao de solicitacao, alteracoes operacionais e download de arquivo. A auditoria registra quem executou a acao, quando ocorreu, qual foi a acao, `requestId`, IP e `user-agent`, alem de metadados uteis do evento.

## Testes da v1

Para a v1, a cobertura automatizada foi priorizada nos riscos mais sensiveis de backend: autenticacao baseada em sessao, permissoes e escopo por escritorio. A suite usa o runner nativo do Node, sem dependencia extra.

- Execute com `npm test`.
- Os testes atuais validam contrato de erro da API, leitura do token de sessao, matriz de permissoes e isolamento de escopo para clientes versus equipe.

## Proximas etapas de produto

Antes de uso real com dados juridicos, implemente armazenamento privado de arquivos, trilha de auditoria, backups, LGPD, convites por e-mail com provedor real e portal dedicado para cliente.

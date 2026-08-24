# Rota do Caso

## Versao publicada

Antes de cada publicacao, atualize `release.js` (numero da versao, data, identificacao do build e notas). Depois de subir os arquivos no VPS, abra `/versao`: a pagina consulta `GET /api/version` sem cache e mostra a entrega que o servidor esta executando.

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
- E-mail de solicitacao, lembrete e reenvio de documento, com link seguro de uso unico para upload.
- Isolamento de clientes, casos e documentos por escritorio.
- Perfis e permissoes por tipo de usuario.

## Rotas da interface

- `/`: site institucional da Rota do Caso, com apresentacao, periodo de teste de 14 dias e cadastro real de escritorio/usuario.
- `/app`: painel do escritorio.

O cadastro cria um escritorio e um usuario administrador com senha protegida por hash no MySQL. Antes do primeiro login, o usuario confirma o e-mail com um codigo de seis digitos valido por 15 minutos. A recuperacao de senha usa o mesmo padrao e invalida sessoes anteriores quando a senha e alterada. Com `EMAIL_PROVIDER=development`, os codigos aparecem na propria tela e no terminal; a integracao com Resend ja esta preparada pelas variaveis de ambiente.

Cada conta pertence a um escritorio. Clientes sao vinculados ao escritorio e toda consulta de casos, documentos e lembretes e filtrada pelo escritorio do usuario autenticado. O sistema diferencia os perfis `admin`, `lawyer`, `assistant` e `client`; clientes enxergam apenas os proprios casos e documentos. Administradores podem criar novos acessos pelo painel.

## Envio seguro de documentos

Ao solicitar um documento, aplicar um checklist, enviar um lembrete ou pedir reenvio, o sistema usa o e-mail cadastrado no cliente para enviar um link individual de upload. O link vale por 7 dias, pode enviar somente aquele documento e deixa de funcionar logo após o envio. Por isso, o cliente nao precisa ter uma conta no portal para enviar o arquivo.

Os arquivos enviados nao sao publicados como arquivos estaticos. O download acontece exclusivamente por `/api/documents/:id/download`, que exige sessao autenticada, valida o escopo do escritorio (e do proprio cliente, quando aplicavel) e registra o evento na auditoria.

Os uploads aceitam somente PDF, PNG, JPG, DOC e DOCX de ate 10 MB. Alem do tipo declarado pelo navegador, o servidor verifica extensao e assinatura do arquivo. Quando um documento e substituido, a versao anterior e removida do disco depois que a nova versao e gravada com sucesso.

Para enviar e-mails reais, configure um dominio e defina `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` e `APP_URL` no ambiente de producao. Enquanto `EMAIL_PROVIDER=development`, a mensagem e o link sao exibidos apenas no log do servidor.

Todo novo cadastro de conta envia um aviso para `NEW_USER_NOTIFICATION_EMAIL` (por padrão, `danielsantosr.rj@gmail.com`). Para que o aviso chegue à caixa de e-mail, mantenha `EMAIL_PROVIDER=resend` configurado no VPS.

## Observabilidade operacional

O backend agora registra erros em formato estruturado JSON, sempre com contexto minimo de `requestId`, metodo HTTP, rota, `officeId` e `userId` quando disponiveis. As respostas de erro para o cliente continuam sem stack trace.

Defina o destino dos logs pelo ambiente:

- `LOG_DESTINATION=console`: envia JSON para stdout/stderr, ideal para desenvolvimento e containers.
- `LOG_DESTINATION=file`: grava em `LOG_FILE_PATH` (padrao `./logs/app.log`), preparando o projeto para plugar um coletor externo depois.

## Protecoes da aplicacao

As rotas de cadastro, login, confirmacao de e-mail e recuperacao de senha possuem limite por IP para conter tentativas automatizadas. Em producao atras de um unico proxy reverso confiavel, defina `TRUST_PROXY=1` para que o Express use o IP real do visitante. As respostas tambem enviam cabecalhos para evitar inclusao em iframes, interpretacao indevida de tipos de arquivo e cache de respostas da API.

## Privacidade e LGPD

- O cadastro requer aceite dos Termos de Uso e da Politica de Privacidade, versionado com data, IP e agente de usuário.
- As páginas públicas são `/termos`, `/privacidade` e `/privacidade/solicitacoes`.
- Defina `PRIVACY_CONTACT_EMAIL` para receber aviso de novas solicitações; sem essa variável, elas continuam registradas no banco e são reportadas no log.
- Administradores podem baixar uma exportação JSON do escritório e registrar pedido de exclusão em Configurações > Privacidade e dados.
- O procedimento operacional de atendimento, retenção e incidentes está em `docs/PRIVACY_OPERATIONS.md`. Os textos e prazos precisam de validação jurídica antes da divulgação pública.

## Auditoria de documentos

Cada evento relevante de documento agora gera trilha em `document_audit_logs`, cobrindo criacao de solicitacao, alteracoes operacionais e download de arquivo. A auditoria registra quem executou a acao, quando ocorreu, qual foi a acao, `requestId`, IP e `user-agent`, alem de metadados uteis do evento.

## Testes automatizados

Para a v1, a cobertura automatizada foi priorizada nos riscos mais sensiveis de backend: autenticacao baseada em sessao, permissoes e escopo por escritorio. A suite usa o runner nativo do Node, sem dependencia extra.

- Execute os testes rápidos de unidade com `npm test`.
- Para os fluxos críticos reais, inicie um MySQL descartável exclusivo com `npm run test:integration:db` e execute `npm run test:integration`. Esse comando aplica as migrations no banco da porta 3307 e testa cadastro, confirmação de e-mail, login, recuperação de senha, revogação de sessão, isolamento entre escritórios, upload/download autenticado de documento e financeiro.
- A suíte de integração nunca usa o banco de desenvolvimento: ela lê somente `.env.test` e remove, ao finalizar, apenas os dados criados com o prefixo `Teste integracao`.

## Proximas etapas de produto

Antes de uso real com dados juridicos, implemente armazenamento privado de arquivos, trilha de auditoria, backups, LGPD, convites por e-mail com provedor real e portal dedicado para cliente.

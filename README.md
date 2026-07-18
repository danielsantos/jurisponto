# JurisPonto

Portal para escritórios jurídicos organizarem casos, coleta de documentos e comunicação simples com clientes.

## Stack inicial

- Frontend: HTML, CSS e JavaScript servidos pelo Express.
- API: Node.js + Express.
- Banco de dados: MySQL 8.
- Ambiente local: Docker Compose.

## Como executar localmente

1. Instale [Node.js LTS](https://nodejs.org/) e Docker Desktop.
2. Crie o arquivo de ambiente: copie `.env.example` para `.env`.
3. Inicie o MySQL: `docker compose up -d db`.
4. Instale as dependências: `npm install`.
5. Inicie a aplicação: `npm run dev`.
6. Acesse `http://localhost:3000`.

Na primeira criação do banco, o arquivo `db/init.sql` cria tabelas e dados de demonstração. Para reiniciar completamente o banco de desenvolvimento, execute `docker compose down -v` e depois `docker compose up -d db`.

### Conexão no VPS

No servidor, não execute o contêiner `db` se o MySQL já estiver instalado. Defina `DATABASE_URL` com as credenciais do seu servidor, por exemplo: `mysql://usuario:senha@127.0.0.1:3306/jurisponto`. Antes de iniciar a aplicação, crie o banco `jurisponto`, crie um usuário com acesso somente a esse banco e execute `db/init.sql` uma única vez.

## O que já está conectado ao banco

- Listagem de casos e progresso de documentos.
- Documentos pendentes.
- Criação de casos e clientes.
- Registro de envio de lembrete.

## Rotas da interface

- `/`: site institucional do JurisPonto, com apresentação, período de teste de 14 dias e formulários de cadastro e login.
- `/app`: painel do escritório.

Os formulários da home estão prontos na interface; a autenticação com contas reais será a próxima etapa da API.

## Próximas etapas de produto

Antes de uso real com dados jurídicos, implemente autenticação, isolamento por escritório, permissões de cliente/equipe, armazenamento privado de arquivos, trilha de auditoria, backups e requisitos da LGPD.

# Rotinar

Aplicação web progressiva para organizar rotinas e hábitos, desenvolvida como TCC. A experiência prioriza previsibilidade, decomposição de tarefas, personalização e feedback de progresso para pessoas com TDAH e/ou TEA.

## Estrutura

```text
apps/
	api/          API REST em Fastify e TypeScript
	web/          PWA React, TypeScript e Vite
packages/
	contracts/    Tipos compartilhados entre aplicações
```

## Requisitos locais

- Node.js 22 ou superior
- npm 10 ou superior
- Docker Desktop, para executar o PostgreSQL local

## Início rápido

```bash
npm install
Copy-Item .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev:api
```

Em outro terminal:

```bash
npm run dev:web
```

A API responde em `http://localhost:3333/health` e a aplicação web abre em `http://localhost:5173`.

## Comandos

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:up
npm run db:down
npm run db:migrate
npm run db:seed
```

## Funcionalidades do MVP

1. Cadastro e login, com proteção dos dados por usuário.
2. Rotinas, tarefas, subtarefas e conclusão de cada passo.
3. Hábitos com check-in diário.
4. Modo Foco, texto ampliado, suporte a movimento reduzido e shell PWA offline.

## Banco local

Se o banco local foi criado previamente com credenciais diferentes, recrie somente o volume de desenvolvimento antes de iniciar: `docker compose down -v`, seguido de `npm run db:up` e `npm run db:migrate`.


## Publicação

A aplicação é publicada em três serviços: Neon para PostgreSQL, Render para a API e Vercel para a interface. As URLs e segredos de produção devem ser configurados somente nos painéis dos provedores, nunca no arquivo `.env` enviado ao repositório.

### Neon (banco de dados)

1. Crie um projeto e um banco PostgreSQL no Neon.
2. Copie a URL pooled para `DATABASE_URL`, usada pela API em execução.
3. Copie a URL direta para `DIRECT_URL`, usada pelo Prisma para migrations.

### Render (API)

1. Faça o push do repositório e crie um Blueprint no Render usando `render.yaml`.
2. No serviço `rotinar-api`, informe as variáveis solicitadas pelo Blueprint:
	- `DATABASE_URL`: URL pooled do Neon.
	- `DIRECT_URL`: URL direta do Neon.
	- `WEB_ORIGIN`: URL de produção completa da Vercel, por exemplo `https://rotinar.vercel.app`.
3. O Render gera `JWT_SECRET`, executa `prisma migrate deploy` no build e inicia a API automaticamente.
4. Confirme a publicação em `https://<sua-api>.onrender.com/health`.

### Vercel (interface)

1. Importe o mesmo repositório na Vercel.
2. Defina `apps/web` como **Root Directory**.
3. Use `npm run build` como Build Command e `dist` como Output Directory.
4. Crie a variável `VITE_API_URL` com a URL pública completa da API Render, por exemplo `https://rotinar-api.onrender.com`.
5. Faça o deploy e copie a URL final para `WEB_ORIGIN` no Render. Depois, faça um novo deploy da API.

O frontend usa token `Bearer` para suas chamadas à API. Os cookies da API são `HttpOnly` e tornam-se `Secure` automaticamente quando `NODE_ENV=production`.

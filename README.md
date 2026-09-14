# Rotinapp

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


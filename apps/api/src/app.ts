import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';

import { authRoutes } from './auth/routes.js';
import { JWT_SECRET } from './config/auth.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: JWT_SECRET,
  });

  await app.register(authRoutes);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
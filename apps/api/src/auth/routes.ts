import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcryptPkg from 'bcryptjs';
import { z } from 'zod';

const bcrypt = ((bcryptPkg as unknown as { default?: typeof bcryptPkg }).default ?? bcryptPkg);

import { COOKIE_NAME, JWT_EXPIRES_IN } from '../config/auth.js';
import { prisma } from '../lib/prisma.js';
import { createUserSchema, loginSchema } from '../utils/validation.js';

const routineSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(40).optional(),
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  scheduledTime: z.string().trim().max(20).optional(),
});

const subtaskSchema = z.object({
  title: z.string().trim().min(2).max(120),
});

const habitSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  frequency: z.enum(['daily', 'weekdays', 'weekly']).default('daily'),
});

async function getAuthenticatedUser(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const rawAuthorization = request.headers.authorization;

  if (!rawAuthorization || !rawAuthorization.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'MISSING_TOKEN', message: 'Sessão inválida.' });
    return null;
  }

  try {
    const token = rawAuthorization.slice('Bearer '.length);
    const decoded = app.jwt.verify(token) as { sub: string; email: string; name: string };
    return { id: decoded.sub, name: decoded.name, email: decoded.email };
  } catch {
    reply.code(401).send({ error: 'INVALID_TOKEN', message: 'Sessão inválida.' });
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_INPUT',
        message: 'Dados de cadastro inválidos.',
      });
    }

    const { name, email, password } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.code(409).send({
        error: 'USER_ALREADY_EXISTS',
        message: 'Já existe um usuário com este e-mail.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    });

    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
    }, { expiresIn: JWT_EXPIRES_IN });

    reply.setCookie(COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });

    return { user: { id: user.id, name: user.name, email: user.email }, token: accessToken };
  });

  app.get('/routines', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const routines = await prisma.routine.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        tasks: {
          orderBy: { position: 'asc' },
          include: {
            subtasks: { orderBy: { position: 'asc' } },
          },
        },
      },
    });

    return { routines };
  });

  app.post('/routines', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const parsed = routineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_INPUT',
        message: 'Dados da rotina inválidos.',
      });
    }

    const routine = await prisma.routine.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        icon: parsed.data.icon ?? 'sparkles',
      },
    });

    return reply.code(201).send({ routine });
  });

  app.post('/routines/:routineId/tasks', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { routineId } = request.params as { routineId: string };
    const routine = await prisma.routine.findUnique({ where: { id: routineId } });

    if (!routine || routine.userId !== user.id) {
      return reply.code(404).send({ error: 'ROUTINE_NOT_FOUND', message: 'Rotina não encontrada.' });
    }

    const parsed = taskSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Dados da tarefa inválidos.' });
    }

    const task = await prisma.task.create({
      data: {
        routineId,
        title: parsed.data.title,
        description: parsed.data.description,
        scheduledTime: parsed.data.scheduledTime,
      },
    });

    return reply.code(201).send({ task });
  });

  app.patch('/tasks/:taskId/completion', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { taskId } = request.params as { taskId: string };
    const parsed = z.object({ isCompleted: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Progresso inválido.' });

    const task = await prisma.task.findUnique({ include: { routine: true }, where: { id: taskId } });
    if (!task || task.routine.userId !== user.id) {
      return reply.code(404).send({ error: 'TASK_NOT_FOUND', message: 'Tarefa não encontrada.' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { isCompleted: parsed.data.isCompleted, completedAt: parsed.data.isCompleted ? new Date() : null },
      include: { subtasks: { orderBy: { position: 'asc' } } },
    });
    return { task: updatedTask };
  });

  app.post('/tasks/:taskId/subtasks', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { taskId } = request.params as { taskId: string };
    const parsed = subtaskSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Dados da subtarefa inválidos.' });

    const task = await prisma.task.findUnique({ include: { routine: true }, where: { id: taskId } });
    if (!task || task.routine.userId !== user.id) {
      return reply.code(404).send({ error: 'TASK_NOT_FOUND', message: 'Tarefa não encontrada.' });
    }

    const subtask = await prisma.subtask.create({
      data: { taskId, title: parsed.data.title, position: task.position + 1 },
    });
    return reply.code(201).send({ subtask });
  });

  app.patch('/subtasks/:subtaskId/completion', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { subtaskId } = request.params as { subtaskId: string };
    const parsed = z.object({ isCompleted: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Progresso inválido.' });

    const subtask = await prisma.subtask.findUnique({ include: { task: { include: { routine: true } } }, where: { id: subtaskId } });
    if (!subtask || subtask.task.routine.userId !== user.id) {
      return reply.code(404).send({ error: 'SUBTASK_NOT_FOUND', message: 'Subtarefa não encontrada.' });
    }

    const updatedSubtask = await prisma.subtask.update({
      where: { id: subtaskId },
      data: { isCompleted: parsed.data.isCompleted, completedAt: parsed.data.isCompleted ? new Date() : null },
    });
    return { subtask: updatedSubtask };
  });

  app.get('/habits', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const date = new Date().toISOString().slice(0, 10);
    const habits = await prisma.habit.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { entries: { where: { date } } },
    });
    return { habits: habits.map(({ entries, ...habit }) => ({ ...habit, isCompletedToday: entries.length > 0 })) };
  });

  app.post('/habits', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const parsed = habitSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Dados do hábito inválidos.' });

    const habit = await prisma.habit.create({ data: { userId: user.id, ...parsed.data } });
    return reply.code(201).send({ habit: { ...habit, isCompletedToday: false } });
  });

  app.put('/habits/:habitId/entries/today', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { habitId } = request.params as { habitId: string };
    const habit = await prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit || habit.userId !== user.id) {
      return reply.code(404).send({ error: 'HABIT_NOT_FOUND', message: 'Hábito não encontrado.' });
    }

    const date = new Date().toISOString().slice(0, 10);
    await prisma.habitEntry.upsert({
      where: { habitId_date: { habitId, date } },
      update: {},
      create: { habitId, date },
    });
    return reply.code(204).send();
  });

  app.delete('/habits/:habitId/entries/today', async (request, reply) => {
    const user = await getAuthenticatedUser(app, request, reply);
    if (!user) return;

    const { habitId } = request.params as { habitId: string };
    const habit = await prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit || habit.userId !== user.id) {
      return reply.code(404).send({ error: 'HABIT_NOT_FOUND', message: 'Hábito não encontrado.' });
    }

    const date = new Date().toISOString().slice(0, 10);
    await prisma.habitEntry.deleteMany({ where: { habitId, date } });
    return reply.code(204).send();
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_INPUT',
        message: 'Credenciais inválidas.',
      });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }

    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
    }, { expiresIn: JWT_EXPIRES_IN });

    reply.setCookie(COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: accessToken,
    };
  });

  app.get('/me', {
    preValidation: async (request: FastifyRequest, reply) => {
      const payload = await getAuthenticatedUser(app, request, reply);
      if (!payload) return;

      request.user = payload;
    },
  }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: 'Sessão inválida.' });
    }

    return { user };
  });
}

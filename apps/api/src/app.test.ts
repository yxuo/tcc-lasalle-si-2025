import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('reports that the API is available', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('auth flow', () => {
  it('registers a user and returns an access token', async () => {
    const email = `teste-${crypto.randomUUID()}@rotinapp.dev`;
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        name: 'Aluno Teste',
        email,
        password: '12345678',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: { email },
    });
    expect(response.json().token).toBeTruthy();
  });

  it('creates a routine for the authenticated user', async () => {
    const email = `rotina-${crypto.randomUUID()}@rotinapp.dev`;
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        name: 'Rotineiro',
        email,
        password: '12345678',
      },
    });

    const { token } = registerResponse.json();

    const response = await app.inject({
      method: 'POST',
      url: '/routines',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Manhã',
        description: 'Preparação da manhã',
        icon: 'sunrise',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      routine: {
        name: 'Manhã',
      },
    });
  });

  it('tracks task, subtask and habit progress for the user', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        name: 'Progresso',
        email: `progresso-${crypto.randomUUID()}@rotinapp.dev`,
        password: '12345678',
      },
    });
    const { token } = registerResponse.json();
    const headers = { authorization: `Bearer ${token}` };

    const routineResponse = await app.inject({
      method: 'POST',
      url: '/routines',
      headers,
      payload: { name: 'Estudos' },
    });
    const { routine } = routineResponse.json();

    const taskResponse = await app.inject({
      method: 'POST',
      url: `/routines/${routine.id}/tasks`,
      headers,
      payload: { title: 'Ler o capítulo' },
    });
    const { task } = taskResponse.json();

    const subtaskResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/subtasks`,
      headers,
      payload: { title: 'Separar o material' },
    });
    const { subtask } = subtaskResponse.json();

    const completedTask = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/completion`,
      headers,
      payload: { isCompleted: true },
    });
    const completedSubtask = await app.inject({
      method: 'PATCH',
      url: `/subtasks/${subtask.id}/completion`,
      headers,
      payload: { isCompleted: true },
    });
    expect(completedTask.json().task.isCompleted).toBe(true);
    expect(completedSubtask.json().subtask.isCompleted).toBe(true);

    const habitResponse = await app.inject({
      method: 'POST',
      url: '/habits',
      headers,
      payload: { title: 'Beber água', frequency: 'daily' },
    });
    const { habit } = habitResponse.json();
    const checkIn = await app.inject({ method: 'PUT', url: `/habits/${habit.id}/entries/today`, headers });
    const habits = await app.inject({ method: 'GET', url: '/habits', headers });

    expect(checkIn.statusCode).toBe(204);
    expect(habits.json().habits).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: habit.id, isCompletedToday: true }),
    ]));
  });
});
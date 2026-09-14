import '../src/config/env.js';

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('12345678', 12);

  const user = await prisma.user.upsert({
    where: { email: 'aluno@rotinaclara.dev' },
    update: {},
    create: {
      name: 'Aluno Teste',
      email: 'aluno@rotinaclara.dev',
      passwordHash,
    },
  });

  const routine = await prisma.routine.upsert({
    where: {
      id: 'demo-routine-id',
    },
    update: {},
    create: {
      id: 'demo-routine-id',
      userId: user.id,
      name: 'Manhã',
      description: 'Preparação da manhã com passos simples.',
      icon: 'sunrise',
      isActive: true,
    },
  });

  const task = await prisma.task.upsert({
    where: { id: 'demo-task-id' },
    update: {},
    create: {
      id: 'demo-task-id',
      routineId: routine.id,
      title: 'Escovar os dentes',
      description: 'Tomar água e começar o dia.',
      scheduledTime: '07:30',
      position: 1,
      isCompleted: false,
    },
  });

  await prisma.subtask.upsert({
    where: { id: 'demo-subtask-id' },
    update: {},
    create: {
      id: 'demo-subtask-id',
      taskId: task.id,
      title: 'Pegar a escova',
      position: 1,
      isCompleted: false,
    },
  });

  await prisma.habit.upsert({
    where: { id: 'demo-habit-id' },
    update: {},
    create: {
      id: 'demo-habit-id',
      userId: user.id,
      title: 'Beber água',
      description: 'Tomar um copo de água ao acordar.',
      frequency: 'daily',
      isActive: true,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

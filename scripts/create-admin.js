const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'vipdaichienthucung@gmail.com';
  const plainPassword = 'Nemark007#';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      role: 'ADMIN', 
    },
    create: {
      email,
      passwordHash: hashedPassword,
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  console.log('User created successfully:', user.email, 'Role:', user.role);
}

main()
  .catch((e) => {
    console.error('Error creating user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const username = process.env.INIT_ADMIN_USERNAME
  const password = process.env.INIT_ADMIN_PASSWORD
  const name = process.env.INIT_ADMIN_NAME || '管理员'

  if (!username || !password) {
    console.log('Seed skipped. No default accounts are created.')
    return
  }

  const { PrismaClient } = await import('@prisma/client')
  const bcrypt = await import('bcryptjs')
  const prisma = new PrismaClient()

  try {
    await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash: await bcrypt.hash(password, 10),
        name,
        role: 'admin',
        status: 'active',
      },
      create: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        name,
        role: 'admin',
        status: 'active',
      },
    })

    console.log(`Seed completed. Admin account initialized: ${username}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

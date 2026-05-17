import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { AppModule } from './app.module'

function resolveAdminDistDir(configuredValue?: string) {
  const candidates = [
    configuredValue,
    'apps/admin/dist',
    '../admin/dist',
    '../../apps/admin/dist',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const absolutePath = resolve(process.cwd(), candidate)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return resolve(process.cwd(), configuredValue || 'apps/admin/dist')
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const configService = app.get(ConfigService)
  const uploadDir = resolve(process.cwd(), configService.get('UPLOAD_DIR', 'uploads'))
  const adminDistDir = resolveAdminDistDir(configService.get('ADMIN_DIST_DIR'))

  app.setGlobalPrefix('api')
  app.enableCors()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
  })

  if (existsSync(adminDistDir)) {
    const express = app.getHttpAdapter().getInstance()
    const adminIndexFile = resolve(adminDistDir, 'index.html')

    app.useStaticAssets(adminDistDir)
    express.get('/', (_req, res) => {
      res.sendFile(adminIndexFile)
    })
    express.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next()
        return
      }
      res.sendFile(adminIndexFile)
    })
  }

  await app.listen(configService.get('PORT', 3000))
}

bootstrap()

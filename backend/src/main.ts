import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  const config = app.get(ConfigService)

  // Baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
  // etc.) — nginx sits in front but the app shouldn't rely on that alone.
  app.use(helmet())

  // Every route is served under /api/v1 — the frontend's NUXT_PUBLIC_API_BASE_URL
  // already includes this prefix (e.g. https://api.evakuators.am/api/v1), so
  // repositories keep calling plain paths like "/tow-trucks".
  app.setGlobalPrefix('api/v1')

  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigins'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  app.enableShutdownHooks()

  await app.listen(config.getOrThrow<number>('port'))
}

void bootstrap()

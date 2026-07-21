import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  const config = app.get(ConfigService)

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

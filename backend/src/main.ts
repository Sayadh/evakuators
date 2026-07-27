import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  // Typed as the Express app so `app.set()` (trust proxy, below) is available
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  const config = app.get(ConfigService)

  /**
   * Trust exactly ONE proxy hop — the nginx in front of us (see nginx/*.conf,
   * which sets `X-Forwarded-For $proxy_add_x_forwarded_for`).
   *
   * Without this, Express reports `req.ip` as 127.0.0.1 (nginx's own address)
   * for every request on earth, and since ThrottlerGuard keys its buckets on
   * `req.ip`, **the whole internet shares one rate-limit bucket per route**.
   * That was measurably broken: five failed logins from one client made the
   * next login attempt from a completely different IP return 429. So every
   * @Throttle in this codebase was effectively a global cap, which means a
   * single script could lock every real user out of login, review submission,
   * image upload and analytics tracking. It also made all IP-based logging
   * useless.
   *
   * `1` (not `true`) is the safe value: Express takes the address exactly one
   * hop from the right of the XFF chain, i.e. the one nginx appended itself.
   * A client sending a forged `X-Forwarded-For: 9.9.9.9` just gets it pushed
   * left in the chain and ignored. If a CDN (e.g. Cloudflare) is ever added in
   * front of nginx, this must become `2` — and until it does, that CDN's users
   * would all share nginx's view of one IP again.
   */
  app.set('trust proxy', 1)

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

  /**
   * Bind to the loopback interface by default.
   *
   * The app used to listen on `*:4002`, so on the VPS the API was reachable as
   * `http://<server-ip>:4002/api/v1` — straight past nginx, and therefore past
   * TLS, past the `X-Forwarded-For` header the throttler now depends on, and
   * past any nginx-level limiting. The frontend already binds 127.0.0.1 (see
   * `ecosystem.config.js`'s `HOST`); this makes the backend match.
   *
   * Local development is unaffected (the frontend talks to
   * http://localhost:4002). Override with `HOST=0.0.0.0` only if something
   * genuinely needs to reach the API from another machine without nginx.
   */
  await app.listen(config.getOrThrow<number>('port'), config.getOrThrow<string>('host'))
}

void bootstrap()

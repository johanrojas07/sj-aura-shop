import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import compression from 'compression';
import { json, urlencoded } from 'body-parser';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

export async function setAppDB(app: NestExpressApplication): Promise<void> {
  app.use(compression());
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb' }));
  app.use(cookieParser());

  const originEnv = (process.env.ORIGIN || '').trim();
  const allowOrigins =
    originEnv.length > 0
      ? originEnv
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:4200', 'http://127.0.0.1:3000', 'http://127.0.0.1:4200'];
  const isRender = process.env.RENDER === 'true' || (process.env.RENDER || '') === '1';
  if (!originEnv && (isRender || process.env.VERCEL === '1' || process.env.VERCEL)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[CORS] ORIGIN no está definido. Con el front (p. ej. Firebase) y el API en otro dominio (p. ej. Render), añade ORIGIN con la URL de la tienda (https://….web.app).',
    );
  }
  const normalizePublicOrigin = (s: string) => s.trim().replace(/\/$/, '').toLowerCase();
  const allowNorm = allowOrigins.map((o) => normalizePublicOrigin(o));
  const localHostRe = /^https?:\/\/(localhost|127\.0.0\.1)(:\d+)?$/i;
  app.use(
    cors({
      credentials: true,
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) {
          return callback(null, true);
        }
        const n = normalizePublicOrigin(requestOrigin);
        if (localHostRe.test(n) || allowNorm.includes(n)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    }),
  );

  /**
   * Front (p. ej. Firebase) y API en Render u otro host: dominios distintos → `SameSite=None; Secure` y
   * el cliente envía cookies con `withCredentials: true`. En Render, con `ORIGIN` apuntando a la tienda, activamos esto.
   * `VERCEL` mantiene el mismo criterio si aún usas un despliegue en Vercel.
   */
  const isCrossSite =
    !!process.env.VERCEL ||
    process.env.CROSS_SITE_COOKIES === '1' ||
    (isRender && originEnv.length > 0);

  const sessionCookie = {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: Boolean(isCrossSite || process.env.COOKIE_SECURE === '1'),
    sameSite: (isCrossSite ? 'none' : 'lax') as 'none' | 'lax' | 'strict',
  };
  const redisUrl = (process.env.REDIS_URL || '').trim();
  let store: session.Store | undefined;
  if (redisUrl) {
    const client = createClient({ url: redisUrl });
    client.on('error', (err) =>
      new Logger('SJ AURA').error(`[Redis] sesión: ${err instanceof Error ? err.message : String(err)}`),
    );
    try {
      await client.connect();
      store = new RedisStore({ client, prefix: 'aura-sess:' });
    } catch (e) {
      new Logger('SJ AURA').error(
        `[Redis] no se pudo conectar: ${e instanceof Error ? e.message : String(e)}. La sesión usará memoria (no adecuado con varias instancias).`,
      );
    }
  }

  app.use(
    session({
      store,
      cookie: sessionCookie,
      secret: process.env.COOKIE_KEY || 'dev-cookie-secret-change-me',
      resave: false,
      saveUninitialized: true,
    }),
  );

  new Logger('SJ AURA').log(
    `CORS: orígenes en lista (${allowOrigins.length}): ${allowOrigins.join(', ')}. Sesión cross-site: ${
      isCrossSite ? 'Sí (SameSite=none + Secure si aplica)' : 'No (modo Lax/localhost).'
    } COOKIE_KEY: ${(process.env.COOKIE_KEY || '').trim() ? 'definida' : 'falta (revisar en producción).'
    } Store: ${store ? 'Redis' : 'memoria (p. ej. con REDIS_URL + Key Value en Render)'}.
    `,
  );
}

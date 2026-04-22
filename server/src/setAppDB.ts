import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import compression from 'compression';
import { json, urlencoded } from 'body-parser';

export const setAppDB = (app: NestExpressApplication): void => {
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
  if ((process.env.VERCEL === '1' || process.env.VERCEL) && !originEnv) {
    // eslint-disable-next-line no-console
    console.warn(
      '[CORS] ORIGIN no está definido. Las peticiones desde el front (p. ej. Firebase) se bloquean en el navegador. En Vercel, define ORIGIN con la URL de tu app (p. ej. https://ecommerce-….web.app).',
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

  /** Vercel (API) + Firebase/otro origen = cookies entre sitios; o define CROSS_SITE_COOKIES=1 en el servidor. */
  const isCrossSite = process.env.VERCEL === '1' || process.env.CROSS_SITE_COOKIES === '1';
  app.use(
    session({
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        /* Front (Firebase) y API (Vercel) en dominios distintos: SameSite none + Secure. */
        secure: isCrossSite || process.env.COOKIE_SECURE === '1',
        sameSite: (isCrossSite ? 'none' : 'lax') as 'none' | 'lax' | 'strict',
      },
      secret: process.env.COOKIE_KEY || 'dev-cookie-secret-change-me',
      resave: false,
      /** true: la cookie de sesión se guarda desde la primera petición (p. ej. GET /api/cart), evitando carrito “nuevo” en cada visita. */
      saveUninitialized: true,
    }),
  );

  new Logger('SJ AURA').log(
    `CORS: orígenes en lista (${allowOrigins.length}): ${allowOrigins.join(', ')}. Sesión cross-site: ${
      isCrossSite ? 'Sí (SameSite=none + Secure si aplica)' : 'No (modo Lax/localhost).'
    } COOKIE_KEY: ${(process.env.COOKIE_KEY || '').trim() ? 'definida' : 'falta (revisar en producción).'
    }`,
  );
};

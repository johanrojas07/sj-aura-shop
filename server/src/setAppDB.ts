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
  app.use(
    cors({
      credentials: true,
      origin: allowOrigins,
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
};

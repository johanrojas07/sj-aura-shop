import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setAppDB } from './setAppDB';
import { logStartupBanner, logFirebaseYFirestoreTrasInit } from './startup-diagnostics';

let cached: NestExpressApplication | null = null;

/** Arranca Nest (una vez) para `main` o despliegue serverless. En Vercel hace falta `init()` sin `listen()`; en producción el API vive p. ej. en Render. */
export async function createNestServer(): Promise<NestExpressApplication> {
  if (cached) {
    return cached;
  }
  logStartupBanner();

  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isVercel ? (['error', 'warn', 'log'] as const) : undefined,
  });
  await setAppDB(app);
  if (isVercel) {
    await app.init();
  }
  logFirebaseYFirestoreTrasInit(app);
  cached = app;
  return app;
}

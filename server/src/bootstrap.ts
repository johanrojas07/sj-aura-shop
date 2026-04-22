import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setAppDB } from './setAppDB';

let cached: NestExpressApplication | null = null;

/** Arranca Nest (una vez) para `main` o para Vercel. En Vercel hace falta `init()` sin `listen()`. */
export async function createNestServer(): Promise<NestExpressApplication> {
  if (cached) {
    return cached;
  }
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isVercel ? (['error', 'warn', 'log'] as const) : undefined,
  });
  setAppDB(app);
  if (isVercel) {
    await app.init();
  }
  cached = app;
  return app;
}

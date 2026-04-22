/**
 * Vercel serverless → Express de Nest (vía serverless-http).
 * En Vercel, `Build Command` debe compilar el API: `npm run build:server`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const serverless = require('serverless-http') as (app: import('express').Application) => import('http').RequestListener;
// Sin tipos de @nestjs/core aquí: el compilador de Vercel a veces no resuelve INestApplication.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { createNestServer } = require('../server/dist/bootstrap.js') as {
  createNestServer: () => Promise<{
    getHttpAdapter: () => { getInstance: () => import('express').Application };
  }>;
};

type H = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void;

let handlerPromise: Promise<H> | null = null;

function getHandler(): Promise<H> {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const nest = await createNestServer();
      const ex = nest.getHttpAdapter().getInstance();
      return serverless(ex);
    })();
  }
  return handlerPromise;
}

export default async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  const h = await getHandler();
  return h(req, res);
};

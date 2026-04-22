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

/** CORS: coincide con orígenes en `ORIGIN` (Vercel). */
function reflectedOrigin(
  requestOrigin: string | undefined,
): string | null {
  if (!requestOrigin) {
    return null;
  }
  const allowed = (process.env.ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

function setCorsHeaders(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
): void {
  const o = reflectedOrigin(
    Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin,
  );
  if (o) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Type,lang,Accept,Accept-Language',
  );
}

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
  /* Preflight sin levantar Nest: evita timeout en 1.ª carga mientras congela el cold start. */
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    res.end();
    return;
  }
  setCorsHeaders(req, res);
  const h = await getHandler();
  return h(req, res);
};

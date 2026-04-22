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

function normalizePublicOrigin(s: string): string {
  return s.trim().replace(/\/$/, '').toLowerCase();
}

const localOriginRe = /^https?:\/\/(localhost|127\.0.0\.1)(:\d+)?$/i;

/**
 * CORS: coincide con `ORIGIN` en Vercel (misma lógica que en `setAppDB`).
 * Puedes añadir .web.app y .firebaseapp.com separados por comas.
 */
function reflectedOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) {
    return null;
  }
  const nReq = normalizePublicOrigin(requestOrigin);
  if (localOriginRe.test(nReq)) {
    return requestOrigin;
  }
  const allowed = (process.env.ORIGIN || '')
    .split(',')
    .map((o) => normalizePublicOrigin(o))
    .filter(Boolean);
  if (allowed.length === 0) {
    return null;
  }
  if (allowed.includes(nReq)) {
    return requestOrigin;
  }
  return null;
}

function setCorsHeaders(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
): void {
  const rawOrigin = (
    Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
  ) as string | undefined;
  const o = reflectedOrigin(rawOrigin);
  if (o) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  const reqHead = req.headers['access-control-request-headers'];
  const rch = typeof reqHead === 'string' ? reqHead : Array.isArray(reqHead) ? reqHead[0] : '';
  if (rch) {
    res.setHeader('Access-Control-Allow-Headers', rch);
  } else {
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,lang,Accept,Accept-Language,X-Requested-With',
    );
  }
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

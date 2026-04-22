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

/**
 * Log seguro: no vuelques secretos (FIREBASE_SERVICE_ACCOUNT, COOKIE_KEY, claves). Los orígenes son URL públicas.
 */
function logVercelBootState(): void {
  const originRaw = (process.env.ORIGIN || '').trim();
  const origins = originRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const fsa = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  // eslint-disable-next-line no-console
  console.log(
    '[sj-aura:api] boot env',
    JSON.stringify({
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
      node: process.version,
      origin: {
        set: origins.length > 0,
        count: origins.length,
        list: origins,
      },
      firebase: {
        FIREBASE_SERVICE_ACCOUNT: {
          set: fsa.trim().length > 0,
          length: fsa.length,
          /** comprueba que parece JSON, sin mostrarlo */
          looksJson: fsa.trim().startsWith('{') && fsa.trim().endsWith('}'),
        },
        GOOGLE_APPLICATION_CREDENTIALS: {
          set: Boolean((process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()),
        },
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
        FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID || null,
      },
      COOKIE_KEY: { set: Boolean((process.env.COOKIE_KEY || '').trim()) },
    }),
  );
}

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

function pathFromRequest(req: import('http').IncomingMessage): string {
  const u = req.url || '/';
  return (u.split('?')[0] || '/').split('#')[0] || '/';
}

function isFaviconGet(req: import('http').IncomingMessage): boolean {
  if (req.method !== 'GET') {
    return false;
  }
  const p = pathFromRequest(req);
  return p === '/favicon.ico' || p === '/favicon.png' || p.endsWith('/favicon.ico');
}

/** Responde sin levantar Nest: útil para comprobar en Vercel que el *runtime* y `api/index` viven. */
function isLivenessGet(req: import('http').IncomingMessage): boolean {
  if (req.method !== 'GET') {
    return false;
  }
  const p = pathFromRequest(req);
  if (p === '/api/health' || p === '/health' || p.endsWith('/api/health')) {
    return true;
  }
  if (p === '/api/ping' || p.endsWith('/api/ping')) {
    return true;
  }
  return false;
}

function getHandler(): Promise<H> {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const t0 = Date.now();
      const nest = await createNestServer();
      if (process.env.VERCEL === '1' || process.env.VERCEL) {
        // eslint-disable-next-line no-console
        console.log('[sj-aura:api] createNestServer ok, ms', Date.now() - t0);
      }
      const ex = nest.getHttpAdapter().getInstance();
      return serverless(ex);
    })();
  }
  return handlerPromise;
}

if (process.env.VERCEL === '1' || process.env.VERCEL) {
  logVercelBootState();
  getHandler().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[sj-aura:api] createNestServer / serverless init failed:', err);
  });
}

export default async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  if (process.env.SJ_AURA_LOG_REQUESTS === '1' && (process.env.VERCEL || process.env.VERCEL === '1')) {
    const ro = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) as
      | string
      | undefined;
    // eslint-disable-next-line no-console
    console.log(
      '[sj-aura:api] request',
      JSON.stringify({
        method: req.method,
        url: req.url,
        origin: ro ?? null,
        corsOriginOk: ro ? Boolean(reflectedOrigin(ro)) : null,
      }),
    );
  }
  if (isFaviconGet(req)) {
    res.writeHead(204);
    res.end();
    return;
  }
  if (isLivenessGet(req)) {
    if (process.env.VERCEL || process.env.VERCEL === '1') {
      // eslint-disable-next-line no-console
      console.log('[sj-aura:api] liveness 200 (sin Nest) url=' + (req.url || ''));
    }
    setCorsHeaders(req, res);
    if (!res.getHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        name: 'sj-aura-api',
        nest: 'not-loaded',
        where: 'api/index (bypass Nest; solo comprueba Vercel + CORS básico)',
        time: new Date().toISOString(),
        vercelRegion: process.env.VERCEL_REGION || null,
        node: process.version,
      }),
    );
    return;
  }
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

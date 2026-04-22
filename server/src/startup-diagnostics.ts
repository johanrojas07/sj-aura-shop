/* eslint-disable no-console */
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { FirebaseService } from './firebase/firebase.service';

const log = new Logger('SJ AURA');

function detectPlataforma(): string {
  if (process.env.VERCEL === '1' || process.env.VERCEL) {
    return `Vercel (${process.env.VERCEL_ENV || 'n/a'}) región: ${process.env.VERCEL_REGION || 'n/a'}`;
  }
  if (process.env.RENDER) {
    return 'Render';
  }
  return 'local u otro';
}

/**
 * Resumen al arrancar (nunca imprime claves, JSON de cuenta de servicio ni COOKIE).
 */
export function logStartupBanner(): void {
  const origins = (process.env.ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const fsa = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  const safe = {
    plataforma: detectPlataforma(),
    node: process.version,
    NODE_ENV: process.env.NODE_ENV,
    CORS_origins: origins.length ? origins : 'NO_DEFINIDOS (el front de producción fallará por CORS)',
    CROSS_SITE_COOKIES: process.env.CROSS_SITE_COOKIES || '(no set)',
    COOKIE_KEY: (process.env.COOKIE_KEY || '').trim() ? 'definida' : 'NO (riesgo en producción si falta)',
    Firebase: {
      FIREBASE_SERVICE_ACCOUNT: fsa
        ? { set: true, longitud: fsa.length, pareceJson: fsa.startsWith('{') && fsa.endsWith('}') }
        : { set: false },
      GOOGLE_APPLICATION_CREDENTIALS: (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
        ? { set: true, soloNombre: (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').split(/[\\/]/).pop() }
        : { set: false },
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
      FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID || null,
    },
  };

  console.log('========================================================');
  log.log('Inicio de la aplicación (API Nest)');
  console.log('[SJ AURA] Config (sin secretos):', JSON.stringify(safe, null, 2));
  console.log('========================================================');
}

/**
 * Tras `init` / creación, prueba Firestore y escribe resultado (no alarga el timeout de la petición).
 */
export function logFirebaseYFirestoreTrasInit(app: NestExpressApplication): void {
  let firebase: FirebaseService;
  try {
    firebase = app.get(FirebaseService, { strict: false });
  } catch {
    log.error('Firebase: no se pudo resolver FirebaseService; revisa que FirebaseModule esté importado');
    return;
  }

  if (!firebase.isReady()) {
    log.error(
      'Firebase: NO conectado — el SDK no se inicializó. Revisa FIREBASE_SERVICE_ACCOUNT (Vercel/Render) o GAC en local.',
    );
    return;
  }

  log.log('Firebase Admin: SDK listo, comprobando acceso a Firestore…');
  void firebase
    .checkFirestoreConnection()
    .then((r) => {
      if (r.ok) {
        log.log('Firestore: conectado (comprobación OK).');
        console.log('[SJ AURA] Estado: Firebase + Firestore operativos.');
      } else {
        log.warn(`Firestore: el SDK arrancó pero la comprobación falló: ${r.message || 'error desconocido'}`);
        console.warn('[SJ AURA] Estado: revisa reglas, índice y que la base exista en consola.');
      }
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Firestore: error al comprobar: ${msg}`);
    });
}

import { firebaseWebConfig } from './firebase-web.config';

export const environment = {
  production: true,
  /**
   * URL pública del API (Nest en Vercel), sin barra final. Ej.: https://sj-aura-api.vercel.app
   * Debe coincidir con CORS (ORIGIN en Vercel = tu dominio de Firebase + custom).
   * Vacío = mismo origen que el front (solo si el API se sirve junto al front con proxy).
   */
  apiUrl: '',
  prerenderUrl: '',
  /** Sustituir por el dominio de Firebase Hosting (https://…web.app) para JSON-LD y og. */
  siteUrl: '',
  /** Misma app web que en dev (Angular reemplaza este archivo en `ng build --configuration=production`). */
  firebase: firebaseWebConfig,
};

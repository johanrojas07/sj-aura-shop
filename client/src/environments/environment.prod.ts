import { firebaseWebConfig } from './firebase-web.config';

const apiPublic = 'https://sj-aura-api-three.vercel.app';

export const environment = {
  production: true,
  /**
   * API Nest (Vercel), sin barra final. CORS: en Vercel define ORIGIN = URL de esta app en Firebase
   * (misma que `siteUrl` + custom domain si aplica), separado por comas.
   */
  apiUrl: apiPublic,
  /** Para SSR, mismas peticiones al API. */
  prerenderUrl: apiPublic,
  /** URL pública de esta tienda (Firebase Hosting `firebase.json` → site ecommerce-afcfb-db103). */
  siteUrl: 'https://ecommerce-afcfb-db103.web.app',
  /** Misma app web que en dev (Angular reemplaza este archivo en `ng build --configuration=production`). */
  firebase: firebaseWebConfig,
};

import { firebaseWebConfig } from './firebase-web.config';

/**
 * API en Render (Web Service). Tras el deploy, la URL en Render (p. ej. `https://sj-aura-api.onrender.com`) debe
 * coincidir. Si en Render usas otro *service name*, cambia esta constante.
 * CORS: en el panel de Render, variable `ORIGIN` = `siteUrl` (Firebase) + `.web.app` / `firebaseapp.com` si aplica.
 */
const apiPublic = 'https://sj-aura-api.onrender.com';

export const environment = {
  production: true,
  /**
   * API Nest (Render o similar), sin barra final. En Render, `ORIGIN` con la URL pública de esta tienda.
   */
  apiUrl: apiPublic,
  /** Para SSR, mismas peticiones al API. */
  prerenderUrl: apiPublic,
  /** URL pública de esta tienda (Firebase Hosting `firebase.json` → site ecommerce-afcfb-db103). */
  siteUrl: 'https://ecommerce-afcfb-db103.web.app',
  /** Misma app web que en dev (Angular reemplaza este archivo en `ng build --configuration=production`). */
  firebase: firebaseWebConfig,
};

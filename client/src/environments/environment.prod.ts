import { firebaseWebConfig } from './firebase-web.config';

/**
 * API en Render. La URL es `https://<nombre-del-servicio>.onrender.com` (p. ej. `sj-aura-shop` en el panel).
 * CORS: en Render, variable `ORIGIN` = URL de la tienda en Firebase (y dominio custom si aplica).
 */
const apiPublic = 'https://sj-aura-shop.onrender.com';

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

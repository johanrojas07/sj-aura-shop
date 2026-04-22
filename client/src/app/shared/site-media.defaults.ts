/**
 * Marca y rutas locales solo como respaldo (p. ej. JSON-LD antes de cargar el tema).
 * Las imágenes reales del sitio viven en Firebase Storage; las URLs están en Firestore
 * (colección `themes`, documento `default`, y cada `products` → mainImage / images).
 * Poblar Storage + Firestore: `npm run seed:firestore` lee `client/src/assets/img/`
 * (banner `BANNER-ENTERIZOS-DESKTOP.webp` u otros; productos en `img/products/` por orden alfabético) y sube.
 */
/** Nombre de marca (título de página, JSON-LD, cabecera, etc.) */
export const SITE_BRAND_NAME = 'SJ AURA';
/** Lockup de dos líneas en la barra de navegación. */
export const SITE_BRAND_WORDMARK = 'SJ';
export const SITE_BRAND_TAGLINE = 'AURA';

/** Solo fallback de desarrollo; el hero real es `promoSlideBackground` del tema (URL de Storage). */
export const SITE_HERO_BANNER_PATH = '/assets/img/BANNER-ENTERIZOS-DESKTOP.webp';

/** Logo para JSON-LD, Open Graph y favicon (`index.html`). Misma ruta que sube `seed:firestore` si existe `logo.png` local. */
export const SITE_LOGO_PATH = '/assets/img/logo.png';

/** Patrón local opcional antes de cargar Firestore; el seed prioriza `img/products/*` subido a Storage. */
export function siteLocalProductImagePath(index: number): string {
  const n = (Math.abs(Math.floor(index)) % 20) + 1;
  return `/assets/img/product-${String(n).padStart(2, '0')}.jpg`;
}


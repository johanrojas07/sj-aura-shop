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

/**
 * Número de WhatsApp (solo dígitos, con código de país, sin +).
 * Si hace falta más de 7 dígitos para formar un número, el botón no se muestra.
 * Ej. Colombia: 57 + 10 dígitos móviles = 12 dígitos.
 * Sustituye el valor de ejemplo por tu celular con WhatsApp.
 */
export const SITE_WHATSAPP_E164 = '573143133009';

/**
 * Texto opcional al abrir el chat (`wa.me/.../text=...`). Dejar vacío para abrir solo el chat.
 */
export const SITE_WHATSAPP_DEFAULT_TEXT = '';

/** URL de chat de WhatsApp o `null` si no hay número configurado. */
export function siteWhatsAppChatUrl(): string | null {
  const raw = (SITE_WHATSAPP_E164 || '').replace(/\D/g, '');
  if (raw.length < 8) {
    return null;
  }
  const base = `https://wa.me/${raw}`;
  const t = (SITE_WHATSAPP_DEFAULT_TEXT || '').trim();
  if (!t) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(t)}`;
}

/** Enlace al perfil de TikTok (botón flotante en tienda). */
export const SITE_TIKTOK_URL = 'https://www.tiktok.com/@tefasg4';

/** Patrón local opcional antes de cargar Firestore; el seed prioriza `img/products/*` subido a Storage. */
export function siteLocalProductImagePath(index: number): string {
  const n = (Math.abs(Math.floor(index)) % 20) + 1;
  return `/assets/img/product-${String(n).padStart(2, '0')}.jpg`;
}


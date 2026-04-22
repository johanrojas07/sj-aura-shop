/**
 * Datos de aplicación en Cloud Firestore (fuente de verdad en producción).
 *
 * Colecciones:
 * - users: perfil/roles por UID de Firebase Auth (el login va por Auth, no por esta tabla sola).
 * - products, categories: catálogo.
 * - orders: pedidos.
 * - translations: textos UI por idioma (doc id = código, ej. es, en).
 * - pages, themes, config (nombre de colección en Firebase): CMS (páginas, estilos, envíos, active).
 *
 * Fuera de Firestore (secretos / runtime): .env (Stripe, SendGrid, COOKIE_KEY, credencial Admin),
 * Firebase Authentication (cuentas), archivos estáticos del Angular.
 */
export const COL = {
  users: 'users',
  products: 'products',
  categories: 'categories',
  orders: 'orders',
  translations: 'translations',
  pages: 'pages',
  themes: 'themes',
  /** Colección en consola: `config` (singular), alineado al proyecto Firebase Ecommerce. */
  configs: 'config',
} as const;

/**
 * Datos de aplicación en Cloud Firestore (fuente de verdad en producción).
 *
 * Colecciones:
 * - users: perfil/roles por UID de Firebase Auth (el login va por Auth, no por esta tabla sola).
 * - products, categories: catálogo.
 * - orders: pedidos.
 * - translations: textos UI por idioma (doc id = código, ej. es, en).
 * - pages, themes, config (nombre de colección en Firebase): CMS (páginas, estilos, envíos, active).
 * - loyalty_guest_wallets, loyalty_audit_log, loyalty_otp_challenges, loyalty_transactions: fidelización + ledger.
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
  /** Saldo de puntos por teléfono (doc id = HMAC del E.164); se fusiona al crear cuenta con el mismo móvil. */
  loyaltyGuestWallets: 'loyalty_guest_wallets',
  /** Registro append-only de movimientos (acumulación, merge, canje, admin). */
  loyaltyAuditLog: 'loyalty_audit_log',
  /** Retos OTP (verificación de teléfono en pedido, merge, canje invitado). */
  loyaltyOtpChallenges: 'loyalty_otp_challenges',
  /** Ledger de puntos (compra manual, etc.); `customerRef` = user|uid o guest|hash. */
  loyaltyTransactions: 'loyalty_transactions',
} as const;

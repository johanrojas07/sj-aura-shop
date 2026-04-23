/** Idiomas del catálogo y rutas (`/es/…`, `/en/…`). */
export const languages = ['es', 'en'];

/** Moneda tienda: pesos colombianos (COP). */
export const currencyLang = {
  default: 'COP',
  es: 'COP',
  en: 'COP',
};

export const countryLang = {
  default: 'es',
  es: 'es',
  en: 'en',
};

export const accessTokenKey = 'accessToken';

/** Respaldo local de líneas del carrito (id + cantidad) para recuperar sesión invitado. */
export const cartLinesBackupKey = 'aura_cart_lines_v1';

/** Opciones de orden del catálogo (`icon`: Material Icons ligature). */
export const sortOptions: { name: string; id: string; icon: string }[] = [
  { name: 'Newest', id: 'newest', icon: 'new_releases' },
  { name: 'Oldest', id: 'oldest', icon: 'history' },
  { name: 'Price-asc', id: 'priceasc', icon: 'arrow_upward' },
  { name: 'Price-decs', id: 'pricedesc', icon: 'arrow_downward' },
];

export const imageTypes = ['contain', 'cover'];

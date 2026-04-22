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

export const sortOptions = [{
  name: 'Newest',
  id: 'newest',
  },
  {
    name: 'Oldest',
    id: 'oldest',
  },
  {
    name: 'Price-asc',
    id: 'priceasc',
  },
  {
    name: 'Price-decs',
    id: 'pricedesc',
}];

export const imageTypes = ['contain', 'cover'];

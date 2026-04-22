/** Primer idioma = predeterminado en seed y lógica multi-idioma. Solo ES y EN. */
export const languages = ['es', 'en'] as const;

export type AppLang = (typeof languages)[number];

export const countryLang: Record<string, AppLang> = {
  default: 'es',
  es: 'es',
  en: 'en',
};

export const shippingTypes = ['basic', 'extended'];

export const shippingCost: Record<AppLang, { basic: { cost: number; limit: number }; extended: { cost: number; limit: number } }> = {
  es: { basic: { cost: 5, limit: 100 }, extended: { cost: 10, limit: 200 } },
  en: { basic: { cost: 5, limit: 100 }, extended: { cost: 10, limit: 200 } },
};

export const paginationLimit = 24;

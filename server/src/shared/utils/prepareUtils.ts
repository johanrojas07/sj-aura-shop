import { CartModel } from '../../cart/models/cart.model';
import { Product } from '../../products/models/product.model';
import { shippingCost, shippingTypes } from '../constans';

/** Colores en raíz del doc Firestore (`colors: [{ label, hex? }, ...]`). */
function normalizeProductColors(raw: unknown): Product['colors'] {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw === 'string') {
    try {
      return normalizeProductColors(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: NonNullable<Product['colors']> = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') {
      continue;
    }
    const o = c as Record<string, unknown>;
    const label = o.label != null ? String(o.label).trim() : '';
    if (!label) {
      continue;
    }
    const hexRaw = o.hex != null ? String(o.hex).trim() : '';
    out.push({
      label,
      ...(hexRaw ? { hex: hexRaw } : {}),
    });
  }
  return out.length ? out : undefined;
}

function descriptionFullBlocks(loc: Record<string, unknown> | undefined): string[] {
  if (!loc) {
    return [];
  }
  const df = loc.descriptionFull;
  if (Array.isArray(df)) {
    return df.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (typeof df === 'string' && df.trim()) {
    return [df.trim()];
  }
  return [];
}

/** Si la ficha en inglés viene vacía, reutiliza textos y precios del español (catálogo principal). */
function localeWithEsFallback(
  product: Record<string, unknown>,
  lang: string,
): Record<string, unknown> {
  if (lang !== 'en') {
    return (product[lang] || {}) as Record<string, unknown>;
  }
  const es = (product['es'] || {}) as Record<string, unknown>;
  const en = (product['en'] || {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
    if (v == null || v === '') {
      return 0;
    }
    const n = Number(String(v).replace(/\D/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  let descriptionFull = descriptionFullBlocks(en);
  if (!descriptionFull.length) {
    descriptionFull = descriptionFullBlocks(es);
  }
  const saleEn = num(en.salePrice);
  const regEn = num(en.regularPrice);
  const saleEs = num(es.salePrice);
  const regEs = num(es.regularPrice);
  return {
    ...es,
    ...en,
    title: str(en.title) || str(es.title),
    description: str(en.description) || str(es.description),
    descriptionFull,
    salePrice: saleEn > 0 ? saleEn : saleEs,
    regularPrice: regEn > 0 ? regEn : regEs,
    stock: str(en.stock as string) || str(es.stock as string) || 'onStock',
    shipping:
      typeof en.shipping === 'string' && str(en.shipping)
        ? en.shipping
        : typeof es.shipping === 'string' && str(es.shipping)
          ? es.shipping
          : 'basic',
    visibility: typeof en.visibility === 'boolean' ? en.visibility : !!es.visibility,
    onSale: typeof en.onSale === 'boolean' ? en.onSale : !!es.onSale,
  };
}

export const prepareProduct = (
  product,
  lang: string,
  light?: boolean,
): Product => {
  const locRaw = localeWithEsFallback(product as Record<string, unknown>, lang);
  const loc = { ...locRaw } as Record<string, unknown>;
  delete loc.colors;

  const colors = normalizeProductColors(product.colors);

  return {
    _id: product._id,
    titleUrl: product.titleUrl,
    mainImage: product.mainImage,
    images: product.images,
    tags: product.tags,
    _user: product._user,
    dateAdded: product.dateAdded,
    ...{
      ...loc,
      descriptionFull: !light ? (loc.descriptionFull as string[] | undefined) ?? [] : [],
    },
    /** Inventario numérico en el documento (mismo valor en todos los idiomas). */
    stockQty: (product as { stockQty?: number }).stockQty,
    colors,
  };
};

export type PrepareCartOptions = {
  /**
   * Si true (p. ej. GET carrito), no se eliminan líneas aunque el producto no sea vendible en catálogo.
   * Evita que el cliente vea carrito vacío con sesión con ítems y dispare restauración duplicada desde localStorage.
   */
  keepAllSessionLines?: boolean;
};

export const prepareCart = (cart, lang: string, config, opts?: PrepareCartOptions): CartModel => {
  const cartLangItems = cart.items.length
    ? cart.items
        .map((cartItem: any) => {
          const prepareItem = prepareProduct(cartItem.item, lang, true);
          const price: number = prepareItem.salePrice;
          const shipingCostType: string = prepareItem.shipping;
          return {
            item: prepareItem,
            id: cartItem.id,
            qty: cartItem.qty,
            price,
            shipingCostType,
          };
        })
        .filter((cartItem: any) =>
          opts?.keepAllSessionLines ? true : cartItem.item.visibility && cartItem.item.salePrice,
        )
    : [];

  const { totalPrice, totalQty }: { totalPrice: number; totalQty: number } =
    cartLangItems.reduce(
      (prev, item) => ({
        totalPrice: prev.totalPrice + item.price * item.qty,
        totalQty: prev.totalQty + item.qty,
      }),
      { totalPrice: 0, totalQty: 0 },
    );

  const shippingTypeCheck = cartLangItems.find(
    (item) => item.shipingCostType === shippingTypes[1],
  );
  const shippingType = shippingTypeCheck ? shippingTypes[1] : shippingTypes[0];
  const cfgLang = lang === 'en' ? 'en' : 'es';
  const shippingByLang =
    config &&
    config[cfgLang] &&
    config[cfgLang].shippingCost &&
    config[cfgLang].shippingCost[shippingType]
      ? config[cfgLang].shippingCost[shippingType]
      : shippingCost[cfgLang][shippingType];
  const shippingTypeCost =
    totalPrice >= shippingByLang.limit ? 0 : shippingByLang.cost;

  return {
    items: cartLangItems,
    shippingCost: totalPrice ? shippingTypeCost : 0,
    shippingLimit: shippingByLang.limit,
    shippingType: totalPrice ? (shippingTypeCost ? shippingType : 'free') : '',
    totalPrice: totalPrice ? totalPrice + shippingTypeCost : totalPrice,
    totalQty,
  };
};

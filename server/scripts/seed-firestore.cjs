/**
 * Puebla Firestore con datos de demostración (productos, categorías, traducciones, tema, config, páginas).
 * Uso (desde la raíz del repo eshop_mean-master):
 *   node ./server/scripts/seed-firestore.cjs
 * Subir fotos de client/src/assets/img/products/ a Storage y actualizar todos los productos en Firestore:
 *   npm run sync:product-images:storage
 * Borrar solo colecciones de tienda y reinsertar:
 *   node ./server/scripts/seed-firestore.cjs --clear
 * Solo vaciar productos y volver a insertar el catálogo demo (mantiene categorías/traducciones):
 *   node ./server/scripts/seed-firestore.cjs --reset-products
 *
 * Opcional: sube imágenes de `client/src/assets/img/` a Firebase Storage y guarda URLs en tema/productos.
 * Banner principal: `BANNER-ENTERIZOS-DESKTOP.webp` o `hero-banner.*` en esa carpeta.
 * Fotos de catálogo: `client/src/assets/img/products/` — archivos sueltos (A→Z) o subcarpetas `1/`, `2/`…
 *   con una foto "principal" por carpeta (nombre que contenga `principal`, si no la primera A→Z).
 *   Si `products/` no aporta nada, se usan otras imágenes en `img/` (no logo/banner/hero).
 *   Si aún faltan, usa `product-01.jpg` … `product-20.*` en la raíz de `img/`.
 * Por defecto las fotos locales se suben a Firebase Storage y Firestore guarda la URL del bucket.
 *   --local-asset-urls     → además fuerza rutas `/assets/img/...` en productos (sustituye URLs de Storage).
 *   --upload-product-images → solo sube imágenes locales a Storage y actualiza `mainImage`/`images` de
 *     todos los documentos en la colección `products` (no borra ni reinserta el catálogo).
 * Si faltan archivos locales y sí hay Storage, el seed puede descargar imágenes de prueba y subirlas (requiere red).
 *   --no-storage-upload  → no sube al bucket (URLs externas; con --local-asset-urls se usan /assets/ si hay archivos).
 * Categorías: antes de escribir el catálogo Aura, se borran en Firestore todas las categorías cuyo id no esté
 *   en el seed (plantilla vieja: electrónica, cocina, seamless, “todo a 19.900”, etc.).
 *
 * Lee variables de .env en la raíz (GOOGLE_APPLICATION_CREDENTIALS relativo a server/, FIREBASE_PROJECT_ID).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const COL = {
  products: 'products',
  categories: 'categories',
  translations: 'translations',
  pages: 'pages',
  themes: 'themes',
  configs: 'config',
};

function loadRootEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('No se encontró .env en la raíz del proyecto; se usan variables ya definidas.');
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function resolveCredentialsPath() {
  let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    throw new Error(
      'Define GOOGLE_APPLICATION_CREDENTIALS en .env (p. ej. ./credentials/firebase-service-account.json)',
    );
  }
  if (!path.isAbsolute(keyPath)) {
    const serverDir = path.join(__dirname, '..');
    keyPath = path.resolve(serverDir, keyPath);
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`No existe el archivo de credenciales: ${keyPath}`);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

async function deleteCollection(db, name, batchSize = 400) {
  const ref = db.collection(name);
  let snap = await ref.limit(batchSize).get();
  while (!snap.empty) {
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    snap = await ref.limit(batchSize).get();
  }
  console.log(`  Colección vaciada: ${name}`);
}

/** Elimina documentos de `categories` cuyo id no está en el catálogo del seed (plantilla vieja, tags sueltos, etc.). */
async function purgeCategoryDocumentsNotInAllowlist(db, allowedTitleUrlSet) {
  const snap = await db.collection(COL.categories).get();
  const toDelete = snap.docs.filter((d) => !allowedTitleUrlSet.has(d.id));
  if (!toDelete.length) {
    return;
  }
  const chunk = 450;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const b = db.batch();
    for (const d of toDelete.slice(i, i + chunk)) {
      b.delete(d.ref);
    }
    await b.commit();
  }
  console.log(
    `  Firestore: eliminadas ${toDelete.length} categorías que ya no pertenecen al menú Aura Boutique.`,
  );
}

function langBlockProduct(overrides) {
  return {
    visibility: true,
    title: overrides.title,
    description: overrides.description,
    descriptionFull: overrides.descriptionFull || [overrides.description],
    salePrice: overrides.salePrice,
    regularPrice: overrides.regularPrice ?? overrides.salePrice,
    onSale: overrides.onSale ?? false,
    stock: overrides.stock || 'On_stock',
    shipping: overrides.shipping || 'basic',
  };
}

/** Paletas demo para el listado (punticos + hover con nombres). */
function colorsForCatalogIndex(i) {
  const palettes = [
    [
      { label: 'Negro', hex: '#1a1a1a' },
      { label: 'Vino', hex: '#5c2834' },
      { label: 'Chocolate', hex: '#4a3728' },
    ],
    [
      { label: 'Negro', hex: '#1a1a1a' },
      { label: 'Gris melange', hex: '#9a9a9a' },
      { label: 'Perla', hex: '#d8d4ce' },
    ],
    [
      { label: 'Pistacho', hex: '#a8b89a' },
      { label: 'Verde oliva', hex: '#5c6648' },
      { label: 'Crudo', hex: '#e8e0d5' },
    ],
    [
      { label: 'Rosa empolvado', hex: '#e8b4c4' },
      { label: 'Champagne', hex: '#dfd1c0' },
      { label: 'Negro', hex: '#1a1a1a' },
      { label: 'Marino', hex: '#1e2a4a' },
    ],
    [
      { label: 'Blanco roto', hex: '#f5f0e8' },
      { label: 'Negro', hex: '#1a1a1a' },
    ],
    [
      { label: 'Arena', hex: '#dccbb6' },
      { label: 'Terracota', hex: '#b85c38' },
      { label: 'Verde militar', hex: '#4a5a45' },
    ],
  ];
  return palettes[i % palettes.length];
}

/** Textos UI en español (idioma por defecto). */
function translationKeysEs() {
  return {
    ESHOP_TITLE: 'Aura Boutique',
    ESHOP_DESCRIPTION: 'Moda y accesorios — selección curada y envío a domicilio',
    LINKS: 'Enlaces',
    CONTACT: 'Contacto',
    Login: 'Iniciar sesión',
    with: 'con',
    Google: 'Google',
    Dashboard: 'Panel',
    Orders: 'Pedidos',
    Logout: 'Cerrar sesión',
    Categories: 'Categorías',
    All: 'Todos los',
    products: 'productos',
    Sorting: 'Orden',
    PriceRange: 'Rango de precio',
    Price: 'Precio',
    to: 'hasta',
    Price_from: 'Desde',
    Price_to: 'Hasta',
    Toggle_subcategories: 'mostrar u ocultar subcategorías',
    Price_was: 'Antes',
    Price_now: 'Ahora',
    SAVE_PERCENT: 'Ahorra {pct}%',
    AVAILABLE_IN_COLORS: 'Disponible en {n} colores',
    AVAILABLE_ONE_COLOR: 'Color: {name}',
    Active_filters: 'Filtros activos',
    Clear_filters: 'Limpiar filtros',
    Clear_all_filters: 'Limpiar todo',
    Applied_filters_sidebar: 'Estás filtrando por',
    Clear_categories_only: 'Quitar categorías',
    Clear_price_only: 'Quitar precio máx.',
    Filters_count_hint: 'Cantidad de filtros aplicados',
    Remove_filter: 'Quitar filtro',
    Detail: 'Detalle',
    Edit: 'Editar',
    More: 'Más',
    Amount: 'Importe',
    Customer: 'Cliente',
    Description: 'Descripción',
    Created: 'Creado',
    Paid: 'Pagado',
    Total_price: 'Total',
    Total_quantity: 'Cantidad',
    About_customer: 'Cliente',
    City: 'Ciudad',
    Country: 'País',
    Address: 'Dirección',
    Zip: 'Código postal',
    Name: 'Nombre',
    Prev: 'Anterior',
    Next: 'Siguiente',
    Filter: 'Filtrar',
    Products: 'Productos',
    Back: 'Volver',
    Images: 'Imágenes',
    Status: 'Estado',
    Type: 'Tipo',
    Home_promo: 'Colección · novedades',
    Free_shipping_limit: 'En pedidos desde',
    ANNOUNCE_SHIPPING_FULL: 'Envío gratis en pedidos desde',
    ANNOUNCE_BAR_MID: 'Novedades · en promoción · ofertas',
    ANNOUNCE_BAR_FLASH: 'Hasta 40% en seleccionados',
    ANNOUNCE_BAR_NOTE: 'Cambios sin drama · empaque regalo',
    ANNOUNCE_CTA_ENTERIZOS: 'Enterizos con descuentos',
    ANNOUNCE_CTA_ENTERIZOS_ARIA: 'Abrir el catálogo: enterizos en oferta',
    ANNOUNCE_CTA_PROMOS_ARIA: 'Abrir el listado de productos en oferta y novedades',
    ANNOUNCE_BAR_ARIA: 'Envío, promociones y acceso al catálogo filtrado',
    Eshop_subtitle: 'Tu estilo, tu aura',
    Home_promo_text_link: 'Ver ofertas',
    Home_promo_link: '#',
    Cart_title: 'Carrito',
    Shipping: 'Envío',
    Summary: 'Resumen',
    Make_order: 'Realizar pedido',
    Firstname: 'Nombre',
    and: 'y',
    Surname: 'Apellidos',
    ZIP: 'CP',
    Notes: 'Notas',
    Payment_method: 'Método de pago',
    Pay: 'Pagar',
    card: 'tarjeta',
    Payment: 'Pago',
    on: 'al',
    delivery: 'recibir',
    Summary_and_payment: 'Resumen y pago',
    Your_summary: 'Tu resumen',
    MakeOrder: 'Confirmar pedido',
    SuccessPayment: 'Pago correcto',
    SuccessOrder: 'Pedido registrado',
    SendContact: 'Enviar',
    CONTACT_SEND_SUCCESS: 'Mensaje enviado',
    SignUp: 'Registrarse',
    Password: 'Contraseña',
    Product: 'Producto',
    Title: 'Título',
    Save: 'Guardar',
    Remove: 'Eliminar',
    Visibility: 'Visibilidad',
    Visible: 'Visible',
    Hidden: 'Oculto',
    On_stock: 'En stock',
    Available_in_few_weeks: 'Disponible en semanas',
    Unavailable: 'No disponible',
    On_sale: 'En oferta',
    Normal: 'Normal',
    Basic: 'Básico',
    Extended: 'Extendido',
    Refresh: 'Actualizar',
    newest: 'Más recientes',
    oldest: 'Más antiguos',
    priceasc: 'Precio ↑',
    pricedesc: 'Precio ↓',
    newest_sort: 'Novedades',
    On_stock_label: 'En stock',
    Newest: 'Más recientes',
    Oldest: 'Más antiguos',
    'Price-asc': 'Precio ascendente',
    'Price-decs': 'Precio descendente',
    Contact: 'Contacto',
    ADDED_TO_CART: 'Producto agregado al carrito',
    TO_CART: 'Ver bolsa',
    ADD_TO_CART: 'Agregar al carrito',
    CART_ALSO_LIKE: 'También te puede interesar',
    CART_QUICK_VIEW: 'Vista rápida',
    CART_SIMILAR_EMPTY: 'No hay más sugerencias en estas categorías.',
    ALREADY_IN_CART: 'En tu bolsa',
    ADD_ANOTHER: 'Añadir otro',
    IN_YOUR_BAG: 'En tu bolsa',
    GLOBAL_SEARCH_PLACEHOLDER: 'Buscar prendas, categoría…',
    SEARCH_NO_RESULTS: 'Sin resultados',
    SEARCH_TYPE_HINT: 'Escribe para ver productos',
    Add_theme: 'Añadir tema',
    From_existing_themes: 'Desde temas existentes',
    Show_shipping_promo: 'Mostrar promo de envío',
    Hide: 'Ocultar',
    Show: 'Mostrar',
    Active: 'Activo',
    Inactive: 'Inactivo',
    Request_sended: 'Solicitud enviada',
    Again: 'Otra vez',
    Sale_price: 'Precio oferta',
    Regular_price: 'Precio regular',
    Short_description: 'Descripción breve',
    Main_image_url: 'URL imagen principal',
    Language_for_product_detail: 'Idioma del contenido',
    Find: 'Buscar',
    Add_page: 'Añadir página',
    From_existing_pages: 'Desde páginas existentes',
    Language_for_page: 'Idioma de la página',
    Add_Config: 'Añadir configuración',
    From_existing_config: 'Desde configuraciones existentes',
    Language_for_config: 'Idioma de la configuración',
    Categories_edit: 'Editar categorías',
    'Menu hidden': 'Oculto en menú',
    Position: 'Posición',
    Image_type: 'Tipo de imagen',
    Contain: 'Contener',
    Cover: 'Cubrir',
  };
}

/** Inglés para la ruta /en/... */
function translationKeysEn() {
  return {
    ESHOP_TITLE: 'Aura Boutique',
    ESHOP_DESCRIPTION: 'Fashion & accessories — curated picks and delivery',
    LINKS: 'Links',
    CONTACT: 'Contact',
    Login: 'Log in',
    with: 'with',
    Google: 'Google',
    Dashboard: 'Dashboard',
    Orders: 'Orders',
    Logout: 'Log out',
    Categories: 'Categories',
    All: 'All',
    products: 'products',
    Sorting: 'Sort',
    PriceRange: 'Price range',
    Price: 'Price',
    to: 'to',
    Price_from: 'From',
    Price_to: 'To',
    Toggle_subcategories: 'show or hide subcategories',
    Price_was: 'Was',
    Price_now: 'Now',
    SAVE_PERCENT: 'Save {pct}%',
    AVAILABLE_IN_COLORS: 'Available in {n} colors',
    AVAILABLE_ONE_COLOR: 'Color: {name}',
    Active_filters: 'Active filters',
    Clear_filters: 'Clear filters',
    Clear_all_filters: 'Clear all',
    Applied_filters_sidebar: "You're filtering by",
    Clear_categories_only: 'Remove categories',
    Clear_price_only: 'Remove max price',
    Filters_count_hint: 'Number of active filters',
    Remove_filter: 'Remove filter',
    Detail: 'Details',
    Edit: 'Edit',
    More: 'More',
    Amount: 'Amount',
    Customer: 'Customer',
    Description: 'Description',
    Created: 'Created',
    Paid: 'Paid',
    Total_price: 'Total',
    Total_quantity: 'Quantity',
    About_customer: 'Customer',
    City: 'City',
    Country: 'Country',
    Address: 'Address',
    Zip: 'ZIP code',
    Name: 'Name',
    Prev: 'Previous',
    Next: 'Next',
    Filter: 'Filter',
    Products: 'Products',
    Back: 'Back',
    Images: 'Images',
    Status: 'Status',
    Type: 'Type',
    Home_promo: 'New pieces · new looks',
    Free_shipping_limit: 'On orders from',
    ANNOUNCE_SHIPPING_FULL: 'Free shipping on orders from',
    ANNOUNCE_BAR_MID: 'New drops · on promotion · sale',
    ANNOUNCE_BAR_FLASH: 'Up to 40% off selected styles',
    ANNOUNCE_BAR_NOTE: 'Easy returns · gift wrap on us',
    ANNOUNCE_CTA_ENTERIZOS: 'Jumpsuits on sale',
    ANNOUNCE_CTA_ENTERIZOS_ARIA: 'Open catalog: jumpsuits on sale',
    ANNOUNCE_CTA_PROMOS_ARIA: 'Open the on-sale and new products list',
    ANNOUNCE_BAR_ARIA: 'Shipping, promos, and a shortcut to filtered catalog',
    Eshop_subtitle: 'Your style, your aura',
    Home_promo_text_link: 'View deals',
    Home_promo_link: '#',
    Cart_title: 'Cart',
    Shipping: 'Shipping',
    Summary: 'Summary',
    Make_order: 'Checkout',
    Firstname: 'First name',
    and: 'and',
    Surname: 'Last name',
    ZIP: 'ZIP',
    Notes: 'Notes',
    Payment_method: 'Payment method',
    Pay: 'Pay',
    card: 'card',
    Payment: 'Payment',
    on: 'on',
    delivery: 'delivery',
    Summary_and_payment: 'Summary & payment',
    Your_summary: 'Your summary',
    MakeOrder: 'Place order',
    SuccessPayment: 'Payment successful',
    SuccessOrder: 'Order placed',
    SendContact: 'Send',
    CONTACT_SEND_SUCCESS: 'Message sent',
    SignUp: 'Sign up',
    Password: 'Password',
    Product: 'Product',
    Title: 'Title',
    Save: 'Save',
    Remove: 'Remove',
    Visibility: 'Visibility',
    Visible: 'Visible',
    Hidden: 'Hidden',
    On_stock: 'In stock',
    Available_in_few_weeks: 'Ships in a few weeks',
    Unavailable: 'Unavailable',
    On_sale: 'On sale',
    Normal: 'Regular',
    Basic: 'Basic',
    Extended: 'Extended',
    Refresh: 'Refresh',
    newest: 'Newest first',
    oldest: 'Oldest first',
    priceasc: 'Price low to high',
    pricedesc: 'Price high to low',
    newest_sort: 'New arrivals',
    On_stock_label: 'In stock',
    Newest: 'Newest',
    Oldest: 'Oldest',
    'Price-asc': 'Price ↑',
    'Price-decs': 'Price ↓',
    Contact: 'Contact',
    ADDED_TO_CART: 'Product added to bag',
    TO_CART: 'View bag',
    ADD_TO_CART: 'Add to bag',
    CART_ALSO_LIKE: 'You may also like',
    CART_QUICK_VIEW: 'Quick view',
    CART_SIMILAR_EMPTY: 'No more suggestions in these categories.',
    ALREADY_IN_CART: 'In your bag',
    ADD_ANOTHER: 'Add another',
    IN_YOUR_BAG: 'In your bag',
    GLOBAL_SEARCH_PLACEHOLDER: 'Search styles…',
    SEARCH_NO_RESULTS: 'No results',
    SEARCH_TYPE_HINT: 'Type to see products',
    Add_theme: 'Add theme',
    From_existing_themes: 'From existing themes',
    Show_shipping_promo: 'Show shipping promo',
    Hide: 'Hide',
    Show: 'Show',
    Active: 'Active',
    Inactive: 'Inactive',
    Request_sended: 'Request sent',
    Again: 'Again',
    Sale_price: 'Sale price',
    Regular_price: 'Regular price',
    Short_description: 'Short description',
    Main_image_url: 'Main image URL',
    Language_for_product_detail: 'Language for content',
    Find: 'Find',
    Add_page: 'Add page',
    From_existing_pages: 'From existing pages',
    Language_for_page: 'Language for page',
    Add_Config: 'Add configuration',
    From_existing_config: 'From existing configurations',
    Language_for_config: 'Language for configuration',
    Categories_edit: 'Edit categories',
    'Menu hidden': 'Hidden in menu',
    Position: 'Position',
    Image_type: 'Image type',
    Contain: 'Contain',
    Cover: 'Cover',
  };
}

function pickImage(seed, w = 800, h = 800) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

/** Imágenes libres (Unsplash), estilo retail deportivo — no enlazar fotos de otras tiendas sin permiso. */
const FASHION_IMG = [
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=900&q=80',
];

function fashionImg(i) {
  return FASHION_IMG[i % FASHION_IMG.length];
}

/** Carpeta local de imágenes (el seed las sube a Storage si existen). */
const ASSETS_IMG_DIR = path.join(__dirname, '../../client/src/assets/img');

function storagePublicUrl(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function guessImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function readFirstExistingFile(dir, names) {
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const IMAGE_FILE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** URL pública Angular: `client/src/assets/img/...` → `/assets/img/...` */
function publicAssetUrlFromAbsPath(assetsImgDir, absFilePath) {
  const rel = path.relative(assetsImgDir, absFilePath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) {
    return null;
  }
  return `/assets/img/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Asigna a cada slot 0…19 una URL `/assets/img/...` si hay archivo local (carpeta products o product-XX en img/).
 * Sustituye entradas previas en seedMedia.productByIndex (p. ej. URLs de Storage) cuando hay foto local.
 */
function applyLocalProductImagesToSeedMedia(assetsDir, seedMedia) {
  const productsDir = path.join(assetsDir, 'products');
  const fromProductsDir = listImageFilesSorted(productsDir);
  const nestedPrincipals = listNestedProductFolderPrincipals(productsDir);
  const candidates = listProductCatalogCandidates(assetsDir);
  const maxNamedSlots = 20;
  const total = Math.max(maxNamedSlots, candidates.length);
  let n = 0;
  for (let slot = 1; slot <= total; slot += 1) {
    const stem = `product-${String(slot).padStart(2, '0')}`;
    let pth = slot <= candidates.length ? candidates[slot - 1] : null;
    if (!pth && slot <= maxNamedSlots) {
      pth = readFirstExistingFile(assetsDir, [
        `${stem}.jpg`,
        `${stem}.jpeg`,
        `${stem}.png`,
        `${stem}.webp`,
      ]);
    }
    if (!pth) {
      continue;
    }
    const url = publicAssetUrlFromAbsPath(assetsDir, pth);
    if (url) {
      seedMedia.productByIndex.set(slot - 1, url);
      n += 1;
    }
  }
  if (n) {
    const hint = fromProductsDir.length
      ? `products/ (${fromProductsDir.length} archivos, A→Z)`
      : nestedPrincipals.length
        ? `products/1…N (${nestedPrincipals.length} carpetas)`
        : candidates.length
          ? `img/ raíz (${candidates.length} archivos)`
          : 'product-01… en img/';
    console.log(`  Catálogo: ${n} slots con rutas /assets/img/… → ${hint}`);
  }
}

/** Lista rutas absolutas de imágenes en un directorio (solo primer nivel), orden alfabético. */
function listImageFilesSorted(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    return [];
  }
  if (!st.isDirectory()) {
    return [];
  }
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let fst;
    try {
      fst = fs.statSync(full);
    } catch {
      continue;
    }
    if (!fst.isFile()) {
      continue;
    }
    if (name.startsWith('.')) {
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_FILE_EXT.has(ext)) {
      continue;
    }
    out.push(full);
  }
  out.sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, { sensitivity: 'base', numeric: true }),
  );
  return out;
}

async function uploadBufferToBucket(bucket, bucketName, destPath, buffer, contentType) {
  const token = crypto.randomUUID();
  const f = bucket.file(destPath);
  await f.save(buffer, {
    metadata: {
      contentType: contentType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return storagePublicUrl(bucketName, destPath, token);
}

/**
 * Una imagen por subcarpeta numérica `products/1/`, `products/2/`… (orden numérico).
 * Prioriza archivo con "principal" en el nombre; si no hay, el primero A→Z.
 */
function listNestedProductFolderPrincipals(productsDir) {
  if (!productsDir || !fs.existsSync(productsDir)) {
    return [];
  }
  let st;
  try {
    st = fs.statSync(productsDir);
  } catch {
    return [];
  }
  if (!st.isDirectory()) {
    return [];
  }
  const names = fs.readdirSync(productsDir);
  const dirs = names
    .filter((n) => /^\d+$/.test(n))
    .sort((a, b) => Number(a) - Number(b));
  const out = [];
  for (const d of dirs) {
    const dirPath = path.join(productsDir, d);
    let dst;
    try {
      dst = fs.statSync(dirPath);
    } catch {
      continue;
    }
    if (!dst.isDirectory()) {
      continue;
    }
    const files = listImageFilesSorted(dirPath);
    if (!files.length) {
      continue;
    }
    const principal = files.find((f) => path.basename(f).toLowerCase().includes('principal'));
    out.push(principal || files[0]);
  }
  return out;
}

/** Rutas absolutas para catálogo: `img/products/` plano, o subcarpetas 1…N, o raíz `img/` sin logo/banner/hero. */
function listProductCatalogCandidates(assetsDir) {
  const productsDir = path.join(assetsDir, 'products');
  const inProducts = listImageFilesSorted(productsDir);
  if (inProducts.length) {
    return inProducts;
  }
  const nested = listNestedProductFolderPrincipals(productsDir);
  if (nested.length) {
    return nested;
  }
  const skipBasename = (name) => {
    const b = name.toLowerCase();
    if (b.startsWith('logo')) {
      return true;
    }
    if (b.startsWith('brand-logo')) {
      return true;
    }
    if (b.includes('banner')) {
      return true;
    }
    if (b.includes('hero')) {
      return true;
    }
    return false;
  };
  return listImageFilesSorted(assetsDir).filter((f) => !skipBasename(path.basename(f)));
}

/**
 * Sube logo, banner y product-01… desde ASSETS_IMG_DIR. Devuelve URLs para Firestore.
 */
async function uploadSeedImagesFromDisk(bucketName, assetsDir) {
  const bucket = admin.storage().bucket(bucketName);
  const out = { logo: null, hero: null, productByIndex: new Map() };

  const logoPath = readFirstExistingFile(assetsDir, [
    'logo.png',
    'logo.jpg',
    'logo.jpeg',
    'logo.webp',
    'brand-logo.png',
    'brand-logo.jpg',
  ]);
  if (logoPath) {
    const buf = fs.readFileSync(logoPath);
    const ext = path.extname(logoPath);
    out.logo = await uploadBufferToBucket(
      bucket,
      bucketName,
      `eshop/seed/logo${ext}`,
      buf,
      guessImageContentType(logoPath),
    );
    console.log(`  Storage: logo ← ${path.basename(logoPath)}`);
  }

  const heroPath = readFirstExistingFile(assetsDir, [
    'BANNER-ENTERIZOS-DESKTOP.webp',
    'banner-enterizos-desktop.webp',
    'hero-banner.jpg',
    'hero-banner.jpeg',
    'hero-banner.png',
    'hero-banner.webp',
    'banner.jpg',
    'banner.jpeg',
    'banner.png',
    'banner.webp',
  ]);
  if (heroPath) {
    const buf = fs.readFileSync(heroPath);
    const ext = path.extname(heroPath);
    out.hero = await uploadBufferToBucket(
      bucket,
      bucketName,
      `eshop/seed/hero-banner${ext}`,
      buf,
      guessImageContentType(heroPath),
    );
    console.log(`  Storage: banner principal ← ${path.basename(heroPath)}`);
  }

  const productsDir = path.join(assetsDir, 'products');
  const fromProductsDir = listImageFilesSorted(productsDir);
  const nestedPrincipals = listNestedProductFolderPrincipals(productsDir);
  const candidates = listProductCatalogCandidates(assetsDir);
  const maxNamedSlots = 20;
  const totalSlots = Math.max(maxNamedSlots, candidates.length);

  for (let n = 1; n <= totalSlots; n += 1) {
    const stem = `product-${String(n).padStart(2, '0')}`;
    let pth = n <= candidates.length ? candidates[n - 1] : null;
    if (!pth && n <= maxNamedSlots) {
      pth = readFirstExistingFile(assetsDir, [
        `${stem}.jpg`,
        `${stem}.jpeg`,
        `${stem}.png`,
        `${stem}.webp`,
      ]);
    }
    if (pth) {
      const buf = fs.readFileSync(pth);
      const ext = path.extname(pth);
      const url = await uploadBufferToBucket(
        bucket,
        bucketName,
        `eshop/seed/${stem}${ext}`,
        buf,
        guessImageContentType(pth),
      );
      out.productByIndex.set(n - 1, url);
    }
  }
  if (out.productByIndex.size) {
    const srcHint =
      fromProductsDir.length > 0
        ? `img/products/ (${fromProductsDir.length} archivos, A→Z)`
        : nestedPrincipals.length > 0
          ? `img/products/1…N (${nestedPrincipals.length} carpetas, principal por carpeta)`
          : candidates.length > 0
            ? `img/ raíz (${candidates.length} archivos, excl. logo/banner/hero)`
            : 'product-01… en img/';
    console.log(`  Storage: ${out.productByIndex.size} fotos de producto (${srcHint})`);
  }
  return out;
}

/** Descarga binaria (sigue redirecciones, p. ej. picsum → imagen final). */
function fetchUrlBuffer(urlStr, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { 'User-Agent': 'eshop-mean-seed/1.0', Accept: 'image/*,*/*' },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          const next = new URL(res.headers.location, urlStr).href;
          res.resume();
          fetchUrlBuffer(next, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${urlStr} → ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error(`Timeout ${urlStr}`));
    });
    req.end();
  });
}

/** Si no hubo archivo local, baja una imagen de prueba y la sube al bucket. */
async function ensureLogoAndHeroFromRemoteIfMissing(bucketName, seedMedia) {
  const bucket = admin.storage().bucket(bucketName);
  if (!seedMedia.logo) {
    const buf = await fetchUrlBuffer('https://picsum.photos/seed/aura-boutique-logo/320/120');
    seedMedia.logo = await uploadBufferToBucket(
      bucket,
      bucketName,
      'eshop/seed/auto/logo.jpg',
      buf,
      'image/jpeg',
    );
    console.log('  Storage: logo (remoto → bucket)');
  }
  if (!seedMedia.hero) {
    const buf = await fetchUrlBuffer(FASHION_IMG[0]);
    seedMedia.hero = await uploadBufferToBucket(
      bucket,
      bucketName,
      'eshop/seed/auto/hero.jpg',
      buf,
      'image/jpeg',
    );
    console.log('  Storage: banner principal (remoto → bucket)');
  }
}

/** Rellena slots de carrusel/producto con imágenes en Storage (descarga Unsplash si faltaba local). */
function readServiceAccountProjectId() {
  try {
    let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) {
      return null;
    }
    if (!path.isAbsolute(keyPath)) {
      keyPath = path.resolve(path.join(__dirname, '..'), keyPath);
    }
    if (!fs.existsSync(keyPath)) {
      return null;
    }
    const j = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    return typeof j.project_id === 'string' ? j.project_id : null;
  } catch {
    return null;
  }
}

/** Nombre del bucket GCS que Firebase Storage usa (varía por proyecto / era de creación). */
async function resolveStorageBucketNameOrNull() {
  const tryBucket = async (name) => {
    if (!name || typeof name !== 'string') {
      return null;
    }
    const trimmed = name.trim();
    try {
      const b = admin.storage().bucket(trimmed);
      const [ex] = await b.exists();
      return ex ? trimmed : null;
    } catch {
      return null;
    }
  };

  const fromEnv = await tryBucket(process.env.FIREBASE_STORAGE_BUCKET);
  if (fromEnv) {
    return fromEnv;
  }

  const pid =
    process.env.FIREBASE_PROJECT_ID ||
    readServiceAccountProjectId() ||
    process.env.GCLOUD_PROJECT;
  if (!pid) {
    return null;
  }

  if (pid === 'ecommerce-afcfb') {
    const aura = await tryBucket('ecommerce-afcfb.firebasestorage.app');
    if (aura) {
      return aura;
    }
  }

  for (const name of [`${pid}.firebasestorage.app`, `${pid}.appspot.com`]) {
    const ok = await tryBucket(name);
    if (ok) {
      return ok;
    }
  }
  return null;
}

async function ensureProductSlotsFromRemote(bucketName, seedMedia, products) {
  const bucket = admin.storage().bucket(bucketName);
  const slotMod = Math.max(20, seedMedia.productByIndex.size || 0);
  const slotsNeeded = new Set();
  for (let i = 0; i < products.length; i += 1) {
    slotsNeeded.add(i % slotMod);
    slotsNeeded.add((i + 1) % slotMod);
  }
  let added = 0;
  for (const slot of slotsNeeded) {
    if (seedMedia.productByIndex.has(slot)) {
      continue;
    }
    const p = products[slot % products.length];
    const srcUrl = fashionImg((p.fi ?? 0) + slot);
    const buf = await fetchUrlBuffer(srcUrl);
    const dest = `eshop/seed/auto/product-${String(slot + 1).padStart(2, '0')}.jpg`;
    const uploaded = await uploadBufferToBucket(bucket, bucketName, dest, buf, 'image/jpeg');
    seedMedia.productByIndex.set(slot, uploaded);
    added += 1;
  }
  if (added) {
    console.log(`  Storage: ${added} imágenes de producto (remoto → bucket)`);
  }
}

/**
 * Sube fotos de `client/src/assets/img/products/` (y product-01… en img/) a Storage y actualiza en Firestore
 * todos los documentos de `products` (mainImage, images y colors demo). Requiere bucket y credenciales.
 */
async function uploadProductImagesOnly() {
  if (process.argv.includes('--no-storage-upload')) {
    throw new Error('No combines --upload-product-images con --no-storage-upload.');
  }
  loadRootEnv();
  resolveCredentialsPath();

  const credProjectId = readServiceAccountProjectId();
  const projectId =
    process.env.FIREBASE_PROJECT_ID || credProjectId || process.env.GCLOUD_PROJECT;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  const dbId =
    (process.env.FIRESTORE_DATABASE_ID || '').trim() || 'ecommerce';
  const db = getFirestore(admin.app(), dbId);

  const storageBucket = await resolveStorageBucketNameOrNull();
  if (!storageBucket) {
    throw new Error(
      'No hay bucket de Storage. Define FIREBASE_STORAGE_BUCKET o inicia Storage en Firebase Console.',
    );
  }

  const seedMedia = await uploadSeedImagesFromDisk(storageBucket, ASSETS_IMG_DIR);
  if (!seedMedia.productByIndex.size) {
    console.error(
      'No se encontraron imágenes de catálogo: pon archivos en client/src/assets/img/products/ (recomendado),',
    );
    console.error('o en client/src/assets/img/ (no logo/banner/hero), o product-01.jpg … product-20.* en img/.');
    console.error('Luego: npm run sync:product-images:storage');
    process.exit(1);
  }

  const sortedKeys = Array.from(seedMedia.productByIndex.keys()).sort((a, b) => a - b);
  const urlList = sortedKeys.map((k) => seedMedia.productByIndex.get(k));
  const slotMod = urlList.length;

  const snap = await db.collection(COL.products).get();
  if (snap.empty) {
    console.error(
      'La colección "products" está vacía. Ejecuta antes: npm run seed:firestore o seed:firestore:clear',
    );
    process.exit(1);
  }

  const docs = snap.docs.slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }));
  let batch = db.batch();
  let ops = 0;
  let updated = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    const mainUrl = urlList[i % slotMod];
    const secondUrl = urlList[(i + 1) % slotMod];
    batch.update(d.ref, {
      mainImage: { url: mainUrl, name: `${d.id}.jpg` },
      images: [mainUrl, secondUrl],
      colors: colorsForCatalogIndex(i),
    });
    ops += 1;
    updated += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops) {
    await batch.commit();
  }

  console.log(
    `Listo: ${updated} productos actualizados en Firestore con ${slotMod} imagen(es) en Storage (${storageBucket}).`,
  );
  process.exit(0);
}

async function main() {
  const clear = process.argv.includes('--clear');
  loadRootEnv();
  resolveCredentialsPath();

  const credProjectId = readServiceAccountProjectId();
  const projectId =
    process.env.FIREBASE_PROJECT_ID || credProjectId || process.env.GCLOUD_PROJECT;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  const dbId =
    (process.env.FIRESTORE_DATABASE_ID || '').trim() || 'ecommerce';
  const db = getFirestore(admin.app(), dbId);

  const skipStorageUpload = process.argv.includes('--no-storage-upload');
  let storageBucket = null;
  if (!skipStorageUpload) {
    storageBucket = await resolveStorageBucketNameOrNull();
    if (!storageBucket) {
      console.warn(
        '  No hay bucket de Storage accesible. En Firebase Console → Storage inicia el producto, o define FIREBASE_STORAGE_BUCKET con el nombre exacto (p. ej. proyecto.appspot.com o proyecto.firebasestorage.app).',
      );
    }
  }

  let seedMedia = { logo: null, hero: null, productByIndex: new Map() };
  if (!skipStorageUpload && storageBucket) {
    try {
      seedMedia = await uploadSeedImagesFromDisk(storageBucket, ASSETS_IMG_DIR);
      await ensureLogoAndHeroFromRemoteIfMissing(storageBucket, seedMedia);
    } catch (err) {
      console.warn(
        '  Advertencia: no se pudieron subir imágenes a Storage (revisa bucket y permisos IAM).',
        err && err.message ? err.message : err,
      );
    }
  }

  if (process.argv.includes('--local-asset-urls')) {
    applyLocalProductImagesToSeedMedia(ASSETS_IMG_DIR, seedMedia);
  }

  const themeLogoUrl = seedMedia.logo || pickImage('aura-boutique-logo', 320, 120);
  const themeHeroUrl = seedMedia.hero || FASHION_IMG[0];

  const storeCollections = [
    COL.products,
    COL.categories,
    COL.translations,
    COL.pages,
    COL.themes,
    COL.configs,
  ];

  if (clear) {
    console.log('Borrando documentos de colecciones de tienda (no users ni orders)...');
    for (const c of storeCollections) {
      await deleteCollection(db, c);
    }
  }

  const resetProducts = process.argv.includes('--reset-products');
  if (resetProducts && !clear) {
    console.log('Vaciando solo la colección de productos (--reset-products)...');
    await deleteCollection(db, COL.products);
  }

  const now = Date.now();
  const keysEs = translationKeysEs();
  const keysEn = translationKeysEn();
  /** Demo: sk/cs reutilizan español hasta que añadas traducciones propias. */
  const keysSk = { ...keysEs };
  const keysCs = { ...keysEs };

  const batch = db.batch();

  for (const [lang, keys] of [
    ['es', keysEs],
    ['en', keysEn],
    ['sk', keysSk],
    ['cs', keysCs],
  ]) {
    const ref = db.collection(COL.translations).doc(lang);
    batch.set(ref, { lang, keys }, { merge: true });
  }

  const shippingBlock = {
    basic: { cost: 5, limit: 100 },
    extended: { cost: 10, limit: 200 },
  };
  const shippingCs = {
    basic: { cost: 150, limit: 3000 },
    extended: { cost: 300, limit: 6000 },
  };

  const announcementChipKeys = [
    '__SHIPPING__',
    'ANNOUNCE_BAR_FLASH',
    '__ENTERIZOS_DISCOUNT__',
  ];

  batch.set(db.collection(COL.configs).doc('default'), {
    titleUrl: 'default',
    active: true,
    dateAdded: now,
    es: { shippingCost: shippingBlock, announcementChipKeys },
    en: { shippingCost: shippingBlock, announcementChipKeys },
    sk: { shippingCost: shippingBlock, announcementChipKeys },
    cs: { shippingCost: shippingCs, announcementChipKeys },
  });

  batch.set(db.collection(COL.themes).doc('default'), {
    titleUrl: 'default',
    active: true,
    dateAdded: now,
    styles: {
      primaryColor: '#4f46e5',
      secondaryColor: '#64748b',
      logo: themeLogoUrl,
      mainBackground: '#f8fafc',
      promoSlideBackground: themeHeroUrl,
      promoSlideBackgroundPosition: 'center',
      promoSlideVideo: '',
    },
  });

  const pages = [
    {
      id: 'about',
      es: {
        title: 'Nosotros',
        contentHTML:
          '<p>Página de ejemplo. Puedes editarla desde el panel de administración.</p>',
      },
      en: {
        title: 'About',
        contentHTML:
          '<p>This is a sample page. You can edit it from the dashboard.</p>',
      },
      sk: { title: 'O nás', contentHTML: '<p>Ukážková stránka.</p>' },
      cs: { title: 'O nás', contentHTML: '<p>Ukázková stránka.</p>' },
    },
    {
      id: 'contact',
      es: {
        title: 'Contacto',
        contentHTML: '<p>Usa el formulario de contacto del menú principal.</p>',
      },
      en: {
        title: 'Contact page',
        contentHTML: '<p>Use the contact form from the main menu.</p>',
      },
      sk: { title: 'Kontakt', contentHTML: '<p></p>' },
      cs: { title: 'Kontakt', contentHTML: '<p></p>' },
    },
  ];

  for (const p of pages) {
    batch.set(db.collection(COL.pages).doc(p.id), {
      titleUrl: p.id,
      dateAdded: now,
      es: p.es,
      en: p.en,
      sk: p.sk,
      cs: p.cs,
    });
  }

  const hombresSubSlugs = [
    ['hm-esenciales', 'Esenciales', 'Essentials'],
    ['hm-camisetas', 'Camisetas', 'Tees'],
    ['hm-polos', 'Polos', 'Polos'],
    ['hm-camisas', 'Camisas', 'Shirts'],
    ['hm-pantalones', 'Pantalones', 'Pants'],
    ['hm-shorts', 'Shorts', 'Shorts'],
    ['hm-buzos', 'Buzos y hoodies', 'Hoodies'],
    ['hm-chaquetas', 'Chaquetas', 'Jackets'],
    ['hm-deportivo', 'Deportivo', 'Activewear'],
  ];

  const mujeresSubSlugs = [
    ['esenciales', 'Esenciales', 'Essentials'],
    ['bodys', 'Bodys', 'Bodys'],
    ['blusas', 'Blusas', 'Blouses'],
    ['camisetas', 'Camisetas', 'Tees'],
    ['pantalones', 'Pantalones', 'Pants'],
    ['vestidos', 'Vestidos', 'Dresses'],
    ['vestidos-bano', 'Baño', 'Swim'],
    ['deportivos', 'Deportivos', 'Activewear'],
    ['enterizos', 'Enterizos', 'Jumpsuits'],
    ['buzos', 'Buzos', 'Sweats'],
    ['shorts', 'Shorts', 'Shorts'],
    ['tops', 'Tops', 'Tops'],
    ['leggins', 'Leggins', 'Leggings'],
    ['joggers', 'Joggers', 'Joggers'],
  ];

  const categories = [
    {
      titleUrl: 'en-promocion',
      virtualNav: 'products-all',
      virtualNavQuery: { promo: '1' },
      es: { title: 'En promoción', description: 'Selección destacada Aura Boutique' },
      en: { title: 'On promotion', description: 'Featured Aura Boutique picks' },
      position: 1,
      useFashion: true,
    },
    {
      titleUrl: 'moda',
      virtualNav: 'products-all',
      virtualNavQuery: {},
      es: { title: 'Moda', description: 'Catálogo Aura Boutique' },
      en: { title: 'Fashion', description: 'Aura Boutique catalog' },
      position: 2,
      useFashion: true,
    },
    {
      titleUrl: 'mujeres',
      es: { title: 'Mujeres', description: 'Moda femenina' },
      en: { title: 'Women', description: "Women's fashion" },
      position: 3,
      subCategories: mujeresSubSlugs.map(([s]) => s),
      useFashion: true,
    },
    {
      titleUrl: 'hombres',
      es: { title: 'Hombres', description: 'Moda masculina' },
      en: { title: 'Men', description: "Men's fashion" },
      position: 4,
      subCategories: hombresSubSlugs.map(([s]) => s),
      useFashion: true,
    },
    {
      titleUrl: 'lo-nuevo',
      virtualNav: 'products-all',
      virtualNavQuery: { sort: 'newest' },
      es: { title: 'Lo nuevo', description: 'Recién llegado' },
      en: { title: 'New in', description: 'Just arrived' },
      position: 5,
      useFashion: true,
    },
    {
      titleUrl: 'ofertas',
      virtualNav: 'products-all',
      virtualNavQuery: { ofertas: '1' },
      es: { title: 'Ofertas', description: 'Precios especiales' },
      en: { title: 'Sale', description: 'Special prices' },
      position: 6,
      useFashion: true,
    },
    {
      titleUrl: 'accesorios',
      es: { title: 'Accesorios', description: 'Bolsos, cinturones y joyería fina' },
      en: { title: 'Accessories', description: 'Bags, belts and fine jewelry' },
      position: 7,
      useFashion: true,
    },
    {
      titleUrl: 'calzado',
      es: { title: 'Calzado', description: 'Tacones, planos y sneakers' },
      en: { title: 'Footwear', description: 'Heels, flats and sneakers' },
      position: 8,
      useFashion: true,
    },
    {
      titleUrl: 'coleccion',
      es: { title: 'Cápsula', description: 'Piezas curadas de temporada' },
      en: { title: 'Capsule', description: 'Curated seasonal pieces' },
      position: 9,
      useFashion: true,
    },
    ...mujeresSubSlugs.map(([slug, esT, enT], i) => ({
      titleUrl: slug,
      parentTitleUrl: 'mujeres',
      menuHidden: true,
      es: { title: esT, description: 'Mujeres' },
      en: { title: enT, description: 'Women' },
      position: 110 + i,
      useFashion: true,
    })),
    ...hombresSubSlugs.map(([slug, esT, enT], i) => ({
      titleUrl: slug,
      parentTitleUrl: 'hombres',
      menuHidden: true,
      es: { title: esT, description: 'Hombres' },
      en: { title: enT, description: 'Men' },
      position: 200 + i,
      useFashion: true,
    })),
  ];

  const allowedCategoryIds = new Set(categories.map((c) => c.titleUrl));
  await purgeCategoryDocumentsNotInAllowlist(db, allowedCategoryIds);

  for (const c of categories) {
    const img = c.mainImageUrl
      ? c.mainImageUrl
      : c.useFashion
        ? fashionImg(c.position || 0)
        : pickImage(`cat-${c.titleUrl}`, 900, 600);
    const doc = {
      titleUrl: c.titleUrl,
      dateAdded: now,
      mainImage: { url: img, name: `${c.titleUrl}.jpg`, type: true },
      subCategories: c.subCategories || [],
      es: {
        title: c.es.title,
        description: c.es.description,
        visibility: true,
        menuHidden: !!c.menuHidden,
        position: c.position,
      },
      en: {
        title: c.en.title,
        description: c.en.description,
        visibility: true,
        menuHidden: !!c.menuHidden,
        position: c.position,
      },
      sk: {
        title: c.en.title,
        description: c.en.description,
        visibility: true,
        menuHidden: !!c.menuHidden,
        position: c.position,
      },
      cs: {
        title: c.en.title,
        description: c.en.description,
        visibility: true,
        menuHidden: !!c.menuHidden,
        position: c.position,
      },
    };
    if (c.parentTitleUrl) doc.parentTitleUrl = c.parentTitleUrl;
    if (c.virtualNav) doc.virtualNav = c.virtualNav;
    if (c.virtualNavQuery) doc.virtualNavQuery = c.virtualNavQuery;
    batch.set(db.collection(COL.categories).doc(c.titleUrl), doc);
  }

  const products = [
    {
      id: 'body-seamless-negro',
      tags: ['en-promocion', 'mujeres', 'bodys', 'esenciales'],
      fi: 0,
      es: langBlockProduct({
        title: 'Body seamless negro',
        description: 'Segunda piel, soporte suave. Ideal para entrenar o diario.',
        salePrice: 19900,
        regularPrice: 34900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Black seamless bodysuit',
        description: 'Second-skin fit for studio or street.',
        salePrice: 19900,
        regularPrice: 34900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'top-rib-arena',
      tags: ['en-promocion', 'mujeres', 'tops', 'esenciales'],
      fi: 1,
      es: langBlockProduct({
        title: 'Top canalé arena',
        description: 'Tacto suave, hombros descubiertos.',
        salePrice: 19900,
        regularPrice: 29900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Sand ribbed top',
        description: 'Soft rib knit, easy to layer.',
        salePrice: 19900,
        regularPrice: 29900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'leggins-seamless-vino',
      tags: ['exclusivos', 'mujeres', 'leggins', 'esenciales'],
      fi: 2,
      es: langBlockProduct({
        title: 'Leggins seamless vino',
        description: 'Cintura alta, compresión ligera.',
        salePrice: 19900,
        regularPrice: 39900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Wine seamless leggings',
        description: 'High waist, light compression.',
        salePrice: 19900,
        regularPrice: 39900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'vestido-lino-rosa',
      tags: ['mujeres', 'vestidos', 'exclusivos', 'unicolor'],
      fi: 3,
      es: langBlockProduct({
        title: 'Vestido midi lino rosa palo',
        description: 'Corte limpio, espalda cruzada. Look invitada o brunch.',
        salePrice: 189900,
        regularPrice: 239900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Blush linen midi dress',
        description: 'Clean lines, cross-back detail.',
        salePrice: 189900,
        regularPrice: 239900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'blusa-satin-champagne',
      tags: ['mujeres', 'blusas', 'exclusivos'],
      fi: 4,
      es: langBlockProduct({
        title: 'Blusa satín champagne',
        description: 'Manga abullonada, botones forrados.',
        salePrice: 129900,
        regularPrice: 159900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Champagne satin blouse',
        description: 'Statement sleeves, covered buttons.',
        salePrice: 129900,
        regularPrice: 159900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'set-blusa-falda-lino',
      tags: ['mujeres', 'blusas', 'vestidos', 'exclusivos'],
      fi: 5,
      es: langBlockProduct({
        title: 'Set blusa + falda lino',
        description: 'Coordenado listo para evento de día.',
        salePrice: 219900,
        regularPrice: 219900,
        onSale: false,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Linen blouse + skirt set',
        description: 'Day-event ready matching set.',
        salePrice: 219900,
        regularPrice: 219900,
        onSale: false,
        stock: 'On_stock',
      }),
    },
    {
      id: 'enterizo-deportivo-verde',
      tags: ['mujeres', 'enterizos', 'deportivos'],
      fi: 6,
      es: langBlockProduct({
        title: 'Enterizo deportivo niebla',
        description: 'Tela secado rápido, recortes estratégicos. Tonos neutros.',
        salePrice: 149900,
        regularPrice: 189900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Mist grey active jumpsuit',
        description: 'Quick-dry fabric, flattering seams, neutral palette.',
        salePrice: 149900,
        regularPrice: 189900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'buzo-oversized-lila',
      tags: ['mujeres', 'buzos', 'casual'],
      fi: 7,
      es: langBlockProduct({
        title: 'Buzo oversized lila',
        description: 'Rizo premium, capucha doble.',
        salePrice: 119900,
        regularPrice: 149900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Lilac oversized hoodie',
        description: 'Premium fleece, double-layer hood.',
        salePrice: 119900,
        regularPrice: 149900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'camiseta-basica-algodon',
      tags: ['mujeres', 'camisetas', 'esenciales'],
      fi: 0,
      es: langBlockProduct({
        title: 'Camiseta básica algodón pima',
        description: 'Cuello redondo reforzado, colores temporada.',
        salePrice: 49900,
        regularPrice: 69900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Pima cotton essential tee',
        description: 'Reinforced crew neck, seasonal palette.',
        salePrice: 49900,
        regularPrice: 69900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'pantalon-wide-leg-beige',
      tags: ['mujeres', 'pantalones', 'casual'],
      fi: 1,
      es: langBlockProduct({
        title: 'Pantalón wide leg beige',
        description: 'Pinzas al frente, bolsas laterales.',
        salePrice: 159900,
        regularPrice: 199900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Beige wide-leg trousers',
        description: 'Pressed pleats, side pockets.',
        salePrice: 159900,
        regularPrice: 199900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'vestido-bano-floral',
      tags: ['mujeres', 'vestidos-bano', 'exclusivos'],
      fi: 2,
      es: langBlockProduct({
        title: 'Vestido de baño floral',
        description: 'Forro completo, tirantes ajustables.',
        salePrice: 139900,
        regularPrice: 179900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Floral one-piece swimsuit',
        description: 'Full lining, adjustable straps.',
        salePrice: 139900,
        regularPrice: 179900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'jogger-rizo-crema',
      tags: ['mujeres', 'joggers', 'casual'],
      fi: 3,
      es: langBlockProduct({
        title: 'Jogger rizo crema',
        description: 'Puños y cintura elástica canalé.',
        salePrice: 99900,
        regularPrice: 129900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Cream fleece joggers',
        description: 'Ribbed cuffs and waist.',
        salePrice: 99900,
        regularPrice: 129900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'polo-pique-hombre',
      tags: ['hombres', 'hm-polos', 'hm-esenciales'],
      fi: 4,
      es: langBlockProduct({
        title: 'Polo piqué azul marino',
        description: 'Corte slim, tres botones.',
        salePrice: 89900,
        regularPrice: 119900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Navy piqué polo',
        description: 'Slim fit, three-button placket.',
        salePrice: 89900,
        regularPrice: 119900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'camiseta-oversized-hombre',
      tags: ['hombres', 'hm-camisetas', 'hm-esenciales'],
      fi: 5,
      es: langBlockProduct({
        title: 'Camiseta oversized gris',
        description: 'Algodón peinado, cuello reforzado.',
        salePrice: 59900,
        regularPrice: 79900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Oversized grey tee',
        description: 'Combed cotton, reinforced neck.',
        salePrice: 59900,
        regularPrice: 79900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'pantalon-chino-hombre',
      tags: ['hombres', 'hm-pantalones', 'hm-esenciales'],
      fi: 6,
      es: langBlockProduct({
        title: 'Pantalón chino slim arena',
        description: 'Tacto suave, bolsillos laterales. Oficina o fin de semana.',
        salePrice: 129900,
        regularPrice: 159900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Sand slim chino trousers',
        description: 'Soft hand-feel, side pockets. Office or weekend.',
        salePrice: 129900,
        regularPrice: 159900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'bermudas-lino-hombre',
      tags: ['exclusivos', 'hombres', 'hm-shorts', 'hm-esenciales'],
      fi: 7,
      es: langBlockProduct({
        title: 'Bermuda lino crudo',
        description: 'Cintura con cordón, bolsillo trasero.',
        salePrice: 19900,
        regularPrice: 79900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Off-white linen shorts',
        description: 'Drawstring waist, back pocket.',
        salePrice: 19900,
        regularPrice: 79900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'hoodie-minimal-hombre',
      tags: ['hombres', 'hm-buzos', 'exclusivos'],
      fi: 1,
      es: langBlockProduct({
        title: 'Hoodie minimal felpa gris perla',
        description: 'Corte recto, capucha doble. Pieza exclusiva de temporada.',
        salePrice: 189900,
        regularPrice: 189900,
        onSale: false,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Pearl grey minimal hoodie',
        description: 'Straight fit, double-layer hood. Seasonal exclusive.',
        salePrice: 189900,
        regularPrice: 189900,
        onSale: false,
        stock: 'On_stock',
      }),
    },
    {
      id: 'chaqueta-tecnica-hombre',
      tags: ['hombres', 'hm-chaquetas', 'hm-deportivo'],
      fi: 2,
      es: langBlockProduct({
        title: 'Chaqueta técnica ligera',
        description: 'Repelente al agua, packable. Ideal viaje o lluvia suave.',
        salePrice: 179900,
        regularPrice: 249900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Lightweight technical jacket',
        description: 'Water-resistant, packable. Travel or light rain.',
        salePrice: 179900,
        regularPrice: 249900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'camisa-oxford-hombre',
      tags: ['hombres', 'hm-camisas', 'hm-esenciales'],
      fi: 3,
      es: langBlockProduct({
        title: 'Camisa Oxford celeste',
        description: 'Cuello botón, manga larga. Look smart casual.',
        salePrice: 109900,
        regularPrice: 139900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Sky Oxford shirt',
        description: 'Button-down collar, long sleeve. Smart casual.',
        salePrice: 109900,
        regularPrice: 139900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
    {
      id: 'set-training-hombre',
      tags: ['hombres', 'hm-deportivo', 'hm-esenciales'],
      fi: 0,
      es: langBlockProduct({
        title: 'Set training top + jogger',
        description: 'Tejido de secado rápido, set coordinado.',
        salePrice: 139900,
        regularPrice: 169900,
        onSale: true,
        stock: 'On_stock',
      }),
      en: langBlockProduct({
        title: 'Training top + jogger set',
        description: 'Quick-dry knit, coordinated set.',
        salePrice: 139900,
        regularPrice: 169900,
        onSale: true,
        stock: 'On_stock',
      }),
    },
  ];

  if (!skipStorageUpload && storageBucket) {
    try {
      await ensureProductSlotsFromRemote(storageBucket, seedMedia, products);
    } catch (err) {
      console.warn(
        '  Advertencia: fotos de producto en Storage incompletas; se usarán URLs externas donde falte.',
        err && err.message ? err.message : err,
      );
    }
  }

  function locSuffix(base, suffix) {
    return {
      ...base,
      visibility: true,
      title: `${base.title} ${suffix}`,
      description: `${base.description} ${suffix}`,
      descriptionFull: (base.descriptionFull || []).map((x) => `${x} ${suffix}`),
    };
  }

  const imageSlotMod = Math.max(20, seedMedia.productByIndex.size || 0);
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const mainUrl = seedMedia.productByIndex.get(i % imageSlotMod) ?? fashionImg(p.fi ?? 0);
    const second =
      seedMedia.productByIndex.get((i + 1) % imageSlotMod) ?? fashionImg((p.fi ?? 0) + 3);
    const skBlock = locSuffix(p.en, '[SK]');
    const csBlock = locSuffix(p.en, '[CS]');
    const tagSet = new Set(
      (p.tags || []).map((t) => (t === 'exclusivos' ? 'en-promocion' : t)),
    );
    tagSet.add('moda');
    batch.set(db.collection(COL.products).doc(p.id), {
      titleUrl: p.id,
      tags: Array.from(tagSet),
      mainImage: { url: mainUrl, name: `${p.id}.jpg` },
      images: [mainUrl, second],
      colors: colorsForCatalogIndex(i),
      dateAdded: now - Math.floor(Math.random() * 8.64e7),
      _user: 'seed-script',
      es: p.es,
      en: p.en,
      sk: skBlock,
      cs: csBlock,
    });
  }

  await batch.commit();
  console.log('Seed aplicado correctamente.');
  console.log(
    `  ${products.length} productos, ${categories.length} categorías, traducciones es/en/sk/cs (demo), tema y config "default", páginas about/contact.`,
  );
  if (!skipStorageUpload && storageBucket) {
    console.log('  Imágenes de catálogo en Storage cuando hay archivos en client/src/assets/img/products/.');
  }
  if (process.argv.includes('--local-asset-urls')) {
    console.log('  Productos usan rutas /assets/img/... (--local-asset-urls).');
  }
  if (!clear) {
    console.log(
      '  (Los documentos existentes en esas colecciones se fusionaron donde el id coincide; usa --clear para vaciar antes.)',
    );
  }
  process.exit(0);
}

function runMain() {
  if (process.argv.includes('--upload-product-images')) {
    return uploadProductImagesOnly();
  }
  return main();
}

runMain().catch((e) => {
  const code = e && (e.code === 5 || String(e.message || '').includes('NOT_FOUND'));
  if (code) {
    console.error(
      '\nFirestore devolvió NOT_FOUND. Crea la base de datos en Firebase Console:',
      `\n  https://console.firebase.google.com/project/${process.env.FIREBASE_PROJECT_ID || 'TU_PROJECT'}/firestore`,
      '\nElige modo producción o de prueba y vuelve a ejecutar el seed.\n',
    );
  } else {
    console.error(e);
  }
  process.exit(1);
});

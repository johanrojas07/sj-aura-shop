export interface Product {
  _id: string;
  title?: string;
  description?: string;
  descriptionFull?: string[];
  tags?: string[];
  regularPrice?: number;
  salePrice?: number;
  titleUrl?: string;
  onSale?: boolean;
  stock?: string;
  /** Unidades en inventario (único para la tienda; se refleja en catálogo y admin). */
  stockQty?: number;
  visibility?: boolean;
  shipping?: string;
  mainImage?: { url: string; name: string };
  images?: string[];
  /** Opciones de color para listado (label + hex opcional para muestra). */
  colors?: { label: string; hex?: string }[];
  _user?: string;
  dateAdded?: number;
  [key: string]: unknown;
}

export interface ProductsWithPagination {
  all: Product[];
  total: number;
  limit: number;
  page: number;
  pages: number;
  /** Precio venta mín/máx del listado filtrado (antes del filtro por precio), para el slider en cliente. */
  minPrice?: number;
  maxPrice?: number;
}

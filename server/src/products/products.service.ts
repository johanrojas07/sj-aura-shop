import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';

import { GetProductsDto } from './dto/get-products';
import { Product, ProductsWithPagination } from './models/product.model';
import { GetProductDto } from './dto/get-product';
import { Category } from './models/category.model';
import { EshopUser } from '../auth/models/user.model';
import { prepareProduct } from '../shared/utils/prepareUtils';
import { languages, paginationLimit } from '../shared/constans';
import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';

@Injectable()
export class ProductsService {
  constructor(private readonly firebase: FirebaseService) {}

  private productsCol() {
    return this.firebase.firestore.collection(COL.products);
  }

  private categoriesCol() {
    return this.firebase.firestore.collection(COL.categories);
  }

  async getProducts(
    getProductsDto: GetProductsDto,
    lang: string,
  ): Promise<ProductsWithPagination> {
    const empty: ProductsWithPagination = {
      all: [],
      total: 0,
      limit: paginationLimit,
      page: 1,
      pages: 1,
      minPrice: 0,
      maxPrice: 0,
    };
    return this.firebase.readQuietly('products.getProducts', async () => {
      const { page, sort, category, categories, search, maxPrice, minPrice, ofertas, promo } =
        getProductsDto;
      const snap = await this.productsCol().get();
      let list = snap.docs
        .map((d) => docWithId<Product>(d)!)
        .filter((p) => !!(p[lang] as { visibility?: boolean })?.visibility);

      if (search) {
        const s = search.toLowerCase();
        list = list.filter((p) => (p.titleUrl || '').toLowerCase().includes(s));
      }
      const multiCats = (categories || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (multiCats.length) {
        const tagFilters = await this.expandCategorySlugsForFilter(multiCats);
        list = list.filter((p) =>
          tagFilters.some((c) =>
            (p.tags || []).some((t) => String(t).toLowerCase().includes(c)),
          ),
        );
      } else if (category) {
        const tagFilters = await this.expandCategorySlugsForFilter([
          category.toLowerCase(),
        ]);
        list = list.filter((p) =>
          tagFilters.some((c) =>
            (p.tags || []).some((t) => String(t).toLowerCase().includes(c)),
          ),
        );
      }
      if (ofertas === '1' || ofertas === 'true') {
        list = list.filter(
          (p) => !!(p[lang] as { onSale?: boolean })?.onSale,
        );
      }
      if (promo === '1' || promo === 'true') {
        list = list.filter((p) =>
          (p.tags || []).some(
            (t) => String(t).toLowerCase() === 'en-promocion',
          ),
        );
      }
      const priceBounds = this.salePriceBoundsForLang(list, lang);
      if (minPrice != null && String(minPrice).length) {
        const mip = parseFloat(String(minPrice));
        if (!Number.isNaN(mip)) {
          list = list.filter(
            (p) =>
              ((p[lang] as { salePrice?: number })?.salePrice ?? 0) >= mip,
          );
        }
      }
      if (maxPrice) {
        const mp = parseFloat(String(maxPrice));
        list = list.filter(
          (p) =>
            ((p[lang] as { salePrice?: number })?.salePrice ?? 0) <= mp,
        );
      }

      const sortKey = this.prepareSort(sort, lang);
      list = this.sortProducts(list, sortKey, lang);

      const pageNum = Math.max(1, parseFloat(page) || 1);
      const total = list.length;
      const limit = paginationLimit;
      const pages = Math.max(1, Math.ceil(total / limit));
      const slice = list.slice((pageNum - 1) * limit, pageNum * limit);

      return {
        all: slice.map((product) => prepareProduct(product, lang, true)),
        total,
        limit,
        page: pageNum,
        pages,
        minPrice: priceBounds.min,
        maxPrice: priceBounds.max,
      };
    }, empty);
  }

  /** Min/max `salePrice` en el locale actual, sobre el listado ya filtrado por categoría/ofertas (sin filtro por precio). */
  private salePriceBoundsForLang(
    list: Product[],
    lang: string,
  ): { min: number; max: number } {
    if (!list.length) {
      return { min: 0, max: 0 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of list) {
      const sp = Number((p[lang] as { salePrice?: number })?.salePrice ?? 0);
      if (!Number.isFinite(sp)) {
        continue;
      }
      if (sp < min) {
        min = sp;
      }
      if (sp > max) {
        max = sp;
      }
    }
    if (min === Infinity || max === -Infinity) {
      return { min: 0, max: 0 };
    }
    return { min, max };
  }

  private sortProducts(
    list: Product[],
    sortKey: string,
    lang: string,
  ): Product[] {
    const copy = [...list];
    const desc = sortKey.startsWith('-');
    const key = desc ? sortKey.slice(1) : sortKey;
    copy.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      if (key === 'dateAdded') {
        va = (a.dateAdded as number) ?? 0;
        vb = (b.dateAdded as number) ?? 0;
      } else if (key.includes('.')) {
        const [part, sub] = key.split('.');
        va = (a[part] as Record<string, number>)?.[sub] ?? 0;
        vb = (b[part] as Record<string, number>)?.[sub] ?? 0;
      } else {
        va = (a as Record<string, number>)[key] ?? 0;
        vb = (b as Record<string, number>)[key] ?? 0;
      }
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return desc ? -cmp : cmp;
    });
    return copy;
  }

  /**
   * Si un slug es categoría padre con `subCategories`, el filtro debe incluir
   * padre + hijas (los productos suelen ir etiquetados por subcategoría).
   */
  private async expandCategorySlugsForFilter(
    requested: string[],
  ): Promise<string[]> {
    const normalized = requested
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (!normalized.length) {
      return [];
    }
    const snap = await this.categoriesCol().get();
    const subsByParent = new Map<string, string[]>();
    for (const d of snap.docs) {
      const raw = d.data() as Category & { titleUrl?: string };
      const tu = String(raw.titleUrl ?? d.id ?? '')
        .trim()
        .toLowerCase();
      if (!tu) {
        continue;
      }
      const subs = (raw.subCategories ?? [])
        .map((x) => String(x).trim().toLowerCase())
        .filter(Boolean);
      subsByParent.set(tu, subs);
    }
    const out = new Set<string>();
    for (const slug of normalized) {
      out.add(slug);
      const subs = subsByParent.get(slug);
      if (subs?.length) {
        for (const s of subs) {
          out.add(s);
        }
      }
    }
    return [...out];
  }

  async getCategories(lang: string): Promise<Category[]> {
    return this.firebase.readQuietly('products.getCategories', async () => {
      const snap = await this.categoriesCol().get();
      const categories = snap.docs
        .map((d) => docWithId<Category>(d)!)
        .filter((c) => !!(c[lang] as { visibility?: boolean })?.visibility)
        .sort(
          (a, b) =>
            ((a[lang] as { position?: number })?.position ?? 0) -
            ((b[lang] as { position?: number })?.position ?? 0),
        );
      return this.prepareCategories(categories, lang);
    }, []);
  }

  async getProductsTitles(search: string, lang: string): Promise<string[]> {
    return this.firebase.readQuietly('products.getProductsTitles', async () => {
      const s = (search || '').toLowerCase().trim();
      if (!s || s === 'empty___query') {
        return [];
      }
      const snap = await this.productsCol().get();
      return snap.docs
        .map((d) => docWithId<Product>(d)!)
        .filter((p) => {
          const slug = (p.titleUrl || '').toLowerCase().includes(s);
          const loc = (lang && p[lang]) as { title?: string } | undefined;
          const title = (loc?.title || '').toLowerCase();
          return slug || title.includes(s);
        })
        .map((p) => p.titleUrl!);
    }, []);
  }

  /** Vista previa global: título, imagen, precio, id (para carrito). */
  async getProductsSearchPreview(
    search: string,
    lang: string,
    limit = 10,
  ): Promise<Product[]> {
    return this.firebase.readQuietly(
      'products.getProductsSearchPreview',
      async () => {
        const s = (search || '').toLowerCase().trim();
        if (!s || s === 'empty___query') {
          return [];
        }
        const lim = Math.min(Math.max(1, limit), 24);
        const snap = await this.productsCol().get();
        const hits = snap.docs
          .map((d) => docWithId<Product>(d)!)
          .filter((p) => !!(p[lang] as { visibility?: boolean })?.visibility)
          .filter((p) => {
            const slug = (p.titleUrl || '').toLowerCase().includes(s);
            const loc = p[lang] as { title?: string } | undefined;
            const title = (loc?.title || '').toLowerCase();
            return slug || title.includes(s);
          })
          .slice(0, lim);
        return hits.map((p) => prepareProduct(p, lang, true));
      },
      [],
    );
  }

  async getProductByName(
    name: string,
    getProductDto: GetProductDto,
  ): Promise<Product> {
    const { lang } = getProductDto;
    const q = await this.productsCol().where('titleUrl', '==', name).limit(1).get();
    if (q.empty) {
      throw new NotFoundException(`Product with title ${name} not found`);
    }
    const found = docWithId<Product>(q.docs[0])!;
    return lang ? prepareProduct(found, lang) : found;
  }

  async addProduct(productReq: Record<string, unknown>, user: EshopUser): Promise<void> {
    const titleUrl = productReq.titleUrl as string;
    const q = await this.productsCol().where('titleUrl', '==', titleUrl).limit(1).get();
    if (!q.empty) {
      throw new BadRequestException(
        'Ya existe un producto con ese Title URL (slug). El slug debe ser único; cambia el identificador en la URL.',
      );
    }
    const newProduct = {
      ...productReq,
      _user: user._id,
      dateAdded: Date.now(),
      images: (productReq.images as string[]) || [],
    };
    const ref = await this.productsCol().add(newProduct);
    const created = await ref.get();
    await this.addCategory(docWithId<Product>(created)!);
  }

  async editProduct(productReq: Record<string, unknown>): Promise<void> {
    const titleUrl = productReq.titleUrl as string;
    const q = await this.productsCol().where('titleUrl', '==', titleUrl).limit(1).get();
    if (q.empty) {
      throw new NotFoundException(`Product with title ${titleUrl} not found`);
    }
    await q.docs[0].ref.set(productReq, { merge: true });
    await this.addCategory(productReq as Product);
  }

  async deleteProductByName(titleUrl: string): Promise<void> {
    const q = await this.productsCol().where('titleUrl', '==', titleUrl).limit(1).get();
    if (q.empty) {
      throw new NotFoundException(`Product with title ${titleUrl} not found`);
    }
    await q.docs[0].ref.delete();
  }

  async getAllProducts(lang: string): Promise<Product[]> {
    const snap = await this.productsCol().get();
    return snap.docs.map((d) =>
      prepareProduct(docWithId<Product>(d)!, lang),
    );
  }

  async getAllCategories(lang: string) {
    const snap = await this.categoriesCol().get();
    const categories = snap.docs.map((d) => docWithId<Category>(d)!);
    const psnap = await this.productsCol().get();
    const products = psnap.docs.map((d) => docWithId<Product>(d)!);
    return this.prepareAllCategories(categories, products);
  }

  async editCategory(categoryReq: Record<string, unknown>): Promise<void> {
    const titleUrl = categoryReq.titleUrl as string;
    const ref = this.categoriesCol().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...categoryReq, dateAdded: Date.now() });
      return;
    }
    await ref.set(categoryReq, { merge: true });
  }

  async deleteCategoryByName(titleUrl: string): Promise<void> {
    const ref = this.categoriesCol().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new NotFoundException(`Category with title ${titleUrl} not found`);
    }
    await ref.delete();
    const psnap = await this.productsCol().get();
    const products = psnap.docs.map((d) => docWithId<Product>(d)!);
    await this.removeCategoryFromProducts(titleUrl, products);
  }

  /** Para admin: añade URL de imagen al array `images` del producto. */
  async appendProductImage(titleUrl: string, image: string): Promise<Product | null> {
    const q = await this.productsCol().where('titleUrl', '==', titleUrl).limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    await doc.ref.update({ images: FieldValue.arrayUnion(image) });
    const u = await doc.ref.get();
    return docWithId<Product>(u)!;
  }

  async removeProductImage(titleUrl: string, image: string): Promise<Product | null> {
    const q = await this.productsCol().where('titleUrl', '==', titleUrl).limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    await doc.ref.update({ images: FieldValue.arrayRemove(image) });
    const u = await doc.ref.get();
    return docWithId<Product>(u)!;
  }

  async getProductByIdForCart(id: string): Promise<Product | null> {
    return this.firebase.readQuietly('products.getProductByIdForCart', async () => {
      const byId = await this.productsCol().doc(id).get();
      if (byId.exists) {
        return docWithId<Product>(byId)!;
      }
      const q = await this.productsCol().where('titleUrl', '==', id).limit(1).get();
      if (!q.empty) {
        return docWithId<Product>(q.docs[0])!;
      }
      return null;
    }, null);
  }

  private prepareSort(sortParams: string, lang: string): string {
    switch (sortParams) {
      case 'newest':
        return `-dateAdded`;
      case 'oldest':
        return `dateAdded`;
      case 'priceasc':
        return `${lang}.salePrice`;
      case 'pricedesc':
        return `-${lang}.salePrice`;
      default:
        return `-dateAdded`;
    }
  }

  private prepareCategories = (categories: Category[], lang: string): Category[] => {
    return categories.map((category) => {
      const raw = category as Category & {
        parentTitleUrl?: string;
        virtualNav?: string;
        virtualNavQuery?: Record<string, string>;
      };
      return {
        titleUrl: category.titleUrl,
        mainImage: category.mainImage,
        dateAdded: category.dateAdded,
        subCategories: category.subCategories,
        parentTitleUrl: raw.parentTitleUrl ?? undefined,
        virtualNav: raw.virtualNav ?? undefined,
        virtualNavQuery: raw.virtualNavQuery ?? undefined,
        title: category[lang]
          ? (category[lang] as { title: string }).title
          : category.titleUrl,
        description: category[lang]
          ? (category[lang] as { description: string }).description
          : '',
        visibility: category[lang]
          ? (category[lang] as { visibility: boolean }).visibility
          : false,
        menuHidden: category[lang]
          ? (category[lang] as { menuHidden: boolean }).menuHidden
          : false,
        position: category[lang]
          ? (category[lang] as { position?: number }).position ?? 0
          : 0,
      };
    });
  };

  private addCategory = async (product: Product): Promise<void> => {
    const tags = product.tags || [];
    for (const category of tags.filter((cat, i, arr) => arr.indexOf(cat) === i)) {
      const titleUrl = category.replace(/ /g, '_').toLowerCase();
      const addCategory = {
        titleUrl,
        mainImage: {
          url: product.mainImage!.url,
          name: product.mainImage!.name,
        },
        dateAdded: Date.now(),
        ...languages.reduce(
          (prev, lang) => ({
            ...prev,
            [lang]: {
              title: category,
              description: '',
              visibility: tags.includes(category),
            },
          }),
          {},
        ),
      };
      const ref = this.categoriesCol().doc(titleUrl);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(addCategory);
      }
    }
  };

  private prepareAllCategories = (categories: Category[], products: Product[]) => {
    return categories.map((category) => {
      const productsWithCategory = products
        .filter((product) => !!(product.tags || []).includes(category.titleUrl))
        .map((product) => product.titleUrl!);
      return { category, productsWithCategory };
    });
  };

  private removeCategoryFromProducts = async (
    category: string,
    products: Product[],
  ): Promise<void> => {
    for (const product of products) {
      if (!(product.tags || []).includes(category)) {
        continue;
      }
      const q = await this.productsCol().where('titleUrl', '==', product.titleUrl).limit(1).get();
      if (q.empty) continue;
      const productReq = {
        ...product,
        tags: (product.tags || []).filter((tag) => tag !== category),
      };
      await q.docs[0].ref.set(productReq, { merge: true });
    }
  };
}

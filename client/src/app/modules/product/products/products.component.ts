import { MatSnackBar } from '@angular/material/snack-bar';
import { map, distinctUntilChanged, filter, take, skip } from 'rxjs/operators';
import { Component, ChangeDetectionStrategy, OnDestroy, Signal, computed } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { TranslateService } from '../../../services/translate.service';
import { languages, sortOptions } from '../../../shared/constants';
import { Product, Category, Pagination } from '../../../shared/models';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { CartDrawerService } from '../../../services/cart-drawer.service';
import { SITE_BRAND_NAME } from '../../../shared/site-media.defaults';

/** Slugs de categoría desde `?categories=a,b,c`. */
function parseCategoryQueryParam(raw: unknown): string[] {
  if (raw == null || raw === '') {
    return [];
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Component({
    selector: 'app-products',
    templateUrl: './products.component.html',
    styleUrls: ['./products.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ProductsComponent implements OnDestroy {
  products: Signal<Product[]>;
  cartIds: Signal<{ [productID: string]: number }>;
  loadingProducts: Signal<boolean>;
  categories: Signal<Category[]>;
  subCategories: Signal<Category[]>;
  pagination: Signal<Pagination>;
  category: Signal<string>;
  categoryInfo: Signal<Category>;
  filterPrice: Signal<number>;
  filterPriceMin: Signal<number>;
  maxPrice: Signal<number>;
  minPrice: Signal<number>;
  page: Signal<number>;
  sortBy: Signal<string>;
  currency: Signal<string>;
  lang: Signal<string>;
  categoriesSub: Subscription;
  productsSub: Subscription;
  sortOptions = sortOptions;
  sidebarOpened = false;

  /** Slugs en `?categories=` (puede estar vacío aunque haya categoría en la ruta). */
  readonly categoryQueryFilters: Signal<string[]>;

  /**
   * Slugs que pintan filtros y chips: prioriza `?categories=`; si no hay, usa `:category` de la ruta.
   */
  readonly effectiveCategorySlugs: Signal<string[]>;

  readonly hasActiveCatalogFilters: Signal<boolean>;

  /** Número de criterios activos (cada categoría cuenta 1 + precio máx. si aplica). */
  readonly activeFilterCount: Signal<number>;

  readonly component = 'productsComponent';

  constructor(
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private meta: Meta,
    private title: Title,
    private translate: TranslateService,
    private cartDrawer: CartDrawerService,
  ) {
    this.category = toSignal(this.route.params.pipe(
      map((params) => params['category'])
    ));
    this.page = toSignal(this.route.queryParams.pipe(
      map((params) => parseFloat(params['page']))
    ));
    this.sortBy = toSignal(this.route.queryParams.pipe(
      map((params) => params['sort'])
    ));
    this.lang = toSignal(
      this.translate.getLang$().pipe(map((l: string) => (l && String(l).trim()) || languages[0])),
      { initialValue: languages[0] },
    );

    this.categoryQueryFilters = toSignal(
      this.route.queryParams.pipe(
        map((p) => parseCategoryQueryParam(p['categories'])),
        distinctUntilChanged((a, b) => a.join('\0') === b.join('\0')),
      ),
      { initialValue: [] },
    );

    this.effectiveCategorySlugs = computed(() => {
      const q = this.categoryQueryFilters();
      if (q.length > 0) {
        return q;
      }
      const c = this.category();
      return c ? [c] : [];
    });

    this.maxPrice = this.selectors.maxPrice;
    this.minPrice = this.selectors.minPrice;
    this.filterPrice = this.selectors.priceFilter;
    this.filterPriceMin = this.selectors.priceFilterMin;

    this.hasActiveCatalogFilters = computed(
      () =>
        this.effectiveCategorySlugs().length > 0 ||
        (this.filterPrice() ?? 0) > 0 ||
        (this.filterPriceMin() ?? 0) > 0,
    );

    this.activeFilterCount = computed(() => {
      const nCat = this.effectiveCategorySlugs().length;
      const nPrice =
        (this.filterPrice() ?? 0) > 0 || (this.filterPriceMin() ?? 0) > 0 ? 1 : 0;
      return nCat + nPrice;
    });
    this.loadingProducts = this.selectors.loadingProducts;
    this.products = this.selectors.products;
    this.cartIds = computed(() => {
      const cart = this.selectors.cart();
      if (!cart) {
        return {};
      }
      return cart.items && cart.items.length ? cart.items.reduce((prev, curr) => ({ ...prev, [curr.id]: curr.qty }), {}) : {}
     }
    );

    this.title.setTitle(SITE_BRAND_NAME);
    this.meta.updateTag({
      name: 'description',
      content:
        'SJ AURA — catálogo de moda y accesorios. Envío, tallas y novedades en tu tienda online.',
    });

    this.categories = this.selectors.categories;
    this.pagination = this.selectors.pagination;
    this.currency = this.selectors.currency;
    this.categoryInfo = computed(() => this.categories().find(cat => cat.titleUrl === this.category()));
    this.subCategories = computed(() => this.categories().filter((cat) => this.categoryInfo() ? this.categoryInfo().subCategories.includes(cat.titleUrl) : false));

    this._loadCategories();
    this._loadProducts();
  }

  /** Título legible para un slug de categoría (chips de filtros). */
  categoryTitle(slug: string): string {
    const c = this.categories().find((x) => x.titleUrl === slug);
    return (c?.title || slug).trim();
  }

  applyCategoryFilters(slugs: string[]): void {
    const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
    this.router.navigate(['/' + this.lang() + '/product/all'], {
      queryParams: {
        categories: unique.length ? unique.join(',') : null,
        page: 1,
        sort: this.sortBy() || 'newest',
      },
      queryParamsHandling: 'merge',
    });
    this.store.updatePosition({ productsComponent: 0 });
  }

  removeCategoryFilter(slug: string): void {
    const next = this.effectiveCategorySlugs().filter((s) => s !== slug);
    this.applyCategoryFilters(next);
  }

  clearCategoryFiltersOnly(): void {
    this.applyCategoryFilters([]);
  }

  clearPriceFilterOnly(): void {
    this.store.filterPrice(0);
    this.store.updatePosition({ productsComponent: 0 });
  }

  clearAllFilters(): void {
    this.store.filterPrice(0);
    this.router.navigate(['/' + this.lang() + '/product/all'], {
      queryParams: {
        categories: null,
        page: 1,
        sort: this.sortBy() || 'newest',
      },
      queryParamsHandling: 'merge',
    });
    this.store.updatePosition({ productsComponent: 0 });
  }

  addToCart(id: string): void {
    this.cartDrawer.open();
    this.store.addToCart('?id=' + id);

    this.translate.getTranslations$()
      .pipe(map(translations => translations
        ? { message: translations['ADDED_TO_CART'] || 'Producto agregado al carrito', action: translations['TO_CART'] || 'Ver bolsa' }
        : { message: 'Producto agregado al carrito', action: 'Ver bolsa' }
        ), take(1))
      .subscribe(({ message, action }) => {
        const snackBarRef = this.snackBar.open(message, action, {
          duration: 3800,
          panelClass: ['eshop-toast'],
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
        snackBarRef.onAction().pipe(take(1)).subscribe(() => this.cartDrawer.open());
      });
  }

  removeFromCart(id: string): void {
    this.store.removeFromCart('?id=' + id);
  }

  priceRange(price: number): void {
    if (this.filterPrice() !== price) {
      this.store.filterPrice(price);
    }
  }

  /** Rango Desde / Hasta (catálogo productos con doble thumb). */
  priceRangeSpan(range: { start: number; end: number }): void {
    this.store.filterPriceRange(range.start, range.end);
  }

  changeCategory(): void {
    this.store.updatePosition({ productsComponent: 0 });
  }

  changePage(page: number): void {
    if (this.category()) {
      this.router.navigate(['/' + this.lang() + '/product/category/' + this.category()], {
        queryParams: { sort: this.sortBy() || 'newest', page: page || 1 },
        queryParamsHandling: 'merge',
      });
    } else {
      this.router.navigate(['/' + this.lang() + '/product/all'], {
        queryParams: { sort: this.sortBy() || 'newest', page: page || 1 },
        queryParamsHandling: 'merge',
      });
    }
    this.store.updatePosition({ productsComponent: 0 });
  }

  changeSort(sort: string): void {
    if (this.category()) {
      this.router.navigate(['/' + this.lang() + '/product/category/' + this.category()], {
        queryParams: { sort , page: this.page() || 1 },
        queryParamsHandling: 'merge',
      });
    } else {
      this.router.navigate(['/' + this.lang() + '/product/all'], {
        queryParams: { sort, page: this.page() || 1 },
        queryParamsHandling: 'merge',
      });
    }
    this.store.updatePosition({ productsComponent: 0 });
  }

  toggleSidebar() {
    this.sidebarOpened = !this.sidebarOpened;
  }

  ngOnDestroy(): void {
    this.categoriesSub.unsubscribe();
    this.productsSub.unsubscribe();
  }

  private _loadCategories(): void {
    if (!this.categories()?.length) {
      this.store.getCategories(this.lang());
    }

    this.categoriesSub = toObservable(this.lang).pipe(distinctUntilChanged(), skip(1)).subscribe((lang: string) => {
      this.store.getCategories(lang);
    });
  }

  private _loadProducts(): void {
    this.productsSub = combineLatest([
      toObservable(this.lang).pipe(distinctUntilChanged()),
      toObservable(this.category).pipe(distinctUntilChanged()),
      toObservable(this.filterPrice).pipe(distinctUntilChanged()),
      toObservable(this.filterPriceMin).pipe(distinctUntilChanged()),
      this.route.queryParams.pipe(
        map((params) => ({
          page: params['page'],
          sort: params['sort'],
          ofertas: params['ofertas'],
          promo: params['promo'],
          minPrice: params['minPrice'],
          categories: params['categories'],
        })),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      ),
    ]).subscribe(
      ([lang, category, filterPrice, filterPriceMin, { page, sort, ofertas, promo, minPrice, categories }]) => {
        const minPUrl = minPrice ? parseFloat(String(minPrice)) : undefined;
        const minPStore = filterPriceMin > 0 ? filterPriceMin : undefined;
        let effMin: number | undefined;
        if (minPUrl != null && !Number.isNaN(minPUrl) && minPStore != null) {
          effMin = Math.max(minPUrl, minPStore);
        } else {
          effMin = minPStore ?? minPUrl;
        }
        const cat = category || undefined;
        const virtualFilters = !cat;
        const multiSlugs = parseCategoryQueryParam(categories);
        const useMulti = multiSlugs.length > 0;
        this.store.getProducts({
          lang,
          ...(useMulti
            ? { categories: multiSlugs }
            : cat
              ? { category: cat }
              : {}),
          ...(Number(filterPrice) > 0 ? { maxPrice: filterPrice } : {}),
          page: page || 1,
          sort: sort || 'newest',
          ...(virtualFilters && ofertas ? { ofertas: String(ofertas) } : {}),
          ...(virtualFilters && promo ? { promo: String(promo) } : {}),
          ...(effMin != null && !Number.isNaN(Number(effMin)) && Number(effMin) > 0
            ? { minPrice: effMin }
            : {}),
        });
      },
    );
  }
}

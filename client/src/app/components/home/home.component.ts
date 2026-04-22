import { CommonModule } from '@angular/common';
import { map, distinctUntilChanged, filter, take, skip, withLatestFrom, delay } from 'rxjs/operators';
import { Component, ChangeDetectionStrategy, OnDestroy, Signal, computed, AfterViewInit, ViewChild, ElementRef, Inject, DOCUMENT, effect } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, Subscription, of } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { TranslateService } from '../../services/translate.service';
import { languages, sortOptions } from '../../shared/constants';

import { Product, Category, Pagination, Cart, Config } from '../../shared/models';
import { CarouselComponent } from '../../shared/components/carousel/carousel.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../pipes/price.pipe';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { CategoriesListComponent } from '../../shared/components/categories-list/categories-list.component';
import { ProductContentComponent } from '../../shared/components/product-content/product-content.component';
import { ProductsListComponent } from '../../shared/components/products-list/products-list.component';
import { RecentProductsStripComponent } from '../../shared/components/recent-products-strip/recent-products-strip.component';
import { SignalStore } from '../../store/signal.store';
import { SignalStoreSelectors } from '../../store/signal.store.selectors';
import { ThemeService } from '../../services/theme.service';
import { SITE_BRAND_NAME } from '../../shared/site-media.defaults';
import { CartDrawerService } from '../../services/cart-drawer.service';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    imports: [CommonModule, MatSnackBarModule, CategoriesListComponent, CarouselComponent, ProductContentComponent, ProductsListComponent, RecentProductsStripComponent, PaginationComponent, RouterLink, MatProgressBarModule, MatProgressSpinnerModule, TranslatePipe, PriceFormatPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  /** Nombre de marca en el hero (kicker); título y meta siguen usándolo. */
  readonly siteBrandName = SITE_BRAND_NAME;

  products: Signal<Product[]>;
  cartIds: Signal<{ [productID: string]: number }>;
  cart: Signal<Cart>;
  loadingProducts: Signal<boolean>;
  categories: Signal<Category[]>;
  pagination: Signal<Pagination>;
  category: Signal<string>;
  filterPrice: Signal<number>;
  maxPrice: Signal<number>;
  minPrice: Signal<number>;
  page: Signal<number>;
  sortBy: Signal<string>;
  currency: Signal<string>;
  lang: Signal<string>;
  categoriesSub: Subscription;
  productsSub: Subscription;
  video = null;

  readonly component = 'homeComponent';

  /** Token en `announcementChipKeys` (config) para el chip con umbral de envío + precio. */
  static readonly ANNOUNCEMENT_SHIPPING_TOKEN = '__SHIPPING__';

  /** Expuesto al template para comparar con `chipKey`. */
  readonly shippingChipToken = HomeComponent.ANNOUNCEMENT_SHIPPING_TOKEN;

  /** Orden de chips: Firestore `configs/default` → `es|en.announcementChipKeys`; si no hay, demo. */
  announcementChipKeys: Signal<string[]>;

  /** 3 productos por slide en pantallas anchas; 2 en las demás (BreakpointObserver). */
  readonly heroChunkSize: Signal<number>;
  readonly heroSpotlightSlides: Signal<Product[][]>;

  @ViewChild('videoRef') private videoRef: ElementRef;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private meta: Meta,
    private title: Title,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    private themeService: ThemeService,
    private cartDrawer: CartDrawerService,
    private readonly breakpointObserver: BreakpointObserver,
    @Inject(DOCUMENT)
    private _document: Document,
  ) {
    this.category = toSignal(this.route.params.pipe(
      map((params) => params['category']),
    ));
    this.page = toSignal(this.route.queryParams.pipe(
      map((params) => params['page']),
      map((page) => parseFloat(page))
    ));
    this.sortBy = toSignal(this.route.queryParams.pipe(
      map((params) => params['sort'])
    ));
    this.lang = toSignal(
      this.translate.getLang$().pipe(map((l: string) => (l && String(l).trim()) || languages[0])),
      { initialValue: languages[0] },
    );
    this.cart = this.selectors.cart;

    this.announcementChipKeys = computed(() => {
      const list = this.selectors.configs();
      const def = Array.isArray(list)
        ? list.find((c: Config) => c.titleUrl === 'default' && c.active)
        : undefined;
      const lang = this.lang() || 'es';
      const locale = (def?.[lang] ?? def?.['es']) as Record<string, unknown> | undefined;
      const raw = locale?.['announcementChipKeys'];
      if (Array.isArray(raw) && raw.length) {
        return raw.filter((k): k is string => typeof k === 'string');
      }
      return [
        'Home_promo',
        'ANNOUNCE_BAR_MID',
        'ANNOUNCE_BAR_FLASH',
        HomeComponent.ANNOUNCEMENT_SHIPPING_TOKEN,
        'ANNOUNCE_BAR_NOTE',
      ];
    });

    effect(() => {
      const c = this.cart();
      const root = this._document.documentElement;
      root.style.setProperty('--site-announcement-height', c ? '2.5rem' : '0px');
    });
    this.maxPrice = this.selectors.maxPrice;
    this.minPrice =  this.selectors.minPrice;
    this.filterPrice = this.selectors.priceFilter;
    this.loadingProducts =  this.selectors.loadingProducts;
    this.products =  this.selectors.products;

    this.heroChunkSize = toSignal(
      this.breakpointObserver.observe('(min-width: 1100px)').pipe(map((r) => (r.matches ? 3 : 2))),
      { initialValue: 2 },
    );

    /**
     * Slides del carrusel: trozos de 3 o 2 productos según ancho; hasta 3 slides (chunk×3 ítems).
     */
    this.heroSpotlightSlides = computed(() => {
      const chunk = this.heroChunkSize();
      const maxItems = chunk * 3;
      const list = (this.products() || []).slice(0, maxItems);
      const slides: Product[][] = [];
      for (let i = 0; i < list.length; i += chunk) {
        slides.push(list.slice(i, i + chunk));
      }
      return slides;
    });

    this.cartIds = computed(() => {
      if (!this.cart()) {
          return {};
        }
        return this.cart().items && this.cart().items.length ? this.cart().items.reduce((prev, curr) => ({ ...prev, [curr.id]: curr.qty }), {}) : {}
      }
    );

    this.title.setTitle(SITE_BRAND_NAME);
    this.meta.updateTag({
      name: 'description',
      content:
        'SJ AURA — moda y accesorios. Compra online con envío y novedades.',
    });

    this.categories = this.selectors.categories;
    this.pagination = this.selectors.pagination;
    this.currency = this.selectors.currency;
    this.video = this.themeService.video;

    this._loadCategories();
    this._loadProducts();

    this.store.getConfigs();
  }

  announcementChipClass(key: string): string {
    const base = 'announcement-bar__chip';
    if (key === HomeComponent.ANNOUNCEMENT_SHIPPING_TOKEN) {
      return `${base} ${base}--soft home-promo-shipping`;
    }
    if (key === 'Home_promo') {
      return `${base} ${base}--soft home-promo-basic`;
    }
    if (key.startsWith('ANNOUNCE_BAR_')) {
      return `${base} ${base}--accent`;
    }
    return `${base} ${base}--soft`;
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

  changePage(page: number): void {
    if (this.category()) {
      this.router.navigate(['/' + this.lang() + '/product/category/' + this.category()], {
        queryParams: { sort: this.sortBy() || 'newest', page: page || 1 },
      });
    } else {
      this.router.navigate(['/' + this.lang() + '/product/all'], {
        queryParams: { sort: this.sortBy() || 'newest', page: page || 1 },
      });
    }
    this.store.updatePosition({ productsComponent: 0 });
  }

  ngAfterViewInit() {
    of('delay').pipe(
      delay(100),
      take(1),
    ).subscribe(() => {
      const vid = this.videoRef?.nativeElement as HTMLVideoElement;
      if (vid) {
        vid.muted = true; // required in most browsers
        vid.play().catch(err => console.log('Autoplay blocked', err));
      }
      this._document.getElementById('header-shell')?.classList?.add("transparent");
      this._document.getElementById('main-content')?.classList?.add("transparent");
    });
  }

  ngOnDestroy(): void {
    this.categoriesSub.unsubscribe();
    this.productsSub.unsubscribe();
    this._document.documentElement.style.setProperty('--site-announcement-height', '0px');
    this._document.documentElement.classList.remove('eshop-home-carousel-product');
    this._document.getElementById('header-shell')?.classList?.remove("transparent");
    this._document.getElementById('main-content')?.classList?.remove("transparent");
  }

  /** Si el enlace del CMS es `#` o vacío, el CTA del hero usa la vitrina de productos. */
  isDefaultHeroPromoLink(link: string | null | undefined): boolean {
    if (link == null) {
      return true;
    }
    const t = String(link).trim();
    return t === '' || t === '#';
  }

  /** Track estable para @for de slides de vitrina. */
  spotlightSlideTrack(slide: Product[]): string {
    return slide.map((p) => p._id || p.titleUrl).join('\0');
  }

  /** Slide 0 = hero; slides ≥1 = vitrina (2 o 3 productos según pantalla). */
  onHeroCarouselSlide(index: number): void {
    const html = this._document.documentElement;
    if (index > 0) {
      html.classList.add('eshop-home-carousel-product');
    } else {
      html.classList.remove('eshop-home-carousel-product');
    }
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
      this.route.queryParams.pipe(
        map((params) => ({ page: params['page'], sort: params['sort'] })),
        distinctUntilChanged()
      ),
    ]).subscribe(([lang, category, filterPrice, { page, sort }]) => {
      this.store.getProducts({ lang, category, maxPrice: filterPrice, page: page || 1, sort: sort || 'newest' });
    });
  }
}

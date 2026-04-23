import { debounceTime, take, delay, distinctUntilChanged, filter, map } from 'rxjs/operators';
import { Component, computed, Inject, OnInit, PLATFORM_ID, Signal, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, of } from 'rxjs';

import { TranslateService } from '../../../services/translate.service';
import { languages, currencyLang } from '../../../shared/constants';
import { Cart, Category, User, Product } from '../../../shared/models';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../../pipes/price.pipe';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { CartDrawerService } from '../../../services/cart-drawer.service';
import { NavShopMenuComponent } from './nav-shop-menu.component';

import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';

import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { megaChildrenFor, topNavCategories } from '../../utils/nav-categories';
import { SITE_BRAND_NAME, SITE_BRAND_TAGLINE, SITE_BRAND_WORDMARK } from '../../site-media.defaults';

/** Misma clave que `RecentProductsService` (evita inyectar el servicio aquí: en SSR/Vite puede quedar `undefined` por orden de módulos). */
const RECENT_PRODUCTS_STORAGE_KEY = 'eshop_recent_products_v1';

export interface HeaderLastViewed {
  titleUrl: string;
  title: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    CommonModule,
    TranslatePipe,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatMenuModule,
    NavShopMenuComponent,
    PriceFormatPipe,
  ],
})
export class HeaderComponent implements OnInit {
  /** Nombre de marca (p. ej. `aria-label` del enlace a inicio). */
  readonly brandName = SITE_BRAND_NAME;
  readonly brandWordmark = SITE_BRAND_WORDMARK;
  readonly brandTagline = SITE_BRAND_TAGLINE;

  /** Expuestos para la plantilla (menú móvil). */
  readonly topNavCategories = topNavCategories;
  readonly megaChildrenFor = megaChildrenFor;
  /** Deben existir antes del primer render (no solo en ngOnInit). */
  readonly user$: Signal<User>;
  readonly cart$: Signal<Cart>;
  /** Asignados en el constructor (evita leer `selectors` en inicializadores de campo antes del ctor). */
  readonly categories!: Signal<Category[]>;
  readonly productSearchHits!: Signal<Product[]>;
  languageOptions = languages;
  lang$: Observable<string>;
  readonly query: FormControl = new FormControl('');
  searchOpen = signal(false);
  /** Slug de categoría de primer nivel para acotar la vista previa de búsqueda (`null` = todas). */
  readonly searchCategorySlug = signal<string | null>(null);
  /** Categorías raíz visibles para chips en el buscador global. */
  readonly searchFilterCategories = computed(() => {
    const list = this.categories() || [];
    return [...list]
      .filter((c) => !c.parentTitleUrl && !c.virtualNav && !c.menuHidden)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });
  /** Panel lateral catálogo (móvil); reemplaza el mat-menu básico. */
  mobileNavOpen = signal(false);

  /** Último producto visto (solo navegador; lee el mismo JSON que `RecentProductsService`). */
  readonly lastViewed = signal<HeaderLastViewed | null>(null);

  constructor(
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    public translate: TranslateService,
    private cartDrawer: CartDrawerService,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly router: Router,
  ) {
    this.categories = this.selectors.categories;
    this.productSearchHits = this.selectors.productSearchHits;
    this.lang$ = this.translate.getLang$();
    this.user$ = this.selectors.user;
    this.cart$ = this.selectors.cart;

    if (isPlatformBrowser(this.platformId)) {
      this.refreshLastViewedFromStorage();
      this.router.events
        .pipe(
          filter((e): e is NavigationEnd => e instanceof NavigationEnd),
          takeUntilDestroyed(),
        )
        .subscribe(() => this.refreshLastViewedFromStorage());
    }
  }

  private refreshLastViewedFromStorage(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const raw = localStorage.getItem(RECENT_PRODUCTS_STORAGE_KEY);
      if (!raw) {
        this.lastViewed.set(null);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.length) {
        this.lastViewed.set(null);
        return;
      }
      const first = parsed[0] as { titleUrl?: string; title?: string };
      const titleUrl = typeof first?.titleUrl === 'string' ? first.titleUrl.trim() : '';
      if (!titleUrl) {
        this.lastViewed.set(null);
        return;
      }
      const title =
        typeof first?.title === 'string' && first.title.trim() ? first.title.trim() : titleUrl;
      this.lastViewed.set({ titleUrl, title });
    } catch {
      this.lastViewed.set(null);
    }
  }

  /** Abre solo el panel lateral; la página `/cart` se abre desde dentro del panel. */
  openCartDrawer(): void {
    this.cartDrawer.open();
  }

  ngOnInit() {
    this.query.valueChanges
      .pipe(
        debounceTime(220),
        map((v) => (v ?? '').trim()),
        distinctUntilChanged(),
      )
      .subscribe((value) => {
        this.store.getProductSearch(value, this.searchCategorySlug());
      });
  }

  toggleSearch(): void {
    const next = !this.searchOpen();
    this.searchOpen.set(next);
    if (next) {
      this.closeMobileNav();
    }
    if (!next) {
      this.query.setValue('', { emitEvent: false });
      this.searchCategorySlug.set(null);
      this.store.getProductSearch('');
    }
  }

  toggleMobileNav(): void {
    const next = !this.mobileNavOpen();
    this.mobileNavOpen.set(next);
    this.document.body.style.overflow = next ? 'hidden' : '';
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
    this.document.body.style.overflow = '';
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.query.setValue('', { emitEvent: false });
    this.searchCategorySlug.set(null);
    this.store.getProductSearch('');
  }

  /** Acota la vista previa a una colección (slug `titleUrl`). */
  setSearchCategoryFilter(slug: string | null): void {
    this.searchCategorySlug.set(slug);
    const q = (this.query.value ?? '').trim();
    if (q.length) {
      this.store.getProductSearch(q, slug);
    }
  }

  /** Abre el catálogo completo con la misma búsqueda y categoría activa en chips. */
  goToCatalogSearch(): void {
    const term = (this.query.value ?? '').trim();
    if (!term.length) {
      return;
    }
    const slug = this.searchCategorySlug();
    this.lang$.pipe(take(1)).subscribe((lang) => {
      const l = (lang && String(lang).trim()) || languages[0];
      this.router.navigate([`/${l}/product/all`], {
        queryParams: {
          search: term,
          page: 1,
          sort: 'newest',
          ...(slug ? { categories: slug } : {}),
        },
      });
      this.closeSearch();
    });
  }

  addHitToCart(id: string, ev?: Event): void {
    ev?.stopPropagation();
    if (!id) {
      return;
    }
    this.cartDrawer.open();
    this.store.addToCart('?id=' + id);
  }

  trackHit(_i: number, p: Product): string {
    return p._id || p.titleUrl;
  }

  /** Nombre guardado o parte local del correo (cabecera / menú). */
  accountMenuLabel(user: User | null): string {
    if (!user?.email) {
      return '';
    }
    const raw =
      typeof user.name === 'string'
        ? user.name.trim()
        : user.name != null
          ? String(user.name).trim()
          : '';
    const primary = raw || (user.email.split('@')[0] ?? user.email);
    const max = 22;
    return primary.length > max ? `${primary.slice(0, max - 1)}…` : primary;
  }

  onLogout(): void {
    this.store.signOut();
  }

  scrollToTop(): void {
    of('scroll_content')
      .pipe(delay(100), take(1))
      .subscribe(() => {
        this.store.updatePosition({ cartComponent: 0 });
      });
  }

  setLang(lang: string): void {
    const langUpdate = {
      lang,
      currency: currencyLang[lang],
    };
    this.store.changeLanguage(langUpdate);
  }
}

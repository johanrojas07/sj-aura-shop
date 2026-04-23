import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { catchError, concatMap, finalize, from, map, of, switchMap, tap, Observable } from 'rxjs';

import { SignalStoreSelectors } from './signal.store.selectors';
import { ApiService } from '../services/api.service';
import { FirebaseClientAuthService } from '../services/firebase-client-auth.service';
import { accessTokenKey, cartLinesBackupKey } from '../shared/constants';
import type { Cart, Product } from '../shared/models';
import { firebaseAuthErrorKey } from '../shared/utils/firebase-auth-error.mapper';
import type { UserCredential } from 'firebase/auth';



@Injectable({
  providedIn: 'root',
})
export class SignalStore {
  /** Evita dos restauraciones desde localStorage en paralelo (p. ej. getCart duplicado). */
  private cartRestoreFromBackupInFlight = false;

  /**
   * Generación de lecturas de carrito: getCart hace ++ y guarda su seq; cualquier add/remove/qty
   * vuelve a ++ para **invalidar** getCart en vuelo. Si no, una respuesta GET vacía/lenta
   * llega después del add y dejaba solo 1 producto o carrito vacío.
   */
  private getCartResponseSeq = 0;

  constructor(
    private apiService: ApiService,
    private selectors: SignalStoreSelectors,
    private firebaseAuth: FirebaseClientAuthService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  /** Actualiza el carrito en estado y sincroniza respaldo local (solo navegador). */
  private applyCartResponse(cart: Cart | null): void {
    this.selectors.productState.update((state) => ({ ...state, cart }));
    this.syncLocalCartMirror(cart);
  }

  /** Invalida respuestas pendientes de getCart (evita carrera con add/remove). */
  private bumpCartReadGeneration(): void {
    this.getCartResponseSeq++;
  }

  private syncLocalCartMirror(cart: Cart | null): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const lang = this.selectors.appLang();
    const c = cart as (Cart & { error?: unknown }) | null | undefined;
    if (!lang || c?.error) {
      return;
    }
    const items = c?.items;
    if (!Array.isArray(items) || items.length === 0) {
      try {
        localStorage.removeItem(cartLinesBackupKey);
      } catch {
        /* ignore */
      }
      return;
    }
    const lines = items
      .map((row: { id?: string; qty?: number }) => ({
        id: String(row?.id ?? '').trim(),
        qty: Math.max(1, Math.min(999, Math.floor(Number(row?.qty) || 1))),
      }))
      .filter((l) => l.id);
    if (!lines.length) {
      try {
        localStorage.removeItem(cartLinesBackupKey);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      localStorage.setItem(cartLinesBackupKey, JSON.stringify({ lang, lines }));
    } catch {
      /* quota / private mode */
    }
  }

  private readCartBackup(): { lang: string; lines: { id: string; qty: number }[] } | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    try {
      const raw = localStorage.getItem(cartLinesBackupKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { lang?: string; lines?: { id?: string; qty?: number }[] };
      const lang = typeof parsed?.lang === 'string' ? parsed.lang : '';
      const lines = Array.isArray(parsed?.lines)
        ? parsed.lines
            .map((l) => ({
              id: String(l?.id ?? '').trim(),
              qty: Math.max(1, Math.min(999, Math.floor(Number(l?.qty) || 1))),
            }))
            .filter((l) => l.id)
        : [];
      if (!lang || !lines.length) {
        return null;
      }
      return { lang, lines };
    } catch {
      return null;
    }
  }

  /**
   * Rehace el carrito en servidor desde localStorage: una línea → un add + setLineQty (menos peticiones
   * que N×add y menos riesgo si algo reintenta).
   */
  private restoreCartFromBackup(lines: { id: string; qty: number }[], lang: string): void {
    const normalized = lines
      .map((l) => ({
        id: String(l.id || '').trim(),
        qty: Math.min(999, Math.max(1, Math.floor(Number(l.qty) || 1))),
      }))
      .filter((l) => l.id);
    if (!normalized.length) {
      this.cartRestoreFromBackupInFlight = false;
      this.applyCartResponse({ items: [], totalQty: 0, totalPrice: 0 });
      return;
    }
    this.bumpCartReadGeneration();
    let lastOk: Cart | null = null;
    from(normalized)
      .pipe(
        concatMap((line) =>
          this.apiService
            .addToCart(`?id=${encodeURIComponent(line.id)}&lang=${encodeURIComponent(lang)}`)
            .pipe(
              catchError(() => of(null)),
              switchMap((c: (Cart & { error?: unknown }) | null) => {
                if (!c || c.error) {
                  return of(c);
                }
                lastOk = c;
                if (line.qty <= 1) {
                  return of(c);
                }
                const params = `?id=${encodeURIComponent(line.id)}&lang=${encodeURIComponent(lang)}&qty=${line.qty}`;
                return this.apiService.setCartLineQty(params).pipe(
                  tap((c2: Cart & { error?: unknown }) => {
                    if (c2 && !c2.error) {
                      lastOk = c2;
                    }
                  }),
                  catchError(() => of(c)),
                );
              }),
            ),
        ),
        finalize(() => {
          this.cartRestoreFromBackupInFlight = false;
        }),
      )
      .subscribe({
        complete: () => {
          if (lastOk) {
            this.applyCartResponse(lastOk);
          } else {
            try {
              localStorage.removeItem(cartLinesBackupKey);
            } catch {
              /* ignore */
            }
            this.applyCartResponse({ items: [], totalQty: 0, totalPrice: 0 });
          }
        },
      });
  }

  /** Tras Firebase: token → perfil API; actualiza estado y emite si la sesión quedó válida. */
  private authenticateAfterFirebaseCredential$(credSource: Observable<UserCredential>): Observable<boolean> {
    return credSource.pipe(
      switchMap((cred) => from(cred.user.getIdToken())),
      tap((token) => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(accessTokenKey, token);
        }
      }),
      switchMap((token) =>
        this.apiService.getUser().pipe(
          map((res: any) =>
            res?.error ? { error: true as const, kind: 'api' as const } : { ...res, accessToken: token },
          ),
        ),
      ),
      tap((response: any) => {
        if (response.error) {
          if (isPlatformBrowser(this.platformId)) {
            localStorage.removeItem(accessTokenKey);
          }
          void this.firebaseAuth.signOut();
          this.selectors.userState.update((state) => ({
            ...state,
            user: null,
            loading: false,
            authError: response.kind === 'api' ? 'AUTH_ERR_PROFILE_FETCH' : 'AUTH_ERR_GENERIC',
          }));
        } else {
          this.selectors.userState.update((state) => ({
            ...state,
            user: response,
            loading: false,
            authError: null,
          }));
        }
      }),
      map((response: any) => !response.error),
      catchError((err) => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.removeItem(accessTokenKey);
        }
        void this.firebaseAuth.signOut();
        const key = firebaseAuthErrorKey(err);
        this.selectors.userState.update((state) => ({
          ...state,
          user: null,
          loading: false,
          authError: key,
        }));
        return of(false);
      }),
    );
  }

  signIn = (payload: { email: string; password: string }): Observable<boolean> => {
    this.selectors.userState.update((state) => ({ ...state, loading: true, authError: null }));
    return this.authenticateAfterFirebaseCredential$(
      from(this.firebaseAuth.signInWithEmail(payload.email.trim(), payload.password)),
    );
  };

  signUp = (payload: { email: string; password: string }): Observable<boolean> => {
    this.selectors.userState.update((state) => ({ ...state, loading: true, authError: null }));
    return this.authenticateAfterFirebaseCredential$(
      from(this.firebaseAuth.signUpWithEmail(payload.email.trim(), payload.password)),
    );
  };

  signInWithGoogle = (): Observable<boolean> => {
    this.selectors.userState.update((state) => ({ ...state, loading: true, authError: null }));
    return this.authenticateAfterFirebaseCredential$(from(this.firebaseAuth.signInWithGoogle()));
  };

  signOut = () => {
    void this.firebaseAuth.signOut().finally(() => {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.removeItem(accessTokenKey);
      }
      this.selectors.userState.update((state) => ({
        ...state,
        user: null,
        loading: false,
        authError: null,
      }));
    });
  };

  /** Limpia el mensaje de error de login/registro (p. ej. al reintentar). */
  clearAuthError = (): void => {
    this.selectors.userState.update((state) => ({ ...state, authError: null }));
  };

  /** Actualiza nombre en Firestore vía `PATCH /api/auth` y sincroniza el estado local. */
  patchProfile = (payload: { name: string }): Observable<boolean> => {
    return this.apiService.patchProfile(payload).pipe(
      tap((response: any) => {
        if (response?.error) {
          return;
        }
        const token = isPlatformBrowser(this.platformId)
          ? localStorage.getItem(accessTokenKey) ?? ''
          : '';
        this.selectors.userState.update((state) => ({
          ...state,
          user: {
            ...state.user,
            ...response,
            ...(token ? { accessToken: token } : {}),
          },
        }));
      }),
      map((response: any) => !response?.error),
      catchError(() => of(false)),
    );
  };

  getUser = () => {
    this.selectors.userState.update((state) => ({ ...state, loading: true, authError: null }));
    this.apiService.getUser().subscribe((response: any) => {
      if (response.error) {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.removeItem(accessTokenKey);
        }
        this.selectors.userState.update((state) => ({
          ...state,
          loading: false,
          user: null,
          authError: null,
        }));
        return;
      }
      const token = isPlatformBrowser(this.platformId)
        ? localStorage.getItem(accessTokenKey) ?? ''
        : '';
      this.selectors.userState.update((state) => ({
        ...state,
        user: { ...response, ...(token ? { accessToken: token } : {}) },
        loading: false,
        authError: null,
      }));
    });
  };

storeUser = (payload) => {
  this.selectors.userState.update((state) => ({ ...state, user: payload, loading: false, authError: null }));
};

changeLanguage = (payload) => {
  this.selectors.userState.update((state) => ({ ...state, lang: payload.lang, currency: payload.currency }));
};

sendContact = (payload) => {
  this.selectors.eshopState.update((state) => ({ ...state, loading: true }));
  this.apiService.sendContact(payload).subscribe(() => {
    this.selectors.eshopState.update((state) => ({ ...state, loading: false }));
  });
};

getPages = (payload?) => {
  this.apiService.getPages(payload).subscribe((response: any) => {
    const pages = response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.eshopState.update((state) => ({ ...state, pages }));
  });
};

getPage = (payload) => {
  this.apiService.getPage(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, page: response }));
  });
};

addOrEditPage = (payload) => {
  this.apiService.addOrEditPage(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, page: response }));
  });
};

removePage = (payload) => {
  this.apiService.removePage(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, page: response }));
  });
};

getThemes = () => {
  this.apiService.getThemes().subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, themes: response }));
  });
};

addOrEditTheme = (payload) => {
  this.apiService.addOrEditTheme(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, themes: response }));
  });
};

removeTheme = (payload) => {
  this.apiService.removeTheme(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, themes: response }));
  });
};

getConfigs = () => {
  this.apiService.getConfigs().subscribe((response: any) => {
    const configs = response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.eshopState.update((state) => ({ ...state, configs }));
  });
};

addOrEditConfig = (payload) => {
  this.apiService.addOrEditConfig(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, configs: response }));
  });
};

removeConfig = (payload) => {
  this.apiService.removeConfig(payload).subscribe((response: any) => {
    this.selectors.eshopState.update((state) => ({ ...state, configs: response }));
  });
};

getProducts = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, loadingProducts: true }));
  this.apiService.getProducts(payload).subscribe((response: any) => {
    if (response.error) {
      this.selectors.productState.update((state) => ({ ...state, loadingProducts: false }));
      return;
    }
    this.selectors.productState.update((state) => ({
      ...state,
      products: response.products,
      pagination: response.pagination,
      maxPrice: response.maxPrice,
      minPrice: response.minPrice,
      loadingProducts: false,
    }));
  });
};

getCategories = (payload) => {
  this.apiService.getCategories(payload).subscribe((response: any) => {
    const categories =
      response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.productState.update((state) => ({ ...state, categories }));
  });
};

getProduct = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, loadingProduct: true }));
  this.apiService.getProduct(payload).subscribe((response: any) => {
    this.selectors.productState.update((state) => ({ ...state, product: response, loadingProduct: false }));
  });
};

getProductSearch = (payload: string, categorySlug?: string | null) => {
  const raw = (payload || '').replace(/EMPTY___QUERY/gi, '').trim();
  if (!raw.length) {
    this.selectors.productState.update((state) => ({
      ...state,
      productsTitles: [],
      productSearchHits: [],
    }));
    return;
  }
  const slug = (categorySlug || '').trim();
  const filters = slug ? { category: slug } : undefined;
  this.apiService.getProductsSearchPreview(raw, 12, filters).subscribe((hits: Product[]) => {
    const productSearchHits = Array.isArray(hits) ? hits : [];
    this.selectors.productState.update((state) => ({
      ...state,
      productSearchHits,
      productsTitles: productSearchHits.map((p) => p.titleUrl).filter(Boolean),
    }));
  });
};

getCart = (payload) => {
  const lang = typeof payload === 'string' ? payload : '';
  const seq = ++this.getCartResponseSeq;
  this.apiService.getCart(payload).subscribe((response: any) => {
    if (seq !== this.getCartResponseSeq) {
      return;
    }
    if (response?.error) {
      return;
    }
    const hasItems =
      (Array.isArray(response?.items) && response.items.length > 0) ||
      (typeof response?.totalQty === 'number' && response.totalQty > 0);
    if (hasItems) {
      this.applyCartResponse(response);
      return;
    }
    if (isPlatformBrowser(this.platformId) && lang) {
      const backup = this.readCartBackup();
      if (backup && backup.lang === lang && backup.lines.length > 0) {
        if (this.cartRestoreFromBackupInFlight) {
          return;
        }
        this.cartRestoreFromBackupInFlight = true;
        this.restoreCartFromBackup(backup.lines, lang);
        return;
      }
    }
    this.applyCartResponse(response);
  });
};

addToCart = (payload) => {
  this.bumpCartReadGeneration();
  this.apiService.addToCart(payload).subscribe((response: any) => {
    this.applyCartResponse(response);
  });
};

removeFromCart = (payload) => {
  this.bumpCartReadGeneration();
  this.apiService.removeFromCart(payload).subscribe((response: any) => {
    this.applyCartResponse(response);
  });
};

setCartLineQty = (id: string, lang: string, qty: number) => {
  this.bumpCartReadGeneration();
  const q = Math.max(0, Math.min(999, Math.floor(qty)));
  const params = `?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}&qty=${q}`;
  this.apiService.setCartLineQty(params).subscribe((response: any) => {
    this.applyCartResponse(response);
  });
};

/** Quita una línea completa del carrito (varias llamadas remove, -1 unidad c/u). */
removeCartLineCompletely = (id: string, lang: string, qty: number) => {
  this.bumpCartReadGeneration();
  const step = (remaining: number) => {
    if (remaining <= 0 || !id) {
      return;
    }
    this.apiService.removeFromCart(`?id=${id}&lang=${lang}&r=${Math.random()}`).subscribe((response: any) => {
      this.applyCartResponse(response);
      step(remaining - 1);
    });
  };
  step(Math.max(0, Math.floor(qty)));
};

makeOrder = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, loading: true }));
  this.apiService.makeOrder(payload).subscribe((response: any) => {
    if (response.error || !response) {
      this.selectors.productState.update((state) => ({
        ...state,
        order: null,
        error: 'ORDER_SUBMIT_ERROR',
        loading: false,
      }));
      return;
    }
    this.selectors.productState.update((state) => ({
      ...state,
      order: response.result,
      cart: response.cart,
      error: response.error,
      loading: false,
    }));
    if (payload?.userId) {
      this.getUser();
    }
  });
};

makeOrderWithPayment = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, loading: true }));
  this.apiService.handleToken(payload).subscribe((response: any) => {
    if (response.error || !response) {
      this.selectors.productState.update((state) => ({
        ...state,
        order: null,
        error: 'ORDER_SUBMIT_ERROR',
        loading: false,
      }));
      return;
    }
    this.selectors.productState.update((state) => ({
      ...state,
      order: response.result,
      cart: response.cart,
      error: response.error,
      loading: false,
    }));
    this.syncLocalCartMirror(response.cart);
    if (payload?.userId) {
      this.getUser();
    }
  });
};

getStripeSession = (payload) => {
  this.apiService.getStripeSession(payload);
};

getUserOrders = () => {
  const u = this.selectors.user();
  const isAdmin = Array.isArray(u?.roles) && u.roles.includes('admin');
  const req$ = isAdmin ? this.apiService.getOrders() : this.apiService.getUserOrders();
  req$.subscribe((response: any) => {
    const list = response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.productState.update((state) => ({ ...state, userOrders: list }));
  });
};

filterPrice = (payload: number) => {
  this.selectors.productState.update((state) => ({
    ...state,
    priceFilter: payload,
    /** Slider simple (home): solo tope; sin piso. */
    priceFilterMin: 0,
  }));
};

/** Rango de precio (ambos en COP del catálogo actual); 0 en cada extremo = sin filtro en ese lado. */
filterPriceRange = (floor: number, ceiling: number) => {
  this.selectors.productState.update((state) => {
    const catMin = Number(state.minPrice) || 0;
    const catMax = Number(state.maxPrice) || 0;
    let f = Math.round(Number(floor)) || 0;
    let c = Math.round(Number(ceiling)) || 0;
    if (catMax > 0 && catMin >= 0) {
      f = Math.max(catMin, Math.min(f, catMax));
      c = Math.max(catMin, Math.min(c, catMax));
    }
    if (f > c) {
      const t = f;
      f = c;
      c = t;
    }
    const atMinBound = catMin <= 0 || f <= catMin;
    const atMaxBound = catMax <= 0 || c >= catMax;
    return {
      ...state,
      priceFilterMin: atMinBound ? 0 : f,
      priceFilter: atMaxBound ? 0 : c,
    };
  });
};

updatePosition = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, position: payload }));
};

cleanError = () => {
  this.selectors.productState.update((state) => ({ ...state, order: null, error: '' }));
};

getOrders = () => {
  this.apiService.getOrders().subscribe((response: any) => {
    const list = response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.dashboardState.update((state) => ({ ...state, orders: list }));
  });
};

getOrder = (payload) => {
  this.apiService.getOrder(payload).subscribe((response: any) => {
    if (response?.error) {
      return;
    }
    this.selectors.dashboardState.update((state) => ({ ...state, order: response }));
    this.selectors.productState.update((state) => ({ ...state, order: response }));
  });
};

addProduct = (payload) => {
  this.apiService.addProduct(payload).subscribe((response: any) => {
    if (!response?.error) {
      this.getAllProducts();
    }
  });
};

editProduct = (payload) => {
  this.selectors.dashboardState.update((state) => ({ ...state, loading: true }));
  this.apiService.editProduct(payload).subscribe({
    next: (response: any) => {
      this.selectors.dashboardState.update((state) => ({ ...state, loading: false }));
      if (!response?.error) {
        this.getAllProducts();
      }
    },
    error: () => {
      this.selectors.dashboardState.update((state) => ({ ...state, loading: false }));
    },
  });
};

removeProduct = (payload) => {
  this.selectors.dashboardState.update((state) => ({ ...state, loading: true }));
  this.apiService.removeProduct(payload).subscribe({
    next: (response: any) => {
      this.selectors.dashboardState.update((state) => ({ ...state, loading: false }));
      if (!response?.error) {
        this.getAllProducts();
      }
    },
    error: () => {
      this.selectors.dashboardState.update((state) => ({ ...state, loading: false }));
    },
  });
};

storeProduct = (payload) => {
  this.selectors.productState.update((state) => ({ ...state, product: payload, loadingProduct: false}));
}

getAllProducts = () => {
  this.apiService.getAllProducts().subscribe((response: any) => {
    const list = response?.error || !Array.isArray(response) ? [] : response;
    this.selectors.dashboardState.update((state) => ({ ...state, allProducts: list }));
  });
};

getAllCategories = () => {
  this.apiService.getAllCategories().subscribe((response: any) => {
    this.selectors.dashboardState.update((state) => ({ ...state, allCategories: response }));
  });
}

editCategory = (payload) => {
  this.apiService.editCategory(payload).subscribe((response: any) => {
    console.log(response);
  });
}

removeCategory = (payload) => {
  this.apiService.removeCategory(payload).subscribe((response: any) => {
    console.log(response);
  });
}

getImages = () => {
  this.apiService.getImages().subscribe((response: any) => {
    if (response.error) {
      return;
    }
    this.selectors.dashboardState.update((state) => ({ ...state, productImages: response.all }));
  });
}

addProductImagesUrl = (payload) => {
  this.apiService.addProductImagesUrl(payload).subscribe((response: any) => {
    if (response.error) {
      return;
    }
    if (response && response.titleUrl) {
      this.selectors.productState.update((state) => ({ ...state, product: response }));
    }
    this.selectors.dashboardState.update((state) => ({ ...state, productImages: response.all }));
  });
}

removeImage = (payload) => {
  this.apiService.removeImage(payload).subscribe((response: any) => {
    if (response && response.titleUrl) {
      this.selectors.productState.update((state) => ({ ...state, product: response }));
    }
    this.selectors.dashboardState.update((state) => ({ ...state, productImages: response.all }));
  });
}

storeProductImages = (payload) => {
  this.selectors.dashboardState.update((state) => ({ ...state, productImages: payload.all }));
}

updateOrder = (payload: { orderId: string; status: string }) => {
  this.apiService.updateOrder(payload).subscribe((response: any) => {
    if (response?.error || !response?.orderId) {
      return;
    }
    const id = response.orderId as string;
    this.selectors.dashboardState.update((state) => ({
      ...state,
      order: state.order?.orderId === id ? response : state.order,
      orders: Array.isArray(state.orders)
        ? state.orders.map((o) => (o.orderId === id ? { ...o, ...response } : o))
        : state.orders,
    }));
    this.selectors.productState.update((state) => ({
      ...state,
      order: state.order?.orderId === id ? response : state.order,
      userOrders: Array.isArray(state.userOrders)
        ? state.userOrders.map((o) => (o.orderId === id ? { ...o, ...response } : o))
        : state.userOrders,
    }));
  });
};

getAllTranslations = () => {
  this.apiService.getAllTranslations().subscribe((response: any) => {
    this.selectors.dashboardState.update((state) => ({ ...state, translations: response }));
  });
}

editTranslation = (payload) => {
  this.selectors.dashboardState.update((state) => ({ ...state, loading: true }));
  this.apiService.editAllTranslation(payload).subscribe((response: any) => {
    this.selectors.dashboardState.update(state => ({
      ...state,
      loading: false,
      translations: state.translations.map(trans => trans._id === response._id ? response : trans)
    }))
  })
};

}

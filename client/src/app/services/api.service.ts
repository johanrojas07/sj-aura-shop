import { toObservable } from '@angular/core/rxjs-interop';
import { WindowService } from './window.service';
import { catchError, map } from 'rxjs/operators';
import { Inject, Injectable, Optional, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';

import { environment } from '../../environments/environment';
import { Translations } from '../shared/models';
import { accessTokenKey, languages } from '../shared/constants';
import { SignalStoreSelectors } from '../store/signal.store.selectors';
import { combineLatest, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  apiUrl = environment.apiUrl;
  requestOptions = {};
  ranNumber = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly _window: WindowService,
    @Optional() @Inject('serverUrl') protected serverUrl: string,
    @Inject(PLATFORM_ID)
    private platformId: Object,
    private readonly selectors: SignalStoreSelectors,
  ) {
    this.setHeaders();

    if (environment.production) {
      if (isPlatformServer(this.platformId)) {
        this.apiUrl = this.serverUrl || '';
      }

      if (isPlatformBrowser(this.platformId)) {
        const fromEnv = (environment as { apiUrl?: string }).apiUrl?.trim();
        /* Con API en Render (u otro origen) y front en Firebase: rellena `apiUrl` en `environment.prod.ts` (build producción). */
        this.apiUrl = fromEnv && fromEnv.length > 0 ? fromEnv : this._window.location.origin || '';
      }
    }
  }

  getConfig() {
    const configUrl = this.apiUrl + '/api/eshop/config';
    return this.http.get(configUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getUser() {
    const userUrl = this.apiUrl + '/api/auth';
    // Siempre leer el token desde localStorage aquí: evita carrera con setHeaders()
    // (tras login el token se guarda y getUser() se llama antes de que combineLatest actualice requestOptions).
    return this.http.get(userUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  patchProfile(body: { name?: string }) {
    const url = this.apiUrl + '/api/auth';
    return this.http.patch(url, body, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  /** Cabeceras actuales (idioma + Bearer desde localStorage). */
  buildRequestOptions(): { headers: HttpHeaders; withCredentials: boolean } {
    const raw = this.selectors.appLang();
    const lang = raw && String(raw).trim() ? String(raw).trim() : languages[0];
    const accessToken = isPlatformBrowser(this.platformId)
      ? localStorage.getItem(accessTokenKey) ?? ''
      : '';
    let headers = new HttpHeaders();
    headers = headers.set('Authorization', 'Bearer ' + accessToken).set('lang', lang);
    return { headers, withCredentials: true };
  }

  getProducts(req) {
    const {
      lang,
      page,
      sort,
      category,
      categories,
      maxPrice,
      minPrice,
      ofertas,
      promo,
      search,
    } = req;
    const addCategory = category ? { category } : {};
    const catsJoined =
      Array.isArray(categories) && categories.length
        ? categories.filter(Boolean).join(',')
        : typeof categories === 'string' && categories.trim()
          ? categories.trim()
          : '';
    const addMulti = catsJoined ? { categories: catsJoined } : {};
    const categoryQuery = category ? '&category=' + encodeURIComponent(category) : '';
    const categoriesQuery = catsJoined
      ? '&categories=' + encodeURIComponent(catsJoined)
      : '';
    const priceQuery = maxPrice ? '&maxPrice=' + encodeURIComponent(String(maxPrice)) : '';
    const minPriceQuery = minPrice ? '&minPrice=' + encodeURIComponent(String(minPrice)) : '';
    const ofertasQuery = ofertas ? '&ofertas=' + encodeURIComponent(String(ofertas)) : '';
    const promoQuery = promo ? '&promo=' + encodeURIComponent(String(promo)) : '';
    const rawSearch = typeof search === 'string' ? search.trim() : '';
    const searchQuery =
      rawSearch.length > 0 ? '&search=' + encodeURIComponent(rawSearch) : '';
    const productsUrl =
      this.apiUrl +
      '/api/products?lang=' +
      lang +
      '&page=' +
      page +
      '&sort=' +
      sort +
      categoryQuery +
      categoriesQuery +
      priceQuery +
      minPriceQuery +
      ofertasQuery +
      promoQuery +
      searchQuery;
    return this.http.get(productsUrl, this.requestOptions).pipe(
      map((data: any) => {
        const list = Array.isArray(data.all) ? data.all : [];
        const pagination =
          data.pagination ??
          ({
            total: data.total ?? 0,
            limit: data.limit,
            page: data.page ?? 1,
            pages: data.pages ?? 1,
          } as const);
        return {
          products: list.map((product) => ({
            ...product,
            tags: (product.tags || []).filter(Boolean).map((cat: string) => cat.toLowerCase()),
          })),
          pagination,
          maxPrice: data.maxPrice,
          minPrice: data.minPrice,
          ...addCategory,
          ...addMulti,
        };
      }),
      catchError((error: Error) => of({ error })),
    );
  }

  getCategories(lang: string) {
    const categoriesUrl = this.apiUrl + '/api/products/categories?lang=' + lang;
    return this.http.get(categoriesUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getProductsSearch(query: string) {
    const productUrl =
      this.apiUrl + '/api/products/search?query=' + encodeURIComponent(query);
    return this.http.get(productUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getProductsSearchPreview(
    query: string,
    limit = 12,
    filters?: { category?: string; categories?: string },
  ) {
    const q = encodeURIComponent((query || '').trim());
    let productUrl =
      this.apiUrl +
      '/api/products/search-preview?query=' +
      q +
      '&limit=' +
      limit;
    if (filters?.category?.trim()) {
      productUrl +=
        '&category=' + encodeURIComponent(filters.category.trim());
    }
    if (filters?.categories?.trim()) {
      productUrl +=
        '&categories=' + encodeURIComponent(filters.categories.trim());
    }
    return this.http.get(productUrl, this.requestOptions).pipe(
      map((response: any) => (Array.isArray(response) ? response : [])),
      catchError((error: Error) => of([])),
    );
  }

  getProduct(params) {
    const productUrl = this.apiUrl + '/api/products/' + params;
    return this.http.get(productUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addProduct(product) {
    const addProduct = this.apiUrl + '/api/products/add';
    return this.http.post(addProduct, product, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  editProduct(product) {
    const eidtProduct = this.apiUrl + '/api/products/edit';
    return this.http.patch(eidtProduct, product, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getAllProducts() {
    const productUrl = this.apiUrl + '/api/products/all';
    return this.http.get(productUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeProduct(name: string) {
    const removeProduct = this.apiUrl + '/api/products/' + encodeURIComponent(name);
    return this.http.delete(removeProduct, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getAllCategories() {
    const categoriesUrl = this.apiUrl + '/api/products/categories/all';
    return this.http.get(categoriesUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  editCategory(category) {
    const eidtCategory = this.apiUrl + '/api/products/categories/edit';
    return this.http.patch(eidtCategory, category, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeCategory(name: string) {
    const removeCategory = this.apiUrl + '/api/products/categories/' + encodeURIComponent(name);
    return this.http.delete(removeCategory, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  handleToken(token) {
    const tokenUrl = this.apiUrl + '/api/orders/stripe';
    return this.http.post(tokenUrl, token, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  makeOrder(req) {
    const addOrder = this.apiUrl + '/api/orders/add';
    return this.http.post(addOrder, req, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getUserOrders() {
    const userOrderUrl = this.apiUrl + '/api/orders';
    return this.http.get(userOrderUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getOrders() {
    const ordersUrl = this.apiUrl + '/api/orders/all';
    return this.http.get(ordersUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getOrder(id: string) {
    const orderUrl = this.apiUrl + '/api/orders/' + encodeURIComponent(id);
    return this.http.get(orderUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  updateOrder(req) {
    const orderUpdateUrl = this.apiUrl + '/api/orders';
    return this.http.patch(orderUpdateUrl, req, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getStripeSession(req) {
    const stripeSessionUrl = this.apiUrl + '/api/orders/stripe/session';
    return this.http.post(stripeSessionUrl, req, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getCart(lang?: string) {
    const withLangQuery = lang ? '?lang=' + lang : '';
    const cartUrl = this.apiUrl + '/api/cart' + withLangQuery;
    return this.http.get(cartUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addToCart(params: string) {
    this.ranNumber = this.ranNumber + 1;
    const randomNum = '&random=' + this.ranNumber;
    const addToCartUrl = this.apiUrl + '/api/cart/add' + params + randomNum;
    return this.http.get(addToCartUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeFromCart(params: string) {
    this.ranNumber = this.ranNumber + 1;
    const randomNum = '&random=' + this.ranNumber;
    const removeFromCartUrl = this.apiUrl + '/api/cart/remove' + params + randomNum;
    return this.http.get(removeFromCartUrl, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  /**
   * Sustituye el carrito en servidor con las líneas (id + qty) enviadas.
   * Más fiable que GET /add consecutivos cuando la cookie de sesión no se reutiliza.
   */
  syncCartLines(lines: Array<{ id: string; qty: number }>) {
    const url = this.apiUrl + '/api/cart/sync';
    return this.http.post(url, { lines }, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  /** Fija cantidad de una línea (0 = quitar) en una sola petición. */
  setCartLineQty(params: string) {
    this.ranNumber = this.ranNumber + 1;
    const randomNum = '&random=' + this.ranNumber;
    const url = this.apiUrl + '/api/cart/line-qty' + params + randomNum;
    return this.http.get(url, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getLangTranslations(lang: string) {
    const translationsUrl = this.apiUrl + '/api/translations?lang=' + lang;
    return this.http.get(translationsUrl).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getAllTranslations() {
    const translationsUrl = this.apiUrl + '/api/translations/all';
    return this.http.get(translationsUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  editTranslation({ lang, keys }) {
    const translationsUpdateUrl = this.apiUrl + '/api/translations?lang=' + lang;
    return this.http.patch(translationsUpdateUrl, { keys: keys }, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  editAllTranslation(translations: Translations[]) {
    const translationsUpdateUrl = this.apiUrl + '/api/translations/all';
    return this.http.patch(translationsUpdateUrl, translations, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getImages() {
    const getImages = this.apiUrl + '/api/admin/images';
    return this.http.get(getImages, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addProductImagesUrl({ image, titleUrl }) {
    const titleUrlQuery = titleUrl ? '?titleUrl=' + encodeURIComponent(titleUrl) : '';
    const addImageUrl = this.apiUrl + '/api/admin/images/add' + titleUrlQuery;
    return this.http.post(addImageUrl, { image }, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeImage({ image, titleUrl }) {
    const titleUrlQuery = titleUrl ? '?titleUrl=' + encodeURIComponent(titleUrl) : '';
    const removeImage = this.apiUrl + '/api/admin/images/remove' + titleUrlQuery;
    return this.http.post(removeImage, { image }, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  uploadImage({ fileToUpload, titleUrl }) {
    if (!isPlatformBrowser(this.platformId)) {
      return of({ error: new Error('upload only browser') });
    }
    const titleUrlQuery = titleUrl ? '?titleUrl=' + encodeURIComponent(String(titleUrl)) : '';
    const formData: FormData = new FormData();
    formData.append('file', fileToUpload);

    const opts = this.buildRequestOptions();
    let headers = opts.headers;
    if (headers.has('Content-Type')) {
      headers = headers.delete('Content-Type');
    }
    const uploadUrl = this.apiUrl + '/api/admin/images/upload' + titleUrlQuery;

    return this.http
      .post(uploadUrl, formData, {
        reportProgress: true,
        responseType: 'json',
        headers,
        withCredentials: opts.withCredentials,
      })
      .pipe(
        map((response: any) => response),
        catchError((error: Error) => of({ error })),
      );
  }

  sendContact(req) {
    const sendContact = this.apiUrl + '/api/eshop/contact';
    return this.http.post(sendContact, req, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getPages(query?) {
    const titlesQueryParams = query ? `?titles=${query.titles}&lang=${query.lang}` : '';
    const pagesUrl = this.apiUrl + '/api/eshop/page/all' + titlesQueryParams;
    return this.http.get(pagesUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getPage(query) {
    const pageUrl = this.apiUrl + '/api/eshop/page/' + query.titleUrl + '?lang=' + query.lang;
    return this.http.get(pageUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addOrEditPage(pageReq) {
    const pageUrl = this.apiUrl + '/api/eshop/page';
    return this.http.post(pageUrl, pageReq, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removePage(titleUrl: string) {
    const pageUrl = this.apiUrl + '/api/eshop/page/' + titleUrl;
    return this.http.delete(pageUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getThemes() {
    const themesUrl = this.apiUrl + '/api/eshop/theme/all';
    return this.http.get(themesUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addOrEditTheme(themeReq) {
    const themeUrl = this.apiUrl + '/api/eshop/theme';
    return this.http.post(themeUrl, themeReq, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeTheme(titleUrl: string) {
    const themeUrl = this.apiUrl + '/api/eshop/theme/' + titleUrl;
    return this.http.delete(themeUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getConfigs() {
    const configsUrl = this.apiUrl + '/api/eshop/config/all';
    return this.http.get(configsUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  addOrEditConfig(configReq) {
    const configUrl = this.apiUrl + '/api/eshop/config';
    return this.http.post(configUrl, configReq, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  removeConfig(titleUrl: string) {
    const configUrl = this.apiUrl + '/api/eshop/config/' + titleUrl;
    return this.http.delete(configUrl, this.requestOptions).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  listAdminLoyaltyCustomers(params: {
    page?: number;
    pageSize?: number;
    sort?: string;
    type?: string;
    q?: string;
    minPoints?: number;
    maxPoints?: number;
  }) {
    const p = new URLSearchParams();
    p.set('page', String(params.page ?? 1));
    p.set('pageSize', String(params.pageSize ?? 20));
    if (params.sort) {
      p.set('sort', params.sort);
    }
    if (params.type) {
      p.set('type', params.type);
    }
    if (params.q?.trim()) {
      p.set('q', params.q.trim());
    }
    if (params.minPoints !== undefined && params.minPoints !== null) {
      p.set('minPoints', String(params.minPoints));
    }
    if (params.maxPoints !== undefined && params.maxPoints !== null) {
      p.set('maxPoints', String(params.maxPoints));
    }
    const url = `${this.apiUrl}/api/admin/loyalty/customers?${p.toString()}`;
    return this.http.get(url, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  getAdminLoyaltyCustomerDetail(ref: string) {
    const url =
      this.apiUrl +
      '/api/admin/loyalty/customers/detail?ref=' +
      encodeURIComponent(ref);
    return this.http.get(url, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  /** Vista previa: cliente existente o nuevo invitado (misma lógica que compra manual). */
  getAdminLoyaltyLookupPhone(phone: string) {
    const q = new URLSearchParams();
    q.set('phone', String(phone ?? '').trim());
    const url = `${this.apiUrl}/api/admin/loyalty/customers/lookup-phone?${q.toString()}`;
    return this.http.get(url, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  adminLoyaltyManualPurchase(body: Record<string, unknown>) {
    const url = this.apiUrl + '/api/admin/loyalty/manual-purchase';
    return this.http.post(url, body, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  adminLoyaltyAdjust(body: Record<string, unknown>) {
    const url = this.apiUrl + '/api/admin/loyalty/adjust';
    return this.http.post(url, body, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  adminLoyaltyTransfer(body: Record<string, unknown>) {
    const url = this.apiUrl + '/api/admin/loyalty/transfer';
    return this.http.post(url, body, this.buildRequestOptions()).pipe(
      map((response: any) => response),
      catchError((error: Error) => of({ error })),
    );
  }

  setHeaders() {
    this.requestOptions = this.buildRequestOptions();
    combineLatest([toObservable(this.selectors.appLang), toObservable(this.selectors.user)]).subscribe(([_lang, user]) => {
      if (user && user.accessToken && isPlatformBrowser(this.platformId)) {
        localStorage.setItem(accessTokenKey, user.accessToken);
      }
      this.requestOptions = this.buildRequestOptions();
    });
  }
}

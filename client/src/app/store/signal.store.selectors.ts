import { User, Page, Theme, Config, Product, Cart, Category, Order, Pagination, Translations } from '../shared/models';
import { languages, currencyLang } from '../shared/constants';
import { signal, computed, Injectable } from '@angular/core';

export interface UserState {
  loading: boolean;
  user: User;
  lang: string;
  currency: string;
  error: boolean;
  /** Clave i18n (p. ej. AUTH_ERR_*) tras fallo de login/registro; null si no hay error. */
  authError: string | null;
}


export interface EshopState {
  loading: boolean;
  error: string;
  pages: Page[];
  page: Page | null;
  themes: Theme[];
  configs: Config[];
}

export interface ProductState {
  products: Product[];
  loadingProducts: boolean;
  categories: Array<Category>;
  pagination: Pagination;
  product: Product;
  loadingProduct: boolean;
  cart: Cart;
  userOrders: Order[];
  order: Order;
  productsTitles: Array<string>;
  productSearchHits: Product[];
  priceFilter: number;
  /** >0 = filtro API `minPrice` (piso del rango). */
  priceFilterMin: number;
  maxPrice: number;
  minPrice: number;
  position: { [component: string]: number };
  loading: boolean;
  error: string;
}

export interface DashboardState {
  orders: Order[];
  order: Order;
  productImages: Array<string>;
  translations: Array<Translations>;
  allProducts: Array<Product>;
  allCategories: Array<{ category: Category; productsWithCategory: string[] }>;
  loading: boolean;
}


@Injectable({
  providedIn: 'root',
})
export class SignalStoreSelectors{
  public userState = signal<UserState>({
    loading: false,
    user: null,
    lang: languages[0],
    currency: currencyLang['default'],
    error: false,
    authError: null,
  });

  public eshopState = signal<EshopState>({
    loading: false,
    error: '',
    pages: [],
    page: null,
    themes: [],
    configs: [],
  });

  public productState = signal<ProductState>({
    products: null,
    loadingProducts: false,
    categories: [],
    pagination: {
      page: 1,
      pages: 1,
      total: 0,
    },
    product: null,
    loadingProduct: false,
    cart: null,
    userOrders: null,
    order: null,
    productsTitles: [],
    productSearchHits: [],
    priceFilter: 0,
    priceFilterMin: 0,
    maxPrice: 0,
    minPrice: 0,
    position: null,
    loading: false,
    error: '',
  });

  public dashboardState = signal<DashboardState>({
    orders: null,
    order: null,
    productImages: [],
    translations: [],
    allProducts: [],
    allCategories: [],
    loading: false,
  });

public readonly user = computed(() => this.userState().user);
public readonly appLang = computed(() =>  this.userState().lang);
public readonly currency = computed(() =>  this.userState().currency);
public readonly authLoading = computed(() =>  this.userState().loading);
public readonly authError = computed(() => this.userState().authError);

public readonly eshopLoading = computed(() =>  this.eshopState().loading);
public readonly eshopError = computed(() =>  this.eshopState().error);
public readonly pages = computed(() =>  this.eshopState().pages);
public readonly page = computed(() =>  this.eshopState().page);
public readonly themes = computed(() =>  this.eshopState().themes);
public readonly configs = computed(() =>  this.eshopState().configs);

public readonly products = computed(() =>  this.productState().products);
public readonly loadingProducts = computed(() =>  this.productState().loadingProducts);
public readonly categories = computed(() =>  this.productState().categories);
public readonly pagination = computed(() =>  this.productState().pagination);
public readonly product = computed(() =>  this.productState().product);
public readonly cart = computed(() =>  this.productState().cart);
public readonly productLoading = computed(() =>  this.productState().loadingProduct);
public readonly userOrders = computed(() =>  this.productState().userOrders);
public readonly order = computed(() =>  this.productState().order);
public readonly productsTitles = computed(() =>  this.productState().productsTitles);
public readonly productSearchHits = computed(() => this.productState().productSearchHits);
public readonly priceFilter = computed(() =>  this.productState().priceFilter);
public readonly priceFilterMin = computed(() =>  this.productState().priceFilterMin);
public readonly maxPrice = computed(() =>  this.productState().maxPrice);
public readonly minPrice = computed(() =>  this.productState().minPrice);
public readonly position = computed(() =>  this.productState().position);
/** Pedido en curso (makeOrder / Stripe): solo deshabilitar envío, no ocultar el formulario. */
public readonly checkoutLoading = computed(() => this.productState().loading);

public readonly orders = computed(() =>  this.dashboardState().orders);
public readonly dashboardOrder = computed(() =>  this.dashboardState().order);
public readonly productImages = computed(() =>  this.dashboardState().productImages);
public readonly translations = computed(() =>  this.dashboardState().translations);
public readonly allProducts = computed(() =>  this.dashboardState().allProducts);
public readonly allCategories = computed(() =>  this.dashboardState().allCategories);
public readonly dashboardLoading = computed(() =>  this.dashboardState().loading);
}

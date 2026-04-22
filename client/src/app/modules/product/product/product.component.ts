import { toObservable } from '@angular/core/rxjs-interop';
import { JsonLDService } from './../../../services/jsonLD.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, map, take, distinctUntilChanged, skip, withLatestFrom } from 'rxjs/operators';
import { Component, OnDestroy, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, combineLatest, Subscription } from 'rxjs';
import { Location } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';

import { Cart, Product, Category } from '../../../shared/models';
import { TranslateService } from '../../../services/translate.service';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { CartDrawerService } from '../../../services/cart-drawer.service';
import { RecentProductsService } from '../../../services/recent-products.service';

@Component({
    selector: 'app-product',
    templateUrl: './product.component.html',
    styleUrls: ['./product.component.scss'],
    standalone: false
})
export class ProductComponent implements OnDestroy {
  categories$: Observable<Category[]>;
  productLoading$: Signal<boolean>;
  currency$: Observable<string>;
  lang$: Observable<string>;
  routeSub: Subscription;
  categoriesSub: Subscription;
  recentProductsSub: Subscription;
  product$: Signal<Product>;
  cartIds$: Observable<{ [productId: string]: number }>;

  constructor(
    private route: ActivatedRoute,
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    private location: Location,
    private meta: Meta,
    private title: Title,
    private snackBar: MatSnackBar,
    private cartDrawer: CartDrawerService,
    private translate: TranslateService,
    private jsonLDService: JsonLDService,
    private recentProducts: RecentProductsService,
  ) {
    this.lang$ = this.translate.getLang$();
    this.categories$ = toObservable(this.selectors.categories);
    this.routeSub = combineLatest([this.lang$, this.route.params.pipe(map((params) => params['id']))]).subscribe(([lang, id]) => {
      this.store.getProduct(id + '?lang=' + lang);
    });

    this.currency$ = toObservable(this.selectors.currency);

    this.callCategories();

    this.setMetaData();
    this.productLoading$ = this.selectors.productLoading;
    this.product$ =  this.selectors.product;
    this.cartIds$ = toObservable(this.selectors.cart).pipe(
      filter(Boolean),
      map((cart: Cart) => cart.items.reduce((prev, curr) => ({ ...prev, [curr.id]: curr.qty }), {})),
    );

    this.recentProductsSub = combineLatest([
      toObservable(this.selectors.product),
      toObservable(this.selectors.productLoading),
    ])
      .pipe(
        filter(([p, loading]) => !!p?.titleUrl && !loading && !!p.visibility && !!p.salePrice),
        map(([p]) => p),
        distinctUntilChanged((a, b) => a.titleUrl === b.titleUrl),
      )
      .subscribe((p) => this.recentProducts.recordView(p));
  }

  cartEvent(id: string, type: string): void {
    if (type === 'add') {
      this.cartDrawer.open();
      this.store.addToCart('?id=' + id);

      this.translate
        .getTranslations$()
        .pipe(
          map((translations) =>
            translations
              ? { message: translations['ADDED_TO_CART'] || 'Producto agregado al carrito', action: translations['TO_CART'] || 'Ver bolsa' }
              : { message: 'Producto agregado al carrito', action: 'Ver bolsa' },
          ),
          take(1),
        )
        .subscribe(({ message, action }) => {
          const snackBarRef = this.snackBar.open(message, action, {
            duration: 3800,
            panelClass: ['eshop-toast'],
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
          snackBarRef
            .onAction()
            .pipe(take(1))
            .subscribe(() => this.cartDrawer.open());
        });
    }
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.routeSub.unsubscribe();
    this.categoriesSub.unsubscribe();
    this.recentProductsSub.unsubscribe();
  }

  private callCategories(): void {
    combineLatest([this.categories$.pipe(take(1)), this.lang$.pipe(take(1))])
      .pipe(take(1))
      .subscribe(([categories, lang]) => {
        if (!categories.length) {
          this.store.getCategories(lang);
        }
      });

    this.categoriesSub = this.lang$.pipe(distinctUntilChanged(), skip(1)).subscribe((lang: string) => {
      this.store.getCategories(lang);
    });
  }

  private setMetaData(): void {
    toObservable(this.selectors.product)
      .pipe(
        filter((product: Product) => !!product && !!product.title),
        withLatestFrom(this.currency$),
        take(1),
      )
      .subscribe(([product, currency]) => {
        this.title.setTitle(product.title);
        this.meta.updateTag({ name: 'description', content: product.description });
        const productSchema = {
          '@context': 'https://schema.org/',
          '@type': 'Product',
          name: product.title,
          image: product.mainImage?.url,
          offers: {
            '@type': 'Offer',
            priceCurrency: currency,
            price: product.regularPrice,
            availability: product.stock === 'onStock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
          description: product.description,
        };
        this.jsonLDService.insertSchema(productSchema, 'structured-data-product');
      });
  }
}

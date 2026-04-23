import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, finalize, map, switchMap, tap } from 'rxjs/operators';

import { ApiService } from '../../../services/api.service';
import { ProductQuickViewService } from '../../../services/product-quick-view.service';
import { CartDrawerService } from '../../../services/cart-drawer.service';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { Product } from '../../models';
import { ProductContentComponent } from '../product-content/product-content.component';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-product-quick-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    ProductContentComponent,
  ],
  templateUrl: './product-quick-view.component.html',
  styleUrls: ['./product-quick-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductQuickViewComponent {
  private readonly api = inject(ApiService);
  readonly quickView = inject(ProductQuickViewService);
  readonly selectors = inject(SignalStoreSelectors);
  private readonly store = inject(SignalStore);
  private readonly cartDrawer = inject(CartDrawerService);
  private readonly router = inject(Router);

  readonly product = signal<Product | null>(null);
  readonly loadError = signal(false);
  readonly loading = signal(false);

  readonly cartIds = computed(() => {
    const cart = this.selectors.cart();
    if (!cart?.items?.length) {
      return {} as { [id: string]: number };
    }
    return cart.items.reduce(
      (prev, curr) => ({ ...prev, [curr.id]: curr.qty }),
      {} as { [id: string]: number },
    );
  });

  constructor() {
    combineLatest([toObservable(this.quickView.isOpen), toObservable(this.quickView.titleUrl)])
      .pipe(
        tap(([open]) => {
          if (!open) {
            this.product.set(null);
            this.loadError.set(false);
            this.loading.set(false);
          }
        }),
        filter(([open, slug]) => open && !!(slug || '').trim()),
        distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
        switchMap(([, slug]) => {
          const s = (slug || '').trim();
          const lang = (this.selectors.appLang() || 'es').trim() || 'es';
          this.loading.set(true);
          this.loadError.set(false);
          this.product.set(null);
          return this.api.getProduct(`${s}?lang=${lang}`).pipe(
            map((r: unknown) => {
              if (r && typeof r === 'object' && 'error' in (r as Record<string, unknown>)) {
                return null;
              }
              return r as Product;
            }),
            tap((p) => {
              if (!p?.titleUrl) {
                this.loadError.set(true);
                this.product.set(null);
              } else {
                this.loadError.set(false);
                this.product.set(p);
              }
            }),
            catchError(() => {
              this.loadError.set(true);
              this.product.set(null);
              return of(null);
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.quickView.isOpen()) {
      this.quickView.close();
    }
  }

  onBackdropClick(): void {
    this.quickView.close();
  }

  onClose(): void {
    this.quickView.close();
  }

  addToCart(id: string): void {
    if (!id) {
      return;
    }
    this.cartDrawer.open();
    this.store.addToCart('?id=' + id);
  }

  /** PDP completa: cierra overlay y navega (misma URL que siempre). */
  goToFullPage(): void {
    const p = this.product();
    const lang = (this.selectors.appLang() || 'es').trim() || 'es';
    const slug = p?.titleUrl || this.quickView.titleUrl();
    if (!slug) {
      this.quickView.close();
      return;
    }
    this.quickView.close();
    void this.router.navigate(['/', lang, 'product', slug]);
  }
}

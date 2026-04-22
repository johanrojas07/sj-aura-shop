import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, take } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TranslatePipe } from '../../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../../pipes/price.pipe';
import { TranslateService } from '../../../services/translate.service';
import { ApiService } from '../../../services/api.service';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { CartDrawerService } from '../../../services/cart-drawer.service';
import { Cart, Product } from '../../models';
import { pickCategorySlugFromTags } from './cart-related.util';
import { ProductContentComponent } from '../product-content/product-content.component';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
    PriceFormatPipe,
    ProductContentComponent,
  ],
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.scss',
})
export class CartDrawerComponent {
  private readonly store = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);
  private readonly translate = inject(TranslateService);
  private readonly drawer = inject(CartDrawerService);
  private readonly api = inject(ApiService);

  readonly cart = this.selectors.cart;

  /** Solo mientras carga o hay sugerencias visibles (no en bolsa). */
  readonly similarRailVisible = computed(
    () => this.relatedLoading() || this.relatedProducts().length > 0,
  );

  readonly lang = toSignal(this.translate.getLang$().pipe(filter((l): l is string => !!l)), {
    initialValue: 'es',
  });

  readonly currency = this.selectors.currency;
  readonly categories = this.selectors.categories;

  /** Catálogo devuelto por la API (fijo por apertura del drawer). */
  readonly relatedProductPool = signal<Product[]>([]);
  /** Sugerencias visibles = pool menos lo que ya está en la bolsa (vuelve a mostrarse al quitar). */
  readonly relatedProducts = computed(() => {
    const c = this.cart();
    const pool = this.relatedProductPool();
    if (!pool.length) {
      return [];
    }
    const inCart = c?.items?.length ? this.inCartIdSet(c) : new Set<string>();
    return pool.filter((p) => p._id && !inCart.has(p._id));
  });

  readonly relatedLoading = signal(false);

  private relatedSub?: Subscription;
  /** Una sola carga de sugerencias por apertura del drawer; el carrito solo filtra sobre el pool. */
  private similarFetchedThisOpen = false;

  readonly quickViewOpen = signal(false);
  readonly quickViewLoading = signal(false);
  readonly quickViewProduct = signal<Product | null>(null);
  private quickViewSub?: Subscription;

  readonly cartIdsRecord = computed(() => {
    const c = this.cart();
    const acc: Record<string, number> = {};
    if (!c?.items?.length) {
      return acc;
    }
    for (const row of c.items) {
      const id = row.item?._id || row.id;
      if (id) {
        acc[id] = row.qty;
      }
    }
    return acc;
  });

  constructor() {
    effect((onCleanup) => {
      const open = this.drawer.isOpen();
      const c = this.cart();
      const lang = this.lang();

      if (!open || !c?.items?.length) {
        this.relatedSub?.unsubscribe();
        this.relatedSub = undefined;
        this.relatedProductPool.set([]);
        this.relatedLoading.set(false);
        this.similarFetchedThisOpen = false;
        this.closeQuickView();
        return;
      }

      if (this.similarFetchedThisOpen) {
        return;
      }

      this.relatedSub?.unsubscribe();

      const slugs = this.collectCategorySlugsFromCart(c);

      this.relatedLoading.set(true);

      const requests = slugs.map((slug) =>
        this.api
          .getProducts({ lang, page: 1, sort: 'newest', category: slug })
          .pipe(catchError(() => of({ products: [] as Product[] }))),
      );

      this.relatedSub = forkJoin(requests).subscribe({
        next: (results: { products?: Product[]; error?: unknown }[]) => {
          const merged = new Map<string, Product>();
          for (const res of results) {
            if (res?.error || !Array.isArray(res?.products)) {
              continue;
            }
            for (const p of res.products!) {
              if (p?._id) {
                merged.set(p._id, p);
              }
            }
          }
          const list = [...merged.values()].slice(0, 12);
          this.relatedProductPool.set(list);
          this.relatedLoading.set(false);
          this.similarFetchedThisOpen = true;
        },
        error: () => {
          this.relatedProductPool.set([]);
          this.relatedLoading.set(false);
          this.similarFetchedThisOpen = true;
        },
      });

      onCleanup(() => {
        this.relatedSub?.unsubscribe();
      });
    });
  }

  private inCartIdSet(c: Cart): Set<string> {
    const ids = new Set<string>();
    for (const row of c.items || []) {
      if (row.item?._id) {
        ids.add(row.item._id);
      }
      if (row.id) {
        ids.add(row.id);
      }
    }
    return ids;
  }

  collectCategorySlugsFromCart(c: Cart): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const lines = [...(c.items || [])].reverse();
    for (const row of lines) {
      const s = pickCategorySlugFromTags(row?.item?.tags);
      if (s && !seen.has(s)) {
        seen.add(s);
        ordered.push(s);
      }
    }
    for (const row of c.items || []) {
      const s = pickCategorySlugFromTags(row?.item?.tags);
      if (s && !seen.has(s)) {
        seen.add(s);
        ordered.push(s);
      }
    }
    const all = new Set<string>();
    for (const row of c.items || []) {
      for (const t of row?.item?.tags || []) {
        all.add(String(t).toLowerCase());
      }
    }
    for (const tag of ['mujeres', 'hombres', 'moda'] as const) {
      if (all.has(tag) && !seen.has(tag)) {
        seen.add(tag);
        ordered.push(tag);
      }
    }
    if (!ordered.length) {
      ordered.push('moda');
    }
    return ordered.slice(0, 4);
  }

  linkFor(titleUrl: string | undefined): string[] {
    const lang = this.lang();
    return titleUrl ? ['/', lang, 'product', titleUrl] : ['/'];
  }

  close(): void {
    this.drawer.close();
  }

  incrementQty(productId: string | undefined): void {
    if (!productId) return;
    this.store.addToCart(`?id=${productId}&lang=${this.lang()}`);
  }

  decrementQty(productId: string | undefined): void {
    if (!productId) return;
    this.store.removeFromCart(`?id=${productId}&lang=${this.lang()}`);
  }

  /** Confirma cantidad escrita en el input (blur o Enter). */
  commitLineQty(row: NonNullable<Cart['items']>[number], ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const productId = row.item?._id || row.id;
    if (!productId) return;
    const raw = String(el.value).trim();
    if (raw === '') {
      el.value = String(row.qty);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      el.value = String(row.qty);
      return;
    }
    const capped = Math.min(999, Math.max(0, parsed));
    if (capped === row.qty) {
      el.value = String(row.qty);
      return;
    }
    this.store.setCartLineQty(productId, this.lang(), capped);
  }

  blurQtyInput(ev: KeyboardEvent): void {
    (ev.target as HTMLInputElement | null)?.blur();
  }

  removeLine(productId: string | undefined, qty: number): void {
    if (!productId) return;
    this.store.removeCartLineCompletely(productId, this.lang(), qty);
  }

  openQuickView(p: Product): void {
    if (!p?.titleUrl) return;
    this.quickViewSub?.unsubscribe();
    this.quickViewOpen.set(true);
    this.quickViewProduct.set(p);
    this.quickViewLoading.set(true);
    const lang = this.lang();
    this.quickViewSub = this.api
      .getProduct(`${p.titleUrl}?lang=${lang}`)
      .pipe(take(1))
      .subscribe((res: any) => {
        this.quickViewLoading.set(false);
        if (res && !res.error && res._id) {
          this.quickViewProduct.set(res as Product);
        }
      });
  }

  closeQuickView(): void {
    this.quickViewSub?.unsubscribe();
    this.quickViewSub = undefined;
    this.quickViewProduct.set(null);
    this.quickViewLoading.set(false);
    this.quickViewOpen.set(false);
  }

  onQuickViewBackdrop(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('cart-drawer-quick-overlay')) {
      this.closeQuickView();
    }
  }

  onQuickViewAdd(id: string): void {
    if (!id) return;
    this.store.addToCart(`?id=${id}&lang=${this.lang()}`);
  }

  addRelated(p: Product): void {
    if (!p?._id) return;
    this.store.addToCart(`?id=${p._id}&lang=${this.lang()}`);
  }

  inCartIds(c: Cart | null | undefined): Set<string> {
    if (!c?.items?.length) {
      return new Set();
    }
    return this.inCartIdSet(c);
  }

  /** Producto en promoción con precio tachado + oferta. */
  relatedShowPromo(p: Product | null | undefined): boolean {
    if (!p?.onSale) {
      return false;
    }
    const reg = Number(p.regularPrice);
    const sale = Number(p.salePrice);
    return Number.isFinite(reg) && Number.isFinite(sale) && reg > sale;
  }

  lineProductTitle(title: string | undefined): string {
    if (!title) return '';
    const t = title.replace(/\s+/g, ' ').trim();
    const nlParts = title.split(/\n/).map((x) => x.trim()).filter(Boolean);
    if (nlParts.length > 1 && nlParts.every((x) => x === nlParts[0])) {
      return nlParts[0];
    }
    const half = Math.floor(t.length / 2);
    if (half >= 8) {
      const a = t.slice(0, half).trimEnd();
      const b = t.slice(half).trimStart();
      if (a === b) {
        return a;
      }
    }
    return t;
  }
}

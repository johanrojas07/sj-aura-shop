import { Component, OnInit, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TranslateService } from '../../../services/translate.service';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { OrderStatus, type Order, type Product } from '../../../shared/models';

export interface DashboardStats {
  productCount: number;
  visibleProductCount: number;
  categoryCount: number;
  totalStockUnits: number;
  lowStockCount: number;
  orderCount: number;
  ordersFetched: boolean;
  revenueCompleted: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false,
})
export class DashboardComponent implements OnInit {
  private readonly store = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);

  readonly translate = inject(TranslateService);
  readonly lang$: Observable<string> = this.translate.getLang$();

  readonly allProducts = this.selectors.allProducts;
  readonly allCategories = this.selectors.allCategories;
  readonly orders = this.selectors.orders;

  readonly stats = computed((): DashboardStats => {
    const products = this.allProducts() ?? [];
    const categoryCount = this.categoryListLength(this.allCategories());
    const ordersRaw = this.orders();
    const orderList: Order[] = Array.isArray(ordersRaw) ? ordersRaw : [];

    let totalStockUnits = 0;
    let visibleProducts = 0;
    let lowStock = 0;
    for (const p of products) {
      const q = this.productStockQty(p);
      totalStockUnits += q;
      if (this.isProductVisible(p)) {
        visibleProducts++;
      }
      if (q > 0 && q < 10) {
        lowStock++;
      }
    }

    const revenueCompleted = orderList
      .filter((o) => o.status === OrderStatus.COMPLETED)
      .reduce((s, o) => s + (Number(o.amount) || 0), 0);

    return {
      productCount: products.length,
      visibleProductCount: visibleProducts,
      categoryCount,
      totalStockUnits,
      lowStockCount: lowStock,
      orderCount: orderList.length,
      ordersFetched: ordersRaw !== null,
      revenueCompleted,
    };
  });

  ngOnInit(): void {
    this.store.getAllProducts();
    this.store.getAllCategories();
    this.store.getOrders();
  }

  /** API devuelve `{ category, productsWithCategory }[]` o array vacío ante error. */
  private categoryListLength(raw: unknown): number {
    if (!Array.isArray(raw)) {
      return 0;
    }
    return raw.length;
  }

  private productStockQty(p: Product): number {
    const n = p.stockQty;
    if (typeof n === 'number' && Number.isFinite(n)) {
      return Math.max(0, Math.floor(n));
    }
    return 0;
  }

  private isProductVisible(p: Product): boolean {
    if (typeof p.visibility === 'boolean') {
      return p.visibility;
    }
    const doc = p as Product & { es?: { visibility?: boolean }; en?: { visibility?: boolean } };
    return !!(doc.es?.visibility ?? doc.en?.visibility);
  }

}

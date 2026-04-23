import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslateService } from '../../../services/translate.service';

import { Order, OrderStatus } from '../../../shared/models';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';

@Component({
  selector: 'app-orders-edit',
  templateUrl: './orders-edit.component.html',
  styleUrls: ['./orders-edit.component.scss', '../_dash-admin-forms.shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class OrdersEditComponent {
  orders$: Signal<Order[]>;
  /** Idioma del panel (una sola fuente; evita `async` en `orderUrl` / `currentLang`). */
  readonly dashboardLang = signal('');
  readonly effectiveLang = computed(() => {
    const v = this.dashboardLang();
    return v && v.trim() ? v : 'es';
  });
  readonly orderUrl = computed(
    () => `/${this.effectiveLang()}/dashboard/orders/`,
  );

  readonly orderStats = computed(() => {
    const list = this.orders$() ?? [];
    if (!list.length) {
      return { total: 0, revenue: 0, open: 0 };
    }
    const revenue = list.reduce((acc, o) => acc + (Number(o?.amount) || 0), 0);
    const open = list.filter(
      (o) =>
        o?.status === OrderStatus.NEW ||
        o?.status === OrderStatus.PAID ||
        o?.status === OrderStatus.SHIPPING,
    ).length;
    return { total: list.length, revenue, open };
  });

  readonly component = 'ordersEdit';

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly store: SignalStore,
    private readonly selectors: SignalStoreSelectors,
    public readonly translate: TranslateService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.translate
      .getLang$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lang) => {
        this.dashboardLang.set(lang);
        this.cdr.markForCheck();
      });

    this.store.getOrders();
    this.orders$ = this.selectors.orders;
  }
}

import { Component, Input } from '@angular/core';

import { Order, OrderStatus } from '../../../../shared/models';
import { SignalStore } from '../../../../store/signal.store';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrls: ['./orders-list.component.scss'],
  standalone: false,
})
export class OrdersListComponent {
  @Input() orders: Order[];
  @Input() orderUrl: string;
  /** Admin / panel: permite cambiar estado sin entrar al detalle. */
  @Input() allowStatusChange = false;
  /** Para `relativeTime` (es | en | …). */
  @Input() currentLang: string | null = null;

  readonly orderStatuses = Object.values(OrderStatus);

  constructor(private readonly store: SignalStore) {}

  onStatusChange(order: Order, status: string): void {
    if (!order?.orderId || status === order.status) {
      return;
    }
    this.store.updateOrder({ orderId: order.orderId, status });
  }
}

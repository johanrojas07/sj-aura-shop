import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { Order, OrderStatus } from '../../../../shared/models';
import { SignalStore } from '../../../../store/signal.store';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrls: ['./orders-list.component.scss'],
  standalone: false,
})
export class OrdersListComponent implements OnChanges {
  @Input() orders: Order[];
  @Input() orderUrl: string;
  /** Admin / panel: permite cambiar estado sin entrar al detalle. */
  @Input() allowStatusChange = false;
  /** Para `relativeTime` (es | en | …). */
  @Input() currentLang: string | null = null;
  /** Muestra conmutador tabla / tarjetas (p. ej. en dashboard admin). */
  @Input() showViewToggle = false;

  readonly orderStatuses = Object.values(OrderStatus);
  /** Por defecto tabla en admin (más denso y ordenable). */
  readonly viewMode = signal<'table' | 'cards'>('table');
  readonly displayColumns: string[] = [
    'orderId',
    'status',
    'amount',
    'customer',
    'date',
    'actions',
  ];

  readonly dataSource = new MatTableDataSource<Order>([]);

  @ViewChild(MatPaginator) set paginator(p: MatPaginator | undefined) {
    this.dataSource.paginator = p ?? null;
  }

  @ViewChild(MatSort) set sort(s: MatSort | undefined) {
    this.dataSource.sort = s ?? null;
  }

  constructor(private readonly store: SignalStore) {
    this.dataSource.sortingDataAccessor = (row: Order, column: string) => {
      switch (column) {
        case 'orderId':
          return row.orderId ?? '';
        case 'status':
          return row.status ?? '';
        case 'amount':
          return Number(row.amount) || 0;
        case 'customer':
          return (row.customerEmail ?? '').toLowerCase();
        case 'date':
          return row.dateAdded ? new Date(row.dateAdded).getTime() : 0;
        default:
          return '';
      }
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['orders']) {
      this.dataSource.data = Array.isArray(this.orders) ? this.orders : [];
    }
  }

  onStatusChange(order: Order, status: string): void {
    if (!order?.orderId || status === order.status) {
      return;
    }
    this.store.updateOrder({ orderId: order.orderId, status });
  }

  onViewChange(ev: MatButtonToggleChange): void {
    const v = ev.value as 'table' | 'cards';
    if (v === 'table' || v === 'cards') {
      this.viewMode.set(v);
    }
  }

  detailLink(orderId: string | undefined): string {
    return `${this.orderUrl}${orderId || ''}`;
  }

  trackByOrderId(_index: number, row: Order): string {
    return row?.orderId ?? String(_index);
  }
}

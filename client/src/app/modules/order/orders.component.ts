import { Component, OnInit, Signal } from '@angular/core';
import { Observable } from 'rxjs';

import { TranslateService } from '../../services/translate.service';
import { User, Order } from '../../shared/models';
import { SignalStoreSelectors } from '../../store/signal.store.selectors';
import { SignalStore } from '../../store/signal.store';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss'],
  standalone: false,
})
export class OrdersComponent implements OnInit {
  orders$: Signal<Order[]>;
  readonly user: Signal<User | null>;
  lang$: Observable<string>;

  readonly component = 'orders';

  constructor(
    private selectors: SignalStoreSelectors,
    private translate: TranslateService,
    private store: SignalStore,
  ) {
    this.lang$ = this.translate.getLang$();
    this.orders$ = this.selectors.userOrders;
    this.user = this.selectors.user;
  }

  ngOnInit(): void {
    this.store.getUserOrders();
  }
}

import { Component } from '@angular/core';

import { SignalStoreSelectors } from '../../../store/signal.store.selectors';

@Component({
  selector: 'app-order',
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.scss'],
  standalone: false,
})
export class OrderComponent {
  /** En detalle, admin puede cambiar estado (mismo panel que en dashboard). */
  readonly detailType: 'BASIC' | 'EDIT';

  constructor(private readonly selectors: SignalStoreSelectors) {
    const u = this.selectors.user();
    this.detailType = Array.isArray(u?.roles) && u.roles.includes('admin') ? 'EDIT' : 'BASIC';
  }
}

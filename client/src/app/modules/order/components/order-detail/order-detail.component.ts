import { filter, map, take } from 'rxjs/operators';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Component, Input, Signal, effect } from '@angular/core';
import { Location } from '@angular/common';
import { Observable, combineLatest } from 'rxjs';

import { TranslateService } from '../../../../services/translate.service';
import { Order, OrderStatus } from '../../../../shared/models';
import { SignalStore } from '../../../../store/signal.store';
import { SignalStoreSelectors } from '../../../../store/signal.store.selectors';
import { toObservable } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.component.html',
  styleUrls: ['./order-detail.component.scss'],
  standalone: false,
})
export class OrderDetailComponent {
  @Input() type: string;

  order$: Signal<Order>;
  statusForm: FormGroup;
  orderId: string;
  readonly orderStatuses = Object.values(OrderStatus);
  lang$: Observable<string>;

  constructor(
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private location: Location,
    private readonly translateService: TranslateService,
  ) {
    this.lang$ = this.translateService.getLang$();

    this.statusForm = this.fb.group({
      status: ['', Validators.required],
    });

    combineLatest([
      toObservable(this.selectors.user).pipe(filter((user) => !!user)),
      this.route.params.pipe(map((params) => params['id'])),
    ]).subscribe(([_user, id]) => {
      this.store.getOrder(id);
      this.orderId = id;
    });

    this.order$ = this.selectors.order;

    effect(() => {
      const o = this.order$();
      const st = o?.status;
      if (st) {
        this.statusForm.patchValue({ status: st }, { emitEvent: false });
        this.statusForm.markAsPristine();
      }
    });
  }

  submit(): void {
    const status = this.statusForm.get('status')?.value;
    if (!status || !this.orderId) {
      return;
    }
    this.store.updateOrder({
      orderId: this.orderId,
      status,
    });
  }

  goBack(): void {
    this.location.back();
  }
}

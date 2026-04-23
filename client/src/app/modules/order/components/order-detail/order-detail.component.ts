import { filter, map } from 'rxjs/operators';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  Input,
  Signal,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { combineLatest } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { TranslateService } from '../../../../services/translate.service';
import { Order, OrderStatus } from '../../../../shared/models';
import { SignalStore } from '../../../../store/signal.store';
import { SignalStoreSelectors } from '../../../../store/signal.store.selectors';

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

  /** Idioma de rutas públicas (evita `async` repetido en la plantilla). */
  readonly dashboardLang = signal('es');

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly store: SignalStore,
    private readonly selectors: SignalStoreSelectors,
    private readonly route: ActivatedRoute,
    private readonly fb: FormBuilder,
    private readonly location: Location,
    private readonly translateService: TranslateService,
  ) {
    this.translateService
      .getLang$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lang) => {
        this.dashboardLang.set(lang?.trim() ? lang : 'es');
      });

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

  productLink(titleUrl: string | undefined): string[] {
    const slug = titleUrl || '';
    return ['/', this.dashboardLang(), 'product', slug];
  }
}

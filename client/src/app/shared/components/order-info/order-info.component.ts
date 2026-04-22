import { CommonModule } from '@angular/common';
import { Order } from './../../models';

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { PriceFormatPipe } from '../../../pipes/price.pipe';

@Component({
    selector: 'app-order-info',
    templateUrl: './order-info.component.html',
    styleUrls: ['./order-info.component.scss'],
    imports: [CommonModule, TranslatePipe, RouterLink, MatProgressBar, MatIconModule, PriceFormatPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderInfoComponent {

  @Input() order: Order;
  @Input() lang: string;

  trackById(_index: number, item) {
    return item._id;
  }
}

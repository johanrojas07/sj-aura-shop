import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, ROUTES, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIconModule } from '@angular/material/icon';

import { CartComponent } from './cart/cart.component';
import { SummaryComponent } from './summary/summary.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../pipes/price.pipe';
import { OrderInfoComponent } from '../../shared/components/order-info/order-info.component';

const CART_ROUTES: Routes = [
  { path: '', component: CartComponent },
  { path: 'summary', component: SummaryComponent },
];

@NgModule({
  declarations: [
    CartComponent,
    SummaryComponent
  ],
  imports: [
    CommonModule,
    TranslatePipe,
    PriceFormatPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatIconModule,
    MatStepperModule,
    OrderInfoComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  providers: [{ provide: ROUTES, multi: true, useValue: CART_ROUTES }],
})
export class CartModule { }

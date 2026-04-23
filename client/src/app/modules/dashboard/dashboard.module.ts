import { NgModule } from '@angular/core';
import { Routes, RouterOutlet, RouterLink, RouterLinkActive, ROUTES } from '@angular/router';
import { CommonModule } from '@angular/common';
import { EditorModule } from '@tinymce/tinymce-angular';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';

import { ProductsEditComponent } from './products-edit/products-edit.component';
import { ProductImageCropDialogComponent } from './products-edit/product-image-crop-dialog.component';
import { OrdersEditComponent } from './orders-edit/orders-edit.component';
import { OrderEditComponent } from './orders-edit/order-edit/order-edit.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { TinyEditorComponent } from './tiny-editor.ts/tiny-editor.component';
import { TranslationsEditComponent } from './translations-edit/translations-edit.component';
import { AllProductsComponent } from './all-products/all-products.component';
import { ThemeEditComponent } from './theme-edit/theme-edit.component';
import { CategoriesEditComponent } from './categories-edit/categories-edit.component';
import { OrderComponentsModule } from '../order/components/order-components.module';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../pipes/price.pipe';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { ProductsListComponent } from '../../shared/components/products-list/products-list.component';
import { DashboardLayoutComponent } from './dashboard-layout/dashboard-layout.component';
import { LoyaltyCustomersComponent } from './loyalty-customers/loyalty-customers.component';
import { LoyaltyCustomerDetailComponent } from './loyalty-customer-detail/loyalty-customer-detail.component';
import { LoyaltyManualPurchaseComponent } from './loyalty-manual-purchase/loyalty-manual-purchase.component';

const DASHBOARD_ROUTER: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: DashboardComponent },
      { path: 'catalog', component: AllProductsComponent },
      { path: 'orders', component: OrdersEditComponent },
      { path: 'orders/:id', component: OrderEditComponent },
      { path: 'loyalty', component: LoyaltyCustomersComponent },
      { path: 'loyalty/manual', component: LoyaltyManualPurchaseComponent },
      { path: 'loyalty/detail', component: LoyaltyCustomerDetailComponent },
      { path: 'translations', component: TranslationsEditComponent },
      { path: 'categories', component: CategoriesEditComponent },
      { path: 'theme', component: ThemeEditComponent },
      {
        path: 'product-add',
        component: ProductsEditComponent,
        data: { action: 'add' },
      },
      {
        path: 'product-edit/:titleUrl',
        component: ProductsEditComponent,
        data: { action: 'edit' },
      },
    ],
  },
];

@NgModule({
  imports: [
    CommonModule,
    OrderComponentsModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    PriceFormatPipe,
    RelativeTimePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    EditorModule,
    MatButtonModule,
    MatInputModule,
    MatCardModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatIconModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatSliderModule,
    MatCheckboxModule,
    MatTableModule,
    MatPaginatorModule,
    ProductsListComponent,
  ],
  providers: [{ provide: ROUTES, multi: true, useValue: DASHBOARD_ROUTER }],
  declarations: [
    DashboardLayoutComponent,
    ProductsEditComponent,
    ProductImageCropDialogComponent,
    CategoriesEditComponent,
    OrdersEditComponent,
    OrderEditComponent,
    AllProductsComponent,
    DashboardComponent,
    TinyEditorComponent,
    TranslationsEditComponent,
    ThemeEditComponent,
    LoyaltyCustomersComponent,
    LoyaltyCustomerDetailComponent,
    LoyaltyManualPurchaseComponent,
  ],
})
export class DashboardModule {}

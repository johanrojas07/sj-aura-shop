import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, ROUTES, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProductComponent } from './product/product.component';
import { ProductsComponent } from './products/products.component';
import { CategoriesListComponent } from '../../shared/components/categories-list/categories-list.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PriceFormatPipe } from '../../pipes/price.pipe';
import { ProductContentComponent } from '../../shared/components/product-content/product-content.component';
import { ProductsListComponent } from '../../shared/components/products-list/products-list.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { RecentProductsStripComponent } from '../../shared/components/recent-products-strip/recent-products-strip.component';

const PRODUCT_ROUTES: Routes = [
  { path: 'all', component: ProductsComponent },
  { path: 'category/:category', component: ProductsComponent },
  { path: ':id', component: ProductComponent },
];

@NgModule({
  declarations: [
    ProductComponent,
    ProductsComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSidenavModule,

    TranslatePipe,
    PriceFormatPipe,

    CategoriesListComponent,
    ProductContentComponent,
    ProductsListComponent,
    PaginationComponent,
    SidebarComponent,
    RecentProductsStripComponent,

    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  providers: [{ provide: ROUTES, multi: true, useValue: PRODUCT_ROUTES }],
})
export class ProductModule { }

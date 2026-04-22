import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { RecentProductsService, RecentProductSnapshot } from '../../../services/recent-products.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

@Component({
  selector: 'app-recent-products-strip',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './recent-products-strip.component.html',
  styleUrl: './recent-products-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentProductsStripComponent {
  @Input({ required: true }) lang!: string;

  private readonly recent = inject(RecentProductsService);

  protected readonly items = this.recent.recent;
  protected readonly last = this.recent.lastViewed;

  productLink(it: RecentProductSnapshot): string[] {
    return ['/', this.lang, 'product', it.titleUrl];
  }
}

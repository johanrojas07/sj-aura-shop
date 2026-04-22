import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '../../../pipes/translate.pipe';

export interface CatalogAdminGalleryData {
  title: string;
  images: string[];
  stockQty: number | null | undefined;
}

@Component({
  selector: 'app-catalog-admin-gallery-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title class="catgal-title">{{ data.title }}</h2>
    <mat-dialog-content class="catgal-body">
      <p class="catgal-stock">
        {{ 'DASH_CATALOG_STOCK_LABEL' | translate | async }}:
        <strong>{{ stockLabel }}</strong>
      </p>
      <div class="catgal-grid">
        @for (img of data.images; track img) {
          <figure class="catgal-figure">
            <img [src]="img" alt="" loading="lazy" />
          </figure>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" mat-dialog-close>
        {{ 'DASH_CATALOG_GALLERY_CLOSE' | translate | async }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .catgal-title {
        margin: 0 0 0.25rem;
        font-size: 1.1rem;
        font-weight: 700;
        line-height: 1.3;
        padding-right: 2rem;
      }
      .catgal-body {
        padding-top: 0.25rem !important;
        max-height: min(70vh, 640px);
      }
      .catgal-stock {
        margin: 0 0 0.85rem;
        font-size: 0.9rem;
        color: #475569;
      }
      .catgal-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 0.65rem;
      }
      .catgal-figure {
        margin: 0;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: #f8fafc;
        aspect-ratio: 3 / 4;
      }
      .catgal-figure img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `,
  ],
})
export class CatalogAdminGalleryDialogComponent {
  readonly data = inject<CatalogAdminGalleryData>(MAT_DIALOG_DATA);

  get stockLabel(): string {
    const n = this.data.stockQty;
    if (n == null || Number.isNaN(Number(n))) {
      return '—';
    }
    return String(Math.max(0, Math.floor(Number(n))));
  }
}

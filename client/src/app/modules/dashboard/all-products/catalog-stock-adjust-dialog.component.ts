import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '../../../pipes/translate.pipe';

export interface CatalogStockAdjustData {
  title: string;
  titleUrl: string;
  stockQty: number;
}

export interface CatalogStockAdjustResult {
  stockQty: number;
}

@Component({
  selector: 'app-catalog-stock-adjust-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title class="stock-dlg-title">{{ data.title }}</h2>
    <mat-dialog-content class="stock-dlg-body">
      <p class="stock-dlg-current">
        {{ 'DASH_CATALOG_STOCK_CURRENT_LABEL' | translate | async }}:
        <span class="stock-dlg-current-num">{{ baseQty }}</span>
      </p>
      <p class="stock-dlg-hint">{{ 'DASH_CATALOG_STOCK_DELTA_HINT' | translate | async }}</p>
      <div class="stock-dlg-chips">
        <button type="button" mat-stroked-button class="stock-dlg-chip" (click)="addDelta(-10)">−10</button>
        <button type="button" mat-stroked-button class="stock-dlg-chip" (click)="addDelta(-1)">−1</button>
        <button type="button" mat-stroked-button class="stock-dlg-chip" (click)="addDelta(1)">+1</button>
        <button type="button" mat-stroked-button class="stock-dlg-chip" (click)="addDelta(10)">+10</button>
      </div>
      <mat-form-field class="stock-dlg-field" appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'DASH_CATALOG_STOCK_DELTA_LABEL' | translate | async }}</mat-label>
        <input matInput type="number" name="delta" [(ngModel)]="delta" step="1" />
      </mat-form-field>
      <p class="stock-dlg-result">
        {{ 'DASH_CATALOG_STOCK_RESULT_LABEL' | translate | async }}:
        <strong>{{ resultQty }}</strong>
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="stock-dlg-actions">
      <button mat-button type="button" mat-dialog-close>{{ 'DASH_CATALOG_STOCK_CANCEL' | translate | async }}</button>
      <button mat-flat-button color="primary" type="button" (click)="apply()">
        {{ 'DASH_CATALOG_STOCK_SAVE' | translate | async }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .stock-dlg-title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        line-height: 1.3;
        padding-right: 2rem;
      }
      .stock-dlg-body {
        padding-top: 0.35rem !important;
      }
      .stock-dlg-current {
        margin: 0 0 0.35rem;
        font-size: 0.9rem;
        color: #475569;
      }
      .stock-dlg-current-num {
        font-size: 1.35rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: #0f172a;
        margin-left: 0.25rem;
      }
      .stock-dlg-hint {
        margin: 0 0 0.65rem;
        font-size: 0.82rem;
        line-height: 1.45;
        color: #64748b;
      }
      .stock-dlg-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.85rem;
      }
      .stock-dlg-chip {
        min-width: 3.25rem !important;
        font-weight: 700 !important;
      }
      .stock-dlg-field {
        width: 100%;
        margin-bottom: 0.5rem;
      }
      .stock-dlg-result {
        margin: 0.5rem 0 0;
        font-size: 0.95rem;
        color: #334155;
      }
      .stock-dlg-actions {
        padding-top: 0.5rem !important;
      }
    `,
  ],
})
export class CatalogStockAdjustDialogComponent {
  readonly data = inject<CatalogStockAdjustData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CatalogStockAdjustDialogComponent, CatalogStockAdjustResult | undefined>);

  delta = 0;

  get baseQty(): number {
    const n = Number(this.data.stockQty);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  get resultQty(): number {
    const d = Number(this.delta);
    const adj = Number.isFinite(d) ? Math.trunc(d) : 0;
    return Math.max(0, this.baseQty + adj);
  }

  addDelta(n: number): void {
    const d = Number(this.delta);
    this.delta = (Number.isFinite(d) ? Math.trunc(d) : 0) + n;
  }

  apply(): void {
    this.dialogRef.close({ stockQty: this.resultQty });
  }
}

import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { canvasToJpegFile, loadImageFromFile, renderPortrait3x4 } from './image-crop.util';

export interface ProductImageCropDialogData {
  file: File;
}

export type ProductImageCropDialogResult =
  | { action: 'cancel' }
  | { action: 'original' }
  | { action: 'cropped'; file: File };

@Component({
  selector: 'app-product-image-crop-dialog',
  templateUrl: './product-image-crop-dialog.component.html',
  styleUrls: ['./product-image-crop-dialog.component.scss'],
  standalone: false,
})
export class ProductImageCropDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<ProductImageCropDialogComponent, ProductImageCropDialogResult>);

  @ViewChild('previewCanvas') private previewCanvas?: ElementRef<HTMLCanvasElement>;

  constructor(@Inject(MAT_DIALOG_DATA) public data: ProductImageCropDialogData) {}

  readonly file = this.data.file;
  previewUrl = '';
  zoom = 1;
  minZoom = 1;
  maxZoom = 2.8;
  step = 0.05;
  busy = false;
  private img: HTMLImageElement | null = null;

  async ngOnInit(): Promise<void> {
    this.previewUrl = URL.createObjectURL(this.file);
    this.img = await loadImageFromFile(this.file);
    queueMicrotask(() => this.redraw());
  }

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
  }

  onZoomChange(): void {
    this.redraw();
  }

  private redraw(): void {
    if (!this.img) {
      return;
    }
    const el = this.previewCanvas?.nativeElement;
    if (!el) {
      return;
    }
    const { canvas } = renderPortrait3x4(this.img, this.zoom);
    const ctx = el.getContext('2d');
    if (!ctx) {
      return;
    }
    const w = 280;
    const h = Math.round(w / (3 / 4));
    el.width = w;
    el.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
  }

  useOriginal(): void {
    this.dialogRef.close({ action: 'original' } satisfies ProductImageCropDialogResult);
  }

  cancel(): void {
    this.dialogRef.close({ action: 'cancel' } satisfies ProductImageCropDialogResult);
  }

  async applyCropped(): Promise<void> {
    if (!this.img) {
      return;
    }
    this.busy = true;
    try {
      const { canvas } = renderPortrait3x4(this.img, this.zoom);
      const f = await canvasToJpegFile(canvas, this.file.name, 0.9);
      this.dialogRef.close({ action: 'cropped', file: f } satisfies ProductImageCropDialogResult);
    } finally {
      this.busy = false;
    }
  }
}

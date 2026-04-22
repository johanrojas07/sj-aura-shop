/** Relación ancho/alto (moda, vertical): ancho:alto = 3:4 → w/h = 0.75 */
export const PORTRAIT_3X4 = 3 / 4;

/** Más "cuadrada" que 3:4: si w/h > esto, sugerimos o aplicamos recorte. */
export const SQUAREISH_THRESHOLD = 0.86;

/**
 * Carga un archivo de imagen y retorna sus dimensiones naturales.
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}

export function isAspectTooSquareForFashion(w: number, h: number): boolean {
  if (!h || !w) {
    return true;
  }
  return w / h > SQUAREISH_THRESHOLD;
}

/**
 * Recorte 3:4 vertical centrado. zoom 1 = encuadre máximo; >1 acerca (recorta una ventana más pequeña).
 * Salida: alto 1600 px.
 */
export function renderPortrait3x4(
  img: HTMLImageElement,
  zoom: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const z = Math.max(1, Math.min(3, zoom));
  const targetRatio = PORTRAIT_3X4;
  let cropW: number;
  let cropH: number;
  let sx: number;
  let sy: number;
  if (nw / nh > targetRatio) {
    cropH = nh;
    cropW = nh * targetRatio;
    sx = (nw - cropW) / 2;
    sy = 0;
  } else {
    cropW = nw;
    cropH = nw / targetRatio;
    sx = 0;
    sy = (nh - cropH) / 2;
  }
  const f = 1 / z;
  const newW = cropW * f;
  const newH = cropH * f;
  const nsx = sx + (cropW - newW) / 2;
  const nsy = sy + (cropH - newH) / 2;
  const outH = 1600;
  const outW = Math.round(outH * targetRatio);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('no_2d');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, nsx, nsy, newW, newH, 0, 0, outW, outH);
  return { canvas, width: outW, height: outH };
}

export function canvasToJpegFile(canvas: HTMLCanvasElement, filename: string, quality = 0.9): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('blob'));
          return;
        }
        const name = filename.replace(/\.[^.]+$/, '') + '-recorte.jpg';
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality,
    );
  });
}

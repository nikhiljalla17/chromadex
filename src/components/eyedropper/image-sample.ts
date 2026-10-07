/**
 * Eyedropper sampling seams (ticket 10).
 *
 * Two injectable seams keep the component testable without fighting jsdom
 * (which cannot decode images or rasterize canvas):
 *
 *  - `ImageFileLoader`: File → decoded, size-capped `LoadedImage` (a draw
 *    closure plus metadata). Tests inject a fake loader; the component never
 *    touches `URL.createObjectURL`, `FileReader`, or `new Image()` itself.
 *  - `PixelReader`: coordinate-based region reads off the sampling canvas.
 *    The DOM implementation (`canvasPixelReader`) does one `getImageData`
 *    per call for the whole box; tests inject deterministic readers.
 *
 * The displayed canvas IS the preview and the sampling raster: the image is
 * drawn once at its capped size, so hover sampling is a small box read per
 * pointermove and click sampling reads the exact displayed pixels.
 */

/** An 8-bit sRGB pixel as read from a raster. */
export interface Rgb8 {
  r: number;
  g: number;
  b: number;
}

/** A decoded image ready to be rasterized onto the sampling canvas. */
export interface LoadedImage {
  /** Original file name, for the caption. */
  name: string;
  /** Backing-store (capped) width the draw closure paints. */
  width: number;
  /** Backing-store (capped) height the draw closure paints. */
  height: number;
  /** Rasterize onto a canvas of `width` × `height`. */
  draw(canvas: HTMLCanvasElement): void;
}

/**
 * Reads a (2·half+1)² box of pixels centered at (x, y), row-major, in
 * canvas coordinates. Out-of-bounds cells are null. Returns null when the
 * center is outside the image or no raster is available.
 */
export type PixelReader = (
  x: number,
  y: number,
  half: number,
) => (Rgb8 | null)[] | null;

/** Long-side cap for the sampling canvas (usability raster, cheap reads). */
export const MAX_SAMPLE_SIZE = 512;

/**
 * DOM image loader: decodes via `createObjectURL` + `Image`, computes the
 * aspect-preserving cap at MAX_SAMPLE_SIZE, and returns a `drawImage`
 * closure. Resolves null when the file cannot be decoded (never throws).
 */
export function loadImageFile(file: File): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (value: LoadedImage | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => {
      const scale = Math.min(
        1,
        MAX_SAMPLE_SIZE / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      done({
        name: file.name,
        width,
        height,
        draw(canvas) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          // No 2D context (jsdom): nothing to rasterize.
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, width, height);
        },
      });
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** DOM pixel reader: one `getImageData` per call for the whole box. */
export function canvasPixelReader(canvas: HTMLCanvasElement): PixelReader {
  return (x, y, half) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const size = 2 * half + 1;
    const x0 = x - half;
    const y0 = y - half;
    // Clamp the box to the canvas; pad with nulls to keep row-major geometry.
    const sx = Math.max(0, x0);
    const sy = Math.max(0, y0);
    const ex = Math.min(canvas.width, x0 + size);
    const ey = Math.min(canvas.height, y0 + size);
    const out: (Rgb8 | null)[] = new Array(size * size).fill(null);
    if (ex > sx && ey > sy) {
      const data = ctx.getImageData(sx, sy, ex - sx, ey - sy).data;
      for (let ry = sy; ry < ey; ry++) {
        for (let rx = sx; rx < ex; rx++) {
          const i = ((ry - sy) * (ex - sx) + (rx - sx)) * 4;
          out[(ry - y0) * size + (rx - x0)] = {
            r: data[i],
            g: data[i + 1],
            b: data[i + 2],
          };
        }
      }
    }
    return out;
  };
}

/**
 * Map a client-space pointer event onto sampling-canvas coordinates (rounded).
 * `width`/`height` are the effective raster dimensions: the canvas's real
 * size in browsers, the LoadedImage's dimensions where rasterization was
 * impossible (jsdom draw no-op leaves canvas.width 0).
 */
export function eventToCanvasPoint(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  // jsdom reports zero-sized rects; never divide by zero.
  const scale = Math.max(rect.width, 1) / Math.max(width, 1);
  const x = Math.floor((event.clientX - rect.left) / scale);
  const y = Math.floor((event.clientY - rect.top) / scale);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

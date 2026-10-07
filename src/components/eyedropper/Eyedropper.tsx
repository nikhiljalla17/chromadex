/**
 * The Eyedropper (ticket 10): image → Current Color, three ways in —
 * file picker, drag-and-drop, clipboard paste. The uploaded image renders
 * on the sampling canvas (long side capped at MAX_SAMPLE_SIZE, aspect
 * preserved); hovering shows a magnified loupe of the pixels under the
 * pointer; clicking samples the centered pixel and dispatches
 * `setFromSrgb`, so every Driver/view follows.
 *
 * jsdom-safe by construction: image decoding and pixel reading are
 * injectable seams (`loadImageFile`, `canvasPixelReader` — see
 * image-sample.ts); the canvas is blank there, which degrades to a
 * metadata-only caption, and the component keeps working.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, PointerEvent } from "react";

import { currentColorStore } from "../../state/store";
import { Button } from "../ui/button";
import {
  canvasPixelReader,
  eventToCanvasPoint,
  loadImageFile,
  type LoadedImage,
  type PixelReader,
  type Rgb8,
} from "./image-sample";

const LOUPE_HALF = 4; // 9×9 magnified region
const MAX_FILE_MB = 20; // oversize-image guard (see readFile)
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const LOUPE_PX = 26; // rendered size of one magnified pixel

/**
 * Linear index of the loupe's center cell (row LOUPE_HALF, col LOUPE_HALF of
 * the (2·half+1)² grid). Bug found at ticket 18: the previous formula
 * `LOUPE_HALF * (LOUPE_HALF + 1)` = 20 points two rows above center (40), so
 * the "sample" marker outlined the wrong cell — invisible in tests because
 * every cell painted the same color.
 */
const LOUPE_CENTER = LOUPE_HALF * (LOUPE_HALF * 2 + 1) + LOUPE_HALF;

/** Full rendered loupe width: pixel grid + card padding. */
const LOUPE_W_PX = LOUPE_PX * (LOUPE_HALF * 2 + 1) + 8;

/**
 * Loupe x position: centered above the pointer, clamped so the loupe stays
 * fully inside the canvas (ticket 10 review P2 polish).
 */
function clampLoupeLeft(
  hover: { x: number; y: number },
  imageWidth: number,
): number {
  const canvasW = canvasClientWidth();
  const pointerPx = (hover.x * canvasW) / (imageWidth || 1);
  return Math.min(
    Math.max(0, pointerPx - LOUPE_W_PX / 2),
    Math.max(0, canvasW - LOUPE_W_PX),
  );
}

function canvasClientWidth(): number {
  // jsdom reports 0; the clamp degenerates to [0, 0] there, as before.
  return document.querySelector('[data-testid="eyedropper-canvas"]')?.clientWidth ?? 0;
}

export interface EyedropperProps {
  /** Image decoding seam (tests inject fakes). */
  loadImage?: typeof loadImageFile;
  /**
   * Pixel-reading seam. Receives the sampling canvas once an image is
   * loaded; the default wraps it with the DOM reader. Tests inject a
   * deterministic reader and never touch canvas internals.
   */
  makePixelReader?: (canvas: HTMLCanvasElement) => PixelReader;
}

export function Eyedropper({
  loadImage = loadImageFile,
  makePixelReader = canvasPixelReader,
}: EyedropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<PixelReader | null>(null);
  /** Latest decode request id: stale decodes (rapid re-uploads) never win. */
  const loadSeqRef = useRef(0);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  /** Selection confirmation: the sampled image-space point, flashed briefly. */
  const [pulse, setPulse] = useState<{ x: number; y: number; key: number } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Oversize guard (ticket 27): files above this are rejected before decode —
   *  a multi-hundred-MB image can freeze the tab even though the sampling
   *  canvas later caps at MAX_SAMPLE_SIZE. Policy lives here, not in the
   *  engine (the engine stays pure). */
  const [loadNote, setLoadNote] = useState<string | null>(null);

  const readFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      if (file.size > MAX_FILE_BYTES) {
        setLoadNote(
          `Image too large (${(file.size / 1024 / 1024).toFixed(0)} MB) — pick something under ${MAX_FILE_MB} MB.`,
        );
        return;
      }
      const seq = ++loadSeqRef.current;
      const loaded = await loadImage(file);
      // A newer decode superseded this one.
      if (seq !== loadSeqRef.current) return;
      if (!loaded) return;
      setLoadNote(null);
      // Rasterization happens in the effect below once the canvas mounts.
      setImage(loaded);
      setHover(null);
    },
    [loadImage],
  );

  // Rasterize + (re)build the pixel reader whenever the image changes.
  // Runs after mount, so canvasRef is populated (unlike the async readFile
  // continuation, which lands before the re-render).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) {
      readerRef.current = null;
      return;
    }
    image.draw(canvas);
    readerRef.current = makePixelReader(canvas);
  }, [image, makePixelReader]);

  // Selection-pulse timer cleanup (ticket 18).
  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  // File picker path.
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
    // Allow re-selecting the same file later.
    event.target.value = "";
  };

  // Drag-and-drop paths (dragenter fires once on entry; dragover repeats).
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void readFile(event.dataTransfer.files?.[0]);
  };

  // Clipboard paste path: app-level listener; fires only for image files.
  // Dual text+image clipboards (ticket 10 review note): if the clipboard
  // carries text alongside an image, the text is deliberately left alone —
  // this surface only ever consumes image items, and `preventDefault` is
  // called only when an image is consumed, so plain-text paste behavior
  // (inputs, other handlers) is unaffected.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void readFile(file);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [readFile]);

  function clearImage() {
    loadSeqRef.current++; // invalidate any in-flight decode
    setImage(null);
    setHover(null);
    setPulse(null);
    readerRef.current = null;
  }

  function pointerToCanvas(
    event: PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas || !image) return null;
    return eventToCanvasPoint(event, canvas, image.width, image.height);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    setHover(pointerToCanvas(event));
  }

  function onPointerLeave() {
    setHover(null);
  }

  function onCanvasPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointerToCanvas(event);
    if (!point) return;
    sampleAt(point.x, point.y);
  }

  /** Sample the pixel at image-space (x, y) into the Current Color. */
  function sampleAt(x: number, y: number) {
    const reader = readerRef.current;
    if (!reader) return;
    const pixels = reader(x, y, 0);
    const pixel = pixels?.[0];
    if (!pixel) return;
    currentColorStore.dispatch({
      type: "setFromSrgb",
      color: { r: pixel.r / 255, g: pixel.g / 255, b: pixel.b / 255 },
    });
    // Selection confirmation (ticket 18): a brief pulse at the sampled point.
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse({ x, y, key: Date.now() });
    pulseTimer.current = setTimeout(() => setPulse(null), 600);
  }

  // Keyboard sampling (a11y pass, ticket 12): the canvas is focusable;
  // arrow keys move the sample point (the hover state — the loupe follows),
  // Shift ×10; Enter/Space samples the point. Sampling needs no pointer.
  function onCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!image) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const point = hover ?? {
        x: Math.floor(image.width / 2),
        y: Math.floor(image.height / 2),
      };
      sampleAt(point.x, point.y);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const base = hover ?? {
      x: Math.floor(image.width / 2),
      y: Math.floor(image.height / 2),
    };
    setHover({
      x: Math.min(image.width - 1, Math.max(0, base.x + delta[0] * step)),
      y: Math.min(image.height - 1, Math.max(0, base.y + delta[1] * step)),
    });
  }

  // Keyboard baseline: the drop area opens the file picker on Enter/Space.
  // Full sample-by-keyboard is deferred to ticket 12 (a11y pass).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    fileInputRef.current?.click();
  }

  // Client-space scale factors for the marker/pulse transforms. jsdom
  // reports 0 for both — transforms degenerate to 0, which keeps the
  // marker present and testable.
  const canvasW = canvasClientWidth();
  const canvasH =
    document.querySelector<HTMLCanvasElement>('[data-testid="eyedropper-canvas"]')
      ?.offsetHeight ?? 0;

  const loupePixels: (Rgb8 | null)[] | null =
    hover && readerRef.current ? readerRef.current(hover.x, hover.y, LOUPE_HALF) : null;

  return (
    <div
      data-testid="eyedropper"
      role="button"
      tabIndex={0}
      aria-label="Eyedropper: drop an image, paste, or browse to sample colors"
      onKeyDown={onKeyDown}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        "relative rounded-lg border border-dashed p-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring/60 " +
        (dragOver ? "border-primary bg-primary/10" : "border-border")
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="eyedropper-file-input"
        onChange={onFileChange}
      />

      {loadNote && (
        <p data-testid="eyedropper-note" className="text-xs text-destructive" role="status">
          {loadNote}
        </p>
      )}
      {!image ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-sm text-muted-foreground">
            Drop an image here, paste from clipboard, or
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="eyedropper-browse"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse…
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative mx-auto" style={{ touchAction: "none" }}>
            <canvas
              ref={canvasRef}
              data-testid="eyedropper-canvas"
              className="block max-w-full cursor-crosshair rounded border border-border focus-visible:outline-2 focus-visible:outline-ring"
              role="img"
              aria-label="Uploaded image sampling surface: arrow keys move the sample point, Enter samples"
              tabIndex={0}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
              onKeyDown={onCanvasKeyDown}
            />
            {loupePixels && hover && (
              <div
                data-testid="eyedropper-loupe"
                className="pointer-events-none absolute z-10 rounded border border-border bg-background/95 p-1 shadow-lg"
                style={{
                  gridTemplateColumns: `repeat(${LOUPE_HALF * 2 + 1}, ${LOUPE_PX}px)`,
                  display: "grid",
                  // Anchor above the pointer, horizontally clamped inside the
                  // canvas (a11y pass, ticket 12: pointer-anchored centering
                  // + clamp so the loupe never hangs off either edge).
                  left: clampLoupeLeft(hover, image.width),
                  top: -LOUPE_PX * (LOUPE_HALF + 1) - 8,
                }}
              >
                {loupePixels.map((pixel, i) => (
                  <div
                    key={i}
                    title={i === LOUPE_CENTER ? "sample" : undefined}
                    style={{
                      width: LOUPE_PX,
                      height: LOUPE_PX,
                      backgroundColor: pixel
                        ? `rgb(${pixel.r} ${pixel.g} ${pixel.b})`
                        : "transparent",
                      ...(i === LOUPE_CENTER
                        ? // Ticket 18: the selected cell must be unmistakable —
                          // 2px accent outline + light/dark inset rims so it reads
                          // over any fill color, not just mid-tones.
                          {
                            outline: "2px solid var(--primary)",
                            outlineOffset: "-2px",
                            boxShadow:
                              "inset 0 0 0 2px rgba(255,255,255,0.9), inset 0 0 0 3px rgba(0,0,0,0.6)",
                          }
                        : {}),
                    }}
                  />
                ))}
              </div>
            )}
            {/* Ticket 18: live marker on the image itself — a ring at the
                hovered pixel so the source and the loupe visibly agree on
                what's being magnified. transform-positioned (cheap), inert. */}
            {hover && (
              <div
                data-testid="eyedropper-marker"
                className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
                style={{
                  width: 14,
                  height: 14,
                  left: 0,
                  top: 0,
                  transform: `translate(${hover.x * canvasW / image.width - 7}px, ${hover.y * canvasH / image.height - 7}px)`,
                }}
              />
            )}
            {/* Ticket 18: click confirmation pulse at the sampled point. */}
            {pulse && (
              <div
                key={pulse.key}
                data-testid="eyedropper-pulse"
                className="pointer-events-none absolute rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_1px_rgba(0,0,0,0.7)] animate-ping-once"
                style={{
                  width: 22,
                  height: 22,
                  left: 0,
                  top: 0,
                  transform: `translate(${pulse.x * canvasW / image.width - 11}px, ${pulse.y * canvasH / image.height - 11}px)`,
                }}
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-testid="eyedropper-caption" className="truncate">
              {image.name} · {image.width}×{image.height}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-testid="eyedropper-clear"
              onClick={clearImage}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

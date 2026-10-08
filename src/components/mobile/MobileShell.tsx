/**
 * The mobile shell (ticket 30): the validated Spotlight layout from the
 * on-device prototype (`prototype/mobile-layout`, MobilePrototype.tsx v2) —
 * a no-scroll vertical stack rendered by App below the 768px breakpoint:
 *
 *   1. Media slot (~26vh): the Gamut Map OR the uploaded image (Spotlight
 *      focus). Live focus thumbnails below — a real mini GamutMap and the
 *      uploaded image thumbnail — tap to promote; Upload focuses the image.
 *   2. Combined swatch-hex bar (~48px): one colored bar with the editable
 *      hex inside, contrast-aware ink.
 *   3. Drivers region (flex-1): RGB + HSL mounted; the whole region scrolls
 *      (the only scrollable region — the page itself never scrolls).
 *   4. Compact upload row with the Eyedropper privacy microcopy.
 *   5. Fixed ticker slot (~14vh): the ticket-31 Name Wheel in horizontal
 *      ticker mode (its title row carries the approximation copy).
 *
 * Safe areas: `env(safe-area-inset-*)` on the root padding (an `env()`
 * expression a browser can't resolve is dropped at parse time, so the p-2
 * class padding still applies there). Proportions follow the prototype.
 */

import { useEffect, useRef, useState } from "react";

import { chromaticityOf, srgbToHex } from "../../lib/color";
import { contrastInk } from "../../lib/color/hex";
import { currentColorStore, useCurrentColor } from "../../state/store";
import { HslDriver } from "../drivers/HslDriver";
import { RgbDriver } from "../drivers/RgbDriver";
import { Eyedropper } from "../eyedropper/Eyedropper";
import type { LoadedImage } from "../eyedropper/image-sample";
import { GamutMap } from "../gamut/GamutMap";
import { GamutMapInfo } from "../gamut/GamutMapInfo";
import { LuminanceSlider } from "../gamut/LuminanceSlider";
import { NameWheel } from "../name-wheel/NameWheel";
import { NameWheelInfo } from "../name-wheel/NameWheelInfo";

/** Spotlight focus: which surface fills the media slot. */
type Focus = "map" | "image";

/** Thumbnail of the uploaded image: rasterized onto a small canvas. */
function ImageThumb({ image }: { image: LoadedImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) image.draw(canvas);
  }, [image]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-full w-full object-contain"
    />
  );
}

export function MobileShell() {
  const { color } = useCurrentColor();
  const chroma = chromaticityOf(color);
  const hex = srgbToHex({ ...color, a: 1 });
  const [focus, setFocus] = useState<Focus>("map");
  /** Mirror of the Eyedropper's decoded image, for the image thumbnail. */
  const [uploadedImage, setUploadedImage] = useState<LoadedImage | null>(null);

  // Swatch-hex bar draft: partial keystrokes show verbatim; a complete 6-digit
  // hex dispatches and the field resyncs to the canonical Current Color hex
  // (the store's `setFromHex` pattern, mirroring the desktop HexDriver).
  const [draft, setDraft] = useState<string | null>(null);
  const shownHex = draft ?? hex.slice(1);

  function onHexChange(value: string) {
    const raw = value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    setDraft(raw);
    if (raw.length === 6) {
      currentColorStore.dispatch({ type: "setFromHex", hex: raw });
      setDraft(null);
    }
  }

  const mapSurface = (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/* Ticket 36: the CIE deep-dive returns to mobile as a slim header row
          above the map surface (desktop placement pattern, adapted to the
          shell). Tap-open Popover; content is portaled, so it never
          interferes with the map's or the ticker's drag/flick paths. */}
      <GamutMapInfo />
      <GamutMap chroma={chroma} />
      <LuminanceSlider chroma={chroma} />
    </div>
  );
  const imageSurface = (
    // Inner scroll: an uploaded image can exceed the slot; the page itself
    // still never scrolls.
    <div
      data-testid="mobile-image-slot"
      // Ticket 35: cap the sampling canvas to the slot minus the Eyedropper's
      // own chrome (caption + privacy rows + padding, ~4.5rem) so the FULL
      // image is visible without clipping. The canvas is a replaced element:
      // its max-width (already `max-w-full` in the component) plus this
      // max-height resolve through the CSS constraint table, so aspect is
      // preserved. overflow-y-auto remains the fallback if chrome estimates
      // drift.
      className="h-full min-h-0 overflow-y-auto rounded-lg [&_[data-testid='eyedropper-canvas']]:max-h-[calc(26vh-4.5rem)]"
    >
      <Eyedropper onImageChange={setUploadedImage} />
    </div>
  );

  return (
    <div
      data-testid="mobile-shell"
      className="flex h-dvh flex-col gap-2 bg-background p-2"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
      }}
    >
      <header className="flex items-baseline gap-2">
        <h1 className="text-sm font-semibold tracking-tight">chromadex</h1>
        <span className="text-[10px] text-muted-foreground">
          explore color values, find human-friendly names
        </span>
      </header>

      {/* 1. Media slot (~26vh): Spotlight focus surface. */}
      <div data-testid="mobile-media-slot" className="h-[26vh] min-h-0 shrink-0">
        {focus === "map" ? mapSurface : imageSurface}
      </div>

      {/* Focus thumbnails: tap to promote. The map thumb is the real live
          GamutMap at thumbnail size, but its content is pointer-inert — a
          thumbnail promotes focus, it never drags the Cursor. */}
      <div data-testid="mobile-thumbnails" className="flex h-14 shrink-0 gap-2">
        <button
          type="button"
          data-testid="thumb-map"
          aria-pressed={focus === "map"}
          aria-label="Show the Gamut Map in the media slot"
          onClick={() => setFocus("map")}
          className={
            "relative h-14 w-[72px] overflow-hidden rounded border " +
            (focus === "map" ? "border-primary" : "border-border opacity-70")
          }
        >
          <div data-testid="thumb-map-stage" className="pointer-events-none h-full w-full">
            <GamutMap chroma={chroma} />
          </div>
          <span className="absolute inset-x-0 bottom-0 bg-background/70 text-[8px] text-foreground">
            map (live)
          </span>
        </button>
        <button
          type="button"
          data-testid="thumb-image"
          aria-pressed={focus === "image"}
          aria-label="Show the uploaded image in the media slot"
          onClick={() => setFocus("image")}
          className={
            "relative h-14 w-[72px] overflow-hidden rounded border " +
            (focus === "image" ? "border-primary" : "border-border opacity-70")
          }
        >
          {uploadedImage ? (
            <ImageThumb image={uploadedImage} />
          ) : (
            <div className="h-full w-full rounded border border-dashed border-border" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-background/70 text-[8px] text-foreground">
            image
          </span>
        </button>
        <div className="flex flex-1 items-center rounded border border-dashed border-border px-2 text-[10px] text-muted-foreground">
          thumbnails: tap to promote
        </div>
      </div>

      {/* 2. Combined swatch-hex bar: one colored bar, editable hex inside,
          ink chosen for contrast against the fill. */}
      <div
        data-testid="mobile-swatch-hex"
        className="flex h-12 shrink-0 items-center rounded-lg border border-border px-3"
        style={{ backgroundColor: hex }}
      >
        <input
          data-testid="mobile-hex-input"
          value={shownHex}
          onChange={(event) => onHexChange(event.target.value)}
          onBlur={() => setDraft(null)}
          aria-label="Hex value (swatch input)"
          spellCheck={false}
          className="w-full bg-transparent font-mono text-sm outline-none"
          style={{ color: contrastInk(hex) }}
        />
      </div>

      {/* 3. Drivers region: the only scrollable region on the page. */}
      <div
        data-testid="mobile-drivers"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto"
      >
        <RgbDriver />
        <HslDriver />
      </div>

      {/* 4. Compact upload row. */}
      <div
        data-testid="mobile-upload-row"
        className="flex shrink-0 items-center justify-between rounded-lg border border-border p-2"
      >
        <span className="text-[10px] text-muted-foreground">
          Eyedropper — images never leave your browser
        </span>
        <button
          type="button"
          data-testid="mobile-upload"
          onClick={() => setFocus("image")}
          className="rounded border border-border px-2 py-1 text-[10px]"
        >
          Upload…
        </button>
      </div>

      {/* 5. Ticker slot: the ticket-31 Name Wheel as a horizontal ticker
          (names scroll past a vertical center-line needle). The title row's
          approximation copy is the slot's, kept verbatim — the wheel does not
          print its own header (ticket 32 owns desktop rail header copy). */}
      <div
        data-testid="mobile-ticker-slot"
        className="flex h-[14vh] shrink-0 flex-col border-t border-border"
      >
        {/* Ticket 36: the trivia affordance returns to mobile as a slim header
            row (replaces the bare title span — same copy, same placement
            above the wheel container, so the ticker's pointer paths stay
            untouched). tapToggle: touch has no hover, so the "?" toggles the
            trivia open/closed per tap instead of the desktop hover/focus
            idiom. */}
        <NameWheelInfo slim tapToggle />
        <NameWheel orientation="horizontal" />
      </div>
    </div>
  );
}
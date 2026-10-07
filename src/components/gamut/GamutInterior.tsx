/**
 * The Gamut Map's static color-filled interior as a <canvas> underlay
 * (ticket 13). Sits beneath the interactive SVG overlay: pointer-events
 * inert and aria-hidden, so drag handling and a11y semantics belong to the
 * SVG exactly as in ticket 05. The raster is memoized module-level
 * (`gamutInteriorPixels`); drawing is a one-time effect. jsdom and other
 * environments without a 2D context simply leave a blank underlay.
 */

import { useEffect, useRef } from "react";

import { gamutInteriorPixels } from "./interior-fill";

/** Backing-store resolution; CSS-scaled to the stage. 512 ≈ crisp at pane sizes, one-time compute. */
const RENDER_SIZE = 512;

export function GamutInterior() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = RENDER_SIZE;
    canvas.height = RENDER_SIZE;
    const imageData = ctx.createImageData(RENDER_SIZE, RENDER_SIZE);
    imageData.data.set(gamutInteriorPixels(RENDER_SIZE));
    ctx.putImageData(imageData, 0, 0);
  }, []);

  return (
    <canvas
      ref={ref}
      data-testid="gamut-interior"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "none" }}
    />
  );
}
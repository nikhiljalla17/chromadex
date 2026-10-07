/**
 * The Gamut Map: SVG CIE 1931 chromaticity horseshoe with the shaded sRGB
 * gamut triangle, the D65 white anchor, and the two-way Cursor.
 *
 * The Cursor marks the Current Color (derived via `chromaticityOf`); dragging
 * anywhere on the map surface dispatches the reverse path
 * (`gamutPointToSrgb`) with the luminance Y the Current Color already has —
 * so the Cursor always marks the Current Color and may sit inside the drag
 * point when the drag clamps (research brief §4; do not force it under the
 * pointer). Keyboard: the Cursor handle is focusable and arrow keys nudge the
 * drag point in (x, y).
 *
 * Pointer handling: Pointer Events + setPointerCapture (react-colorful prior
 * art) so drags continue outside the element. Dispatch is per-pointermove
 * (cheap: one binary-searched GMA) — do not debounce the state dispatch or
 * the Cursor lags the pointer. URL writes are coalesced separately in
 * `src/state/url-sync.ts`.
 *
 * Cursor ARIA role (decision, a11y pass): deliberately roleless. The Cursor
 * is a focusable 2D draggable point; ARIA has no sound role for that —
 * role="slider" is single-valued (the luminance dimension already has its
 * own native range input, LuminanceSlider), and a bogus role is worse than
 * none. Operability is conveyed by focusability (tabIndex), the arrow-key
 * nudge contract (±1 unit, Shift ×5), and a visible focus outline. Revisit
 * only if a real ARIA pattern for 2D points lands.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  gamutPointToSrgb,
  type Chromaticity,
} from "../../lib/color";
import { currentColorStore } from "../../state/store";
import {
  D65_WHITE,
  locusPathD,
  srgbTrianglePoints,
  svgToXy,
  VIEW_SIZE,
  xyToSvg,
} from "./locus-data";
import { GamutInterior } from "./GamutInterior";

/** One viewBox unit of (x, y) per arrow-key press; Shift ×5. */
const NUDGE_UNITS = 1;
const NUDGE_SHIFT_FACTOR = 5;

/** Presentation attributes render as strings — keep the noise out of the DOM. */
function round3(v: number): number {
  return Number(v.toFixed(3));
}

const KEY_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export function GamutMap({ chroma }: { chroma: Chromaticity }) {
  const draggingRef = useRef(false);

  // The SVG's viewBox is square, so with `meet` its content fills exactly the
  // largest square inside the pane. The canvas underlay must cover that same
  // square (not the whole pane) or its CSS scaling would drift from the SVG
  // mapping on non-square panes — so the stage is measured and sized in px.
  // Fallback (jsdom/unmeasured): the stage fills the pane, as before.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSide, setStageSide] = useState<number | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const side = Math.floor(Math.min(rect.width, rect.height));
      if (side > 0) setStageSide(side);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function applyPoint(x: number, y: number) {
    currentColorStore.dispatch({
      type: "setFromSrgb",
      color: gamutPointToSrgb(x, y, chroma.Y),
    });
  }

  function eventToChromaticity(event: PointerEvent<SVGSVGElement>) {
    // jsdom reports zero-sized rects; never divide by zero.
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * VIEW_SIZE;
    const py = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * VIEW_SIZE;
    return svgToXy(px, py);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    draggingRef.current = true;
    // Capture so the drag continues when the pointer leaves the diagram.
    // Environments without an active pointer (jsdom, older browsers) throw;
    // the drag still works inside the element there.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no active pointer in this environment */
    }
    const { x, y } = eventToChromaticity(event);
    applyPoint(x, y);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    const { x, y } = eventToChromaticity(event);
    applyPoint(x, y);
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const { x, y } = eventToChromaticity(event);
    applyPoint(x, y);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  function onCursorKeyDown(event: KeyboardEvent<SVGCircleElement>) {
    const delta = KEY_DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = NUDGE_UNITS * (event.shiftKey ? NUDGE_SHIFT_FACTOR : 1);
    applyPoint(chroma.x + delta[0] * step, chroma.y + delta[1] * step);
  }

  const [cursorPx, cursorPy] = xyToSvg(chroma.x, chroma.y).map(round3);
  const [whitePx, whitePy] = xyToSvg(D65_WHITE.x, D65_WHITE.y).map(round3);

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-card/40"
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={
          stageSide
            ? { width: stageSide, height: stageSide }
            : { width: "100%", height: "100%" }
        }
      >
        {/* Static color-filled spectral interior (canvas underlay, pointer-inert). */}
        <GamutInterior />
        <svg
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
          aria-label="Gamut Map: CIE 1931 chromaticity diagram"
          data-testid="gamut-map"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* sRGB gamut boundary outline — the "explorable wall"; kept clearly visible over the color fill. */}
          <polygon
            points={srgbTrianglePoints()}
            data-testid="srgb-triangle"
            style={{
              fill: "none",
              stroke: "var(--primary)",
              strokeOpacity: 0.9,
              strokeWidth: 1.5,
              vectorEffect: "non-scaling-stroke",
            }}
          />
          {/* Spectral locus outline; Z closes the purple line back to 380 nm. */}
          <path
            d={locusPathD()}
            style={{
              fill: "none",
              stroke: "var(--border)",
              strokeWidth: 1,
              vectorEffect: "non-scaling-stroke",
            }}
          />
          {/* D65 white anchor. */}
          <circle
            cx={whitePx}
            cy={whitePy}
            r={0.6}
            style={{ fill: "var(--muted-foreground)" }}
          />
          {/* The Cursor: marks the Current Color; must not eat pointer events.
              Dual-tone for clarity on any fill color: white outer halo + black
              ring + black center dot — visible over both near-white and
              saturated/dark fill colors. */}
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={cursorPx}
              cy={cursorPy}
              r={2.2}
              style={{
                fill: "none",
                stroke: "white",
                strokeOpacity: 0.9,
                strokeWidth: 3,
                vectorEffect: "non-scaling-stroke",
              }}
              data-testid="gamut-cursor-rim"
            />
            <circle
              cx={cursorPx}
              cy={cursorPy}
              r={2.2}
              style={{
                fill: "none",
                stroke: "black",
                strokeWidth: 1.4,
                vectorEffect: "non-scaling-stroke",
              }}
              // SVG ignores CSS outline: visible focus = stroke color change.
              className="focus-visible:stroke-ring"
              tabIndex={0}
              aria-label="Current Color position on the Gamut Map; arrow keys nudge"
              data-testid="gamut-cursor"
              onKeyDown={onCursorKeyDown}
            />
            <circle
              cx={cursorPx}
              cy={cursorPy}
              r={0.7}
              style={{ fill: "black" }}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

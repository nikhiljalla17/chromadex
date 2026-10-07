/**
 * CIE 1931 chromaticity geometry for the Gamut Map: the spectral-locus table,
 * the sRGB gamut anchors, and the SVG mapping (a pure xy ↔ viewBox function
 * pair, not a scale transform — the inverse is needed for pointer → xy drag,
 * and one constant set powers both directions so Cursor-derive and
 * drag-invert can never drift).
 *
 * Spectral locus: CIE 1931 2° observer, CIE 018:2019 Table 6
 * (DOI 10.25039/CIE.DS.mifmy4x4), cross-checked against two independent
 * mirrors — see `.scratch/chromadex/research/05-gamut-map.md` §1.
 * Convention: the visible horseshoe is drawn 380–700 nm (≥700 nm collapses to
 * the 700 nm point; <380 nm is extrapolated low-signal data) plus the purple
 * line closing 700 → 380 nm. The researcher-transcribed table has one
 * duplicate 400 nm row; discarded here.
 */

import { D65_CHROMATICITY } from "../../lib/color/chromaticity";

export interface LocusPoint {
  nm: number;
  x: number;
  y: number;
  /** Checksum column: x + y + z = 1 (validates the transcription). */
  z: number;
}

export const SPECTRAL_LOCUS: readonly LocusPoint[] = [
  { nm: 380, x: 0.174112, y: 0.004964, z: 0.820924 },
  { nm: 390, x: 0.173801, y: 0.004915, z: 0.821284 },
  { nm: 400, x: 0.173337, y: 0.004797, z: 0.821866 },
  { nm: 410, x: 0.172577, y: 0.004799, z: 0.822624 },
  { nm: 420, x: 0.171407, y: 0.005102, z: 0.82349 },
  { nm: 430, x: 0.168878, y: 0.0069, z: 0.824222 },
  { nm: 440, x: 0.164412, y: 0.010858, z: 0.824731 },
  { nm: 450, x: 0.156641, y: 0.017705, z: 0.825654 },
  { nm: 460, x: 0.14396, y: 0.029703, z: 0.826337 },
  { nm: 470, x: 0.124118, y: 0.057803, z: 0.818079 },
  { nm: 480, x: 0.091294, y: 0.132702, z: 0.776004 },
  { nm: 490, x: 0.045391, y: 0.294976, z: 0.659633 },
  { nm: 500, x: 0.008168, y: 0.538423, z: 0.453409 },
  { nm: 510, x: 0.01387, y: 0.750186, z: 0.235943 },
  { nm: 520, x: 0.074302, y: 0.833803, z: 0.091894 },
  { nm: 530, x: 0.154722, y: 0.805864, z: 0.039414 },
  { nm: 540, x: 0.22962, y: 0.754329, z: 0.016051 },
  { nm: 550, x: 0.301604, y: 0.692308, z: 0.006088 },
  { nm: 560, x: 0.373102, y: 0.624451, z: 0.002448 },
  { nm: 570, x: 0.444062, y: 0.554714, z: 0.001224 },
  { nm: 580, x: 0.512486, y: 0.486591, z: 0.000923 },
  { nm: 590, x: 0.575151, y: 0.424232, z: 0.000616 },
  { nm: 600, x: 0.627037, y: 0.372491, z: 0.000472 },
  { nm: 610, x: 0.665764, y: 0.334011, z: 0.000226 },
  { nm: 620, x: 0.691504, y: 0.308342, z: 0.000154 },
  { nm: 630, x: 0.707918, y: 0.292027, z: 0.000055 },
  { nm: 640, x: 0.719033, y: 0.280935, z: 0.000032 },
  { nm: 650, x: 0.725992, y: 0.274008, z: 0 },
  { nm: 660, x: 0.729969, y: 0.270031, z: 0 },
  { nm: 670, x: 0.731993, y: 0.268007, z: 0 },
  { nm: 680, x: 0.733417, y: 0.266583, z: 0 },
  { nm: 690, x: 0.73439, y: 0.26561, z: 0 },
  { nm: 700, x: 0.73469, y: 0.26531, z: 0 },
];

/** sRGB primaries in xy (IEC 61966-2-1 / W3C sRGB spec) — the shaded triangle. */
export const SRGB_TRIANGLE: readonly { x: number; y: number }[] = [
  { x: 0.64, y: 0.33 },
  { x: 0.3, y: 0.6 },
  { x: 0.15, y: 0.06 },
];

/** D65 reference white in xy (IEC 61966-2-1) — the achromatic anchor. */
export const D65_WHITE = D65_CHROMATICITY;

/**
 * The Gamut Map crop (research brief §3): the horseshoe spans
 * x ∈ [0.004, 0.735], y ∈ [0.005, 0.834]; this crop covers it plus stroke
 * width with a hair of padding.
 */
export const CROP = { xMin: -0.02, xMax: 0.8, yMin: -0.02, yMax: 0.88 } as const;

/** viewBox size both mapping directions are built against. */
export const VIEW_SIZE = 100;

/** CIE (x, y) → SVG viewBox coordinates. Screen-space y is flipped: chromaticity y grows upward, SVG y grows downward. */
export function xyToSvg(x: number, y: number): [px: number, py: number] {
  return [
    ((x - CROP.xMin) / (CROP.xMax - CROP.xMin)) * VIEW_SIZE,
    ((CROP.yMax - y) / (CROP.yMax - CROP.yMin)) * VIEW_SIZE,
  ];
}

/** SVG viewBox coordinates → CIE (x, y) — the exact inverse of {@link xyToSvg}. */
export function svgToXy(px: number, py: number): { x: number; y: number } {
  return {
    x: CROP.xMin + (px / VIEW_SIZE) * (CROP.xMax - CROP.xMin),
    y: CROP.yMax - (py / VIEW_SIZE) * (CROP.yMax - CROP.yMin),
  };
}

/**
 * The horseshoe outline as one SVG path: M at 380 nm, line segments through
 * the locus in ascending λ, Z closes back to 380 nm (the purple line).
 */
export function locusPathD(): string {
  const points = SPECTRAL_LOCUS.map(
    ({ x, y }) => xyToSvg(x, y).map((v) => v.toFixed(3)).join(" "),
  );
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}

/** The shaded sRGB gamut triangle as an SVG polygon points string. */
export function srgbTrianglePoints(): string {
  return SRGB_TRIANGLE.map(({ x, y }) =>
    xyToSvg(x, y).map((v) => v.toFixed(3)).join(" "),
  ).join(" ");
}

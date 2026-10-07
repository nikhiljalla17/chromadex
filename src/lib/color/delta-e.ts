/**
 * CIEDE2000 color difference (Sharma, Wu & Dalal 2005 formulation).
 *
 * Needed in ticket 02 for the gamut-mapping local-MINDE shortcut (one JND ≈
 * 2 ΔE00 units in CIE Lab per CSS Color 4 §14.2). The official CIE/Sharma
 * supplementary test pairs are validated in `delta-e.test.ts` — ticket 07's
 * nearestNames engine builds directly on this implementation.
 */

import type { Lab } from "./types";

const DEG = Math.PI / 180;

/** CIEDE2000 ΔE between two Lab colors. Total for all finite inputs. */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const L1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const L2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  // Hue angles in degrees [0, 360); exactly 0 when the chroma is 0.
  const h1p = hueAngleDegrees(b1, a1p);
  const h2p = hueAngleDegrees(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) > 180) {
    // Sharma eq. 14: two-sided wrap — add 360 only when the sum is < 360
    hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  } else {
    hbarp = (h1p + h2p) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));

  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * DEG) * Rc;

  const term = Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh);

  // The expression is positive-definite in exact arithmetic; guard float drift.
  return Math.sqrt(Math.max(0, term));
}

/** Hue angle from (b, a′) in degrees [0, 360); 0 at the achromatic origin. */
function hueAngleDegrees(b: number, ap: number): number {
  if (ap === 0 && b === 0) return 0;
  const h = Math.atan2(b, ap) / DEG;
  return h < 0 ? h + 360 : h;
}
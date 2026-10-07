/**
 * List-agnostic color-name list loader + the bundled default dataset.
 *
 * A "color-name list" is just `{ name, hex }[]` — any list in that shape can be
 * fed to the nearest-names engine (see `../color/names.ts`). The bundled
 * default is the meodai/colornames-oklab dataset (4,444 names blue-noise
 * sampled to be perceptually evenly distributed over OKLab, MIT © 2026 meodai
 * — see ./ATTRIBUTION.md), vendored at build time as a committed JSON file:
 * zero runtime network dependency. The 32k meodai/color-names aggregated
 * dataset remains available as swappable config (`colornames.json`,
 * `loadColornamesList`) — dynamically imported so it stays OUT of the default
 * bundle (a future list-selector UI can load it on demand). The loader is
 * list-agnostic; nothing hardcodes a dataset.
 *
 * Module-level lazy init: the Lab precompute runs once, on first use, and the
 * result is cached for the process lifetime. All 4,444 Lab conversions cost
 * ~1ms (see names.test.ts perf smoke) — documented cost, paid once, off the
 * interaction path thereafter.
 */

import rawColornamesOklab from "./colornames-oklab.json";
import { hexToSrgb, srgbToXyz, xyzToLab } from "../color";
import type { Lab, Srgb } from "../color/types";

/** One entry of a color-name list: a human-friendly Name and its exact color. */
export interface NameEntry {
  name: string;
  /** 6-digit hex with leading `#` (canonical chromadex hex form). */
  hex: string;
}

/** Internal precomputed form of a list: entries plus cached Lab coordinates. */
export interface PrecomputedNameList {
  entries: NameEntry[];
  /** Lab coordinates of each entry, index-aligned with `entries`. */
  labs: Lab[];
  /** sRGB [0,1] form of each entry, index-aligned with `entries`. */
  srgbs: Srgb[];
}

/** Precompute Lab + sRGB for every entry of a color-name list. Pure. */
export function precomputeList(entries: NameEntry[]): PrecomputedNameList {
  const srgbs: Srgb[] = new Array(entries.length);
  const labs: Lab[] = new Array(entries.length);
  for (let i = 0; i < entries.length; i++) {
    // Unparseable hex → black substitute (behavior for arbitrary custom lists;
    // unreachable for the shape-validated bundled dataset — see ATTRIBUTION.md).
    const srgb = hexToSrgb(entries[i].hex) ?? { r: 0, g: 0, b: 0 };
    srgbs[i] = srgb;
    labs[i] = xyzToLab(srgbToXyz(srgb));
  }
  return { entries, labs, srgbs };
}

/** The bundled default list (meodai/colornames-oklab), precomputed once, lazily. */
let defaultList: PrecomputedNameList | undefined;

/**
 * Load the bundled default dataset (colornames-oklab) with its Lab precompute
 * (memoized). The vendored `{name, tier, hex, oklab}` rows are narrowed to the
 * engine's `{name, hex}` shape: `tier` (srgb/p3/rec2020 gamut tag) is retained
 * in the vendored JSON but dropped at load — no tier filtering/display exists
 * yet (ticket 21 explicitly defers it), and the loader must stay list-agnostic.
 */
export function loadDefaultList(): PrecomputedNameList {
  if (!defaultList) {
    const entries: NameEntry[] = rawColornamesOklab.map((e) => ({
      name: e.name,
      // Vendored hexes are mixed case (497 uppercase); chromadex's canonical
      // form is lowercase `#rrggbb` (see srgbToHex) — normalize at load.
      hex: e.hex.toLowerCase(),
    }));
    defaultList = precomputeList(entries);
  }
  return defaultList;
}

/** Entry count of the bundled default list (useful for tests/debug). */
export function defaultListSize(): number {
  return loadDefaultList().entries.length;
}

/**
 * The 32k meodai/color-names aggregated dataset as swappable config, memoized
 * once loaded. Dynamic import keeps it OUT of the default bundle (code-split
 * async chunk) — a future list-selector UI can load it on demand; the loader
 * is list-agnostic, so this is config, not a hardcoded dependency.
 */
let colornamesList: PrecomputedNameList | undefined;

/** Load the 32k aggregated dataset as swappable config (memoized, async). */
export async function loadColornamesList(): Promise<PrecomputedNameList> {
  if (!colornamesList) {
    const raw = (await import("./colornames.json"))
      .default as unknown as Record<string, string>;
    const entries: NameEntry[] = Object.entries(raw).map(([key, name]) => ({
      name,
      hex: `#${key}`,
    }));
    colornamesList = precomputeList(entries);
  }
  return colornamesList;
}

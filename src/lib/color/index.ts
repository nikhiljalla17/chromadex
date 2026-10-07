/**
 * chromadex color module — dependency-free pure color-space conversions.
 * See `.scratch/chromadex/research/02-color-module.md` for constants, sources,
 * and the resolved plain-D65 pipeline decision.
 */

export * from "./types";
export { srgbDecode, srgbEncode, clampUnit } from "./srgb";
export { hexToSrgb, srgbToHex } from "./hex";
export { srgbToHsl, hslToSrgb } from "./hsl";
export {
  srgbToXyz,
  xyzToSrgb,
  xyzToLinearSrgb,
  isInGamutLinear,
  xyzToLab,
  labToXyz,
  xyYToXyz,
} from "./xyz";
export { ciede2000 } from "./delta-e";
export { srgbToOklab, oklabToSrgb, oklabToOklch, oklchToOklab } from "./oklab";
export { wcagRelativeLuminance } from "./srgb";
export { clampToSrgb, gamutMapLab } from "./gamut";
export { spectralFillLinear } from "./spectral";
export {
  chromaticityOf,
  D65_CHROMATICITY,
  gamutPointToSrgb,
  type Chromaticity,
} from "./chromaticity";
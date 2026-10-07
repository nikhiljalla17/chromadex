/**
 * The luminance slider: CIE Y (0–1), displayed 0–100. Changing it dispatches
 * the same reverse path as a Cursor drag — (x, y) held, Y set — so the two
 * controls compose (research brief §4: `gamutMapLab` preserves Y exactly, so
 * the slider's Y is the mapped color's Y).
 */

import { gamutPointToSrgb, type Chromaticity } from "../../lib/color";
import { currentColorStore } from "../../state/store";
import { ChannelSlider } from "../drivers/channel-slider";

export function LuminanceSlider({ chroma }: { chroma: Chromaticity }) {
  function onChange(nextY100: number) {
    currentColorStore.dispatch({
      type: "setFromSrgb",
      color: gamutPointToSrgb(chroma.x, chroma.y, nextY100 / 100),
    });
  }

  return (
    <ChannelSlider
      id="luminance-y"
      label="Y"
      ariaLabel="Luminance (CIE Y)"
      tooltip="Y = CIE luminance — the color's physical brightness. Moving it keeps the same color-ness (chromaticity) and scales brightness; RGB and HSL follow automatically."
      min={0}
      max={100}
      value={Math.round(chroma.Y * 100)}
      format={(value) => `${value}`}
      onChange={onChange}
      testId="luminance-y"
    />
  );
}

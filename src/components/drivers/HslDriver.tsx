/**
 * The HSL Driver: hue (0–360°), saturation (0–100%), lightness (0–100%)
 * sliders with numeric readouts, two-way through the store — values render
 * the Current Color's derived HSL and every drag dispatches `setFromSrgb`
 * with `hslToSrgb` of the full slider snapshot. Untouched channels keep
 * their current quantized slider values. Keyboard nudge semantics live in
 * ChannelSlider (±1, Shift ±10). Nudging clamps at the lower bound and
 * wraps upward past the top: nudging 359° → 360° dispatches h=360, which
 * hslToSrgb wraps to the 0° color, so the thumb returns to the far left —
 * same color, so the jump is semantically invisible.
 */

import { hslToSrgb } from "../../lib/color";
import { currentColorStore, useCurrentColor } from "../../state/store";
import { hslOf } from "../../state/current-color-store";
import { ChannelSlider } from "./channel-slider";

export function HslDriver() {
  const state = useCurrentColor();
  const hsl = hslOf(state);
  const h = Math.round(hsl.h);
  const s = Math.round(hsl.s * 100);
  const l = Math.round(hsl.l * 100);

  function setHsl(nextH: number, nextS: number, nextL: number) {
    currentColorStore.dispatch({
      type: "setFromSrgb",
      color: hslToSrgb({ h: nextH, s: nextS / 100, l: nextL / 100 }),
    });
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
      data-testid="hsl-driver"
    >
      <h2 className="text-xs font-medium text-muted-foreground">HSL</h2>
      <ChannelSlider
        id="hsl-h"
        label="H"
        ariaLabel="Hue"
        tooltip="Hue — which color on the hue circle (red → green → blue), measured in degrees."
        min={0}
        max={360}
        value={h}
        format={(v) => `${v}°`}
        onChange={(next) => setHsl(next, s, l)}
        testId="hsl-h"
      />
      <ChannelSlider
        id="hsl-s"
        label="S"
        ariaLabel="Saturation"
        tooltip="Saturation — how pure the color is vs how gray."
        min={0}
        max={100}
        value={s}
        format={(v) => `${v}%`}
        onChange={(next) => setHsl(h, next, l)}
        testId="hsl-s"
      />
      <ChannelSlider
        id="hsl-l"
        label="L"
        ariaLabel="Lightness"
        tooltip="Lightness — how much white or black is mixed in."
        min={0}
        max={100}
        value={l}
        format={(v) => `${v}%`}
        onChange={(next) => setHsl(h, s, next)}
        testId="hsl-l"
      />
    </div>
  );
}

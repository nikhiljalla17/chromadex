/**
 * The RGB Driver: three channel sliders (0–255) with numeric readouts,
 * two-way through the store — sliders render the Current Color's channels
 * and every drag dispatches `setFromSrgb`; a store change from any other
 * Driver repositions the sliders. Keyboard nudge semantics live in
 * ChannelSlider (±1, Shift ±10).
 */

import { currentColorStore, useCurrentColor } from "../../state/store";
import { ChannelSlider } from "./channel-slider";

type Channel = "r" | "g" | "b";

const CHANNELS: Array<{
  key: Channel;
  label: string;
  ariaLabel: string;
  tooltip: string;
}> = [
  {
    key: "r",
    label: "R",
    ariaLabel: "Red channel",
    tooltip: "Red channel — how much red light the color contains, 0–255.",
  },
  {
    key: "g",
    label: "G",
    ariaLabel: "Green channel",
    tooltip: "Green channel — how much green light the color contains, 0–255.",
  },
  {
    key: "b",
    label: "B",
    ariaLabel: "Blue channel",
    tooltip: "Blue channel — how much blue light the color contains, 0–255.",
  },
];

export function RgbDriver() {
  const state = useCurrentColor();

  function setChannel(channel: Channel, value255: number) {
    currentColorStore.dispatch({
      type: "setFromSrgb",
      color: { ...state.color, [channel]: value255 / 255 },
    });
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
      data-testid="rgb-driver"
    >
      <h2 className="text-xs font-medium text-muted-foreground">RGB</h2>
      {CHANNELS.map(({ key, label, ariaLabel, tooltip }) => {
        const value255 = Math.round(state.color[key] * 255);
        return (
          <ChannelSlider
            key={key}
            id={`rgb-${key}`}
            label={label}
            ariaLabel={ariaLabel}
            tooltip={tooltip}
            min={0}
            max={255}
            value={value255}
            format={(v) => String(v)}
            onChange={(next) => setChannel(key, next)}
            testId={`rgb-${key}`}
          />
        );
      })}
    </div>
  );
}

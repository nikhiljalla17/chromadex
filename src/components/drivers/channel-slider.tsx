/**
 * A single channel-slider row shared by the RGB and HSL Drivers (and the
 * Gamut Map's luminance slider).
 *
 * Keyboard nudge semantics (explicit, not browser-native, so behavior is
 * identical across browsers and testable in jsdom): ArrowLeft/ArrowRight
 * nudge the focused channel by ∓1, with Shift held that becomes ∓10, and
 * the result clamps to [min, max]. Native range extras (Home/End/PageUp)
 * remain browser-native.
 *
 * Optional `tooltip` (ticket 14): plain-language definition rendered on the
 * channel label. Opens on hover AND when the input takes focus, closes on
 * blur or Escape. Controlled-open so the behavior is deterministic in
 * jsdom (radix's hover timers are not).
 */

import * as React from "react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface ChannelSliderProps {
  id: string;
  /** Short visible label (the input's accessible name comes from ariaLabel). */
  label: ReactNode;
  /** Accessible name for the slider, e.g. "Red channel". */
  ariaLabel: string;
  /** Optional plain-language definition shown on label hover/input focus. */
  tooltip?: string;
  min: number;
  max: number;
  /** Current value to render and nudge from; the parent owns all color state. */
  value: number;
  /** Formats the readout, e.g. raw channel int or a percentage. */
  format: (value: number) => string;
  /** Called with the next in-range integer on any input or keyboard nudge. */
  onChange: (next: number) => void;
  testId: string;
}

export function ChannelSlider({
  id,
  label,
  ariaLabel,
  tooltip,
  min,
  max,
  value,
  format,
  onChange,
  testId,
}: ChannelSliderProps) {
  const [hintOpen, setHintOpen] = React.useState(false);

  const labelText = (
    <label
      htmlFor={id}
      // cursor-help only when a tooltip exists — a help cursor with no
      // tooltip behind it reads as a broken tooltip (the "phantom ?"
      // reported on the R/G/B knobs; ticket 17).
      className={
        tooltip
          ? "w-16 shrink-0 cursor-help text-xs font-medium text-muted-foreground"
          : "w-16 shrink-0 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </label>
  );

  return (
    <div className="flex items-center gap-2">
      {tooltip ? (
        <Tooltip open={hintOpen} onOpenChange={setHintOpen}>
          <TooltipTrigger asChild>{labelText}</TooltipTrigger>
          <TooltipContent align="start" data-testid={`${testId}-tooltip`}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelText
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onFocus={() => tooltip && setHintOpen(true)}
        onBlur={() => setHintOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && hintOpen) {
            setHintOpen(false);
            return;
          }
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          let delta = event.key === "ArrowRight" ? 1 : -1;
          if (event.shiftKey) delta *= 10;
          onChange(Math.min(max, Math.max(min, value + delta)));
        }}
        className="flex-1 accent-primary"
        aria-label={ariaLabel}
        data-testid={testId}
      />
      <output
        htmlFor={id}
        className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
        data-testid={`${testId}-value`}
      >
        {format(value)}
      </output>
    </div>
  );
}

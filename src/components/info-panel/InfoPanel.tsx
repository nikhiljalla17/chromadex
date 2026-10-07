/**
 * The info panel: read-only technical readouts of the Current Color (spec:
 * "purely derived from the store; no editing"). Shows CIE Lab (plain D65
 * pipeline), luminance (CIE Y), WCAG 2.x relative luminance, and OKLCH.
 * Every value recomputes from the store on any change; the panel renders no
 * inputs — it cannot change the Current Color.
 *
 * Explanatory tooltips on the readout labels: ticket 14 (controlled-open
 * wiring; hover or focus the label). A11y (ticket 12): the trigger is a real
 * <button> inside the <dt> — a bare focusable dt has no role-bearing
 * semantics; button-in-dt is valid HTML and gives keyboard users a standard
 * focus target. The card label is a proper <h2> under the app's <h1>.
 *
 * Number formatting (informational readouts, not editing surfaces):
 * - Lab: 2 dp (L 0–100, a/b roughly ±110; 2 dp is plenty perceptually).
 * - Y / WCAG luminance: 3 dp on the 0–1 scale.
 * - OKLCH: l and c 3 dp (0–1 scale, matching the store's HSL selectors),
 *   h 1 dp with the degree sign.
 */

import * as React from "react";

import { srgbToXyz, wcagRelativeLuminance, type Lab, type Oklch } from "../../lib/color";
import { labOf, oklchOf } from "../../state/current-color-store";
import { useCurrentColor } from "../../state/store";
import type { CurrentColorState } from "../../state/current-color-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

function fmt(value: number, digits: number): string {
  return value.toFixed(digits);
}

function InfoRow({
  label,
  value,
  testId,
  tooltip,
}: {
  label: string;
  value: string;
  testId: string;
  /** Optional plain-language definition for the readout (ticket 14). */
  tooltip?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const labelText = <dt className="text-xs text-muted-foreground">{label}</dt>;

  return (
    <div className="flex items-baseline justify-between gap-3" data-testid={testId}>
      {tooltip ? (
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <dt>
              {/* Button-in-dt (a11y pass, ticket 12): natively focusable,
                  role-bearing trigger; the tooltip opens on focus too. */}
              <button
                type="button"
                className="cursor-help text-left text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring/60"
              >
                {label}
              </button>
            </dt>
          </TooltipTrigger>
          <TooltipContent align="start" data-testid={`${testId}-tooltip`}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelText
      )}
      <dd className="font-mono text-xs tabular-nums">{value}</dd>
    </div>
  );
}

export function InfoPanel() {
  const state: CurrentColorState = useCurrentColor();

  const lab: Lab = labOf(state);
  const y = srgbToXyz(state.color).y;
  const wcagY = wcagRelativeLuminance(state.color);
  const oklch: Oklch = oklchOf(state);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
      data-testid="info-panel"
    >
      <h2 className="text-xs font-medium text-muted-foreground">Info</h2>
      <dl className="flex flex-col gap-1.5">
        <InfoRow
          label="Lab"
          value={`${fmt(lab.l, 2)}  ${fmt(lab.a, 2)}  ${fmt(lab.b, 2)}`}
          testId="info-lab"
          tooltip="CIELAB — a color model built around human vision: L* lightness, a* green↔red, b* blue↔yellow."
        />
        <InfoRow
          label="Y (luminance)"
          value={fmt(y, 3)}
          testId="info-luminance"
          tooltip="CIE Y luminance — how much light the color carries, on a 0–1 scale."
        />
        <InfoRow
          label="WCAG luminance"
          value={fmt(wcagY, 3)}
          testId="info-wcag-luminance"
          tooltip="Brightness as the Web Content Accessibility Guidelines computes it (used for contrast calculations)."
        />
        <InfoRow
          label="OKLCH"
          value={`${fmt(oklch.l, 3)}  ${fmt(oklch.c, 3)}  ${fmt(oklch.h, 1)}°`}
          testId="info-oklch"
          tooltip="A modern perceptual color model: lightness, chroma, hue — equal numeric steps look like equal visual changes."
        />
      </dl>
    </div>
  );
}

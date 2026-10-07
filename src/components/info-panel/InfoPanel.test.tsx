/**
 * InfoPanel tooltip wiring tests (ticket 14): each readout label opens its
 * definition on focus and closes on blur. Controlled-open seam — see
 * ui/tooltip.tsx for why radix hover timers are not exercised in jsdom.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InfoPanel } from "./InfoPanel";

afterEach(cleanup);

describe("InfoPanel tooltip wiring", () => {
  it("every readout label opens its definition on focus and closes on blur", () => {
    render(<InfoPanel />);

    for (const [testId, fragment] of [
      ["info-lab", "CIELAB — a color model built around human vision"],
      ["info-luminance", "CIE Y luminance — how much light the color carries"],
      ["info-wcag-luminance", "Web Content Accessibility Guidelines"],
      ["info-oklch", "modern perceptual color model"],
    ] as const) {
      // The label is the focusable trigger (button inside the dt — a11y
      // pass, ticket 12: role-bearing semantics for keyboard users).
      const row = screen.getByTestId(testId);
      const label = row.querySelector("dt button")!;
      expect(label.tagName).toBe("BUTTON");
      fireEvent.focus(label);
      const content = screen.getByTestId(`${testId}-tooltip`);
      expect(content.textContent).toContain(fragment);

      fireEvent.blur(label);
      expect(screen.queryByTestId(`${testId}-tooltip`)).not.toBeInTheDocument();
    }
  });

  it("readout values and labels render unchanged with tooltips wired", () => {
    render(<InfoPanel />);

    expect(screen.getByTestId("info-lab").textContent).toContain("Lab");
    // No behavior change: values still derive from the store (covered in
    // App.test.tsx); here just confirm the rows still render their labels.
    expect(screen.getByTestId("info-oklch").textContent).toContain("OKLCH");
  });
});

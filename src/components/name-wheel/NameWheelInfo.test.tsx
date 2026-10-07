/**
 * Ticket 24a: the Name Wheel's trivia info affordance. Same testing posture
 * as the GamutMapInfo tests: jsdom drives the deterministic focus/Escape
 * seams; hover-open is radix's own path (controlled onOpenChange) and its
 * timers are not exercised here. Also asserts the wheel's interactive
 * surface is untouched (the affordance lives in a header row ABOVE the rail
 * container, never inside its pointer path).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";
import { currentColorStore } from "../../state/store";

function resetToStartingColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetToStartingColor();
});

describe("Name Wheel trivia affordance (ticket 24a)", () => {
  it("renders a slim header row above the rail, with the trivia copy behind its '?' button", async () => {
    render(<App />);

    const info = screen.getByRole("button", {
      name: "Where do these names come from?",
    });
    expect(screen.getByTestId("name-wheel-header")).toBeInTheDocument();
    // Closed by default; content mounts on open (controlled-open idiom).
    expect(screen.queryByTestId("name-wheel-info-tooltip")).not.toBeInTheDocument();

    // Keyboard focus opens it (hover + focus trigger idiom).
    await act(async () => {
      info.focus();
    });
    expect(info).toHaveFocus();
    const tooltip = screen.getByTestId("name-wheel-info-tooltip");
    // Copy revision (ticket 24 follow-up): informational-first, still carrying
    // the substance — algorithmic evenness, provenance, AI assistance.
    expect(tooltip).toHaveTextContent(/4,444/i);
    expect(tooltip).toHaveTextContent(/blue-noise/i);
    expect(tooltip).toHaveTextContent(/OKLab/i);
    expect(tooltip).toHaveTextContent(/April 2017/i);
    expect(tooltip).toHaveTextContent(/31,914/i);
    expect(tooltip).toHaveTextContent(/Claude/i);

    // Escape dismisses.
    fireEvent.keyDown(info, { key: "Escape" });
    expect(screen.queryByTestId("name-wheel-info-tooltip")).not.toBeInTheDocument();
  });

  it("the affordance is a real button outside the wheel's interactive container (no pointer interference)", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    const info = screen.getByRole("button", {
      name: "Where do these names come from?",
    });
    // The affordance lives in the header row, not inside the scroll/drag/flick surface.
    expect(wheel.contains(info)).toBe(false);
  });
});

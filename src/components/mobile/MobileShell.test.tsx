/**
 * Mobile info affordances (ticket 36): the GamutMapInfo deep-dive popover and
 * the NameWheelInfo trivia header return to the mobile shell as slim header
 * rows. The breakpoint lives in App (matchMedia swap), not here, so these
 * tests render MobileShell directly and drive the deterministic click/Escape
 * seams — the same posture as the GamutMapInfo/NameWheelInfo suites. The
 * pointer-path assertion mirrors those suites: the affordances live in header
 * rows ABOVE their surfaces, never inside the wheel's interactive container.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MobileShell } from "./MobileShell";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";
import { currentColorStore } from "../../state/store";

function resetColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

beforeEach(resetColor);

describe("mobile info affordances (ticket 36)", () => {
  it("mounts both info header rows in the shell (desktop placements untouched)", () => {
    render(<MobileShell />);

    expect(screen.getByTestId("gamut-map-header")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What is the Gamut Map?" }),
    ).toBeInTheDocument();

    expect(screen.getByTestId("name-wheel-header")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Where do these names come from?" }),
    ).toBeInTheDocument();
  });

  it("opens the Gamut Map deep-dive popover on tap, with clickable links; Escape dismisses", () => {
    render(<MobileShell />);

    expect(screen.queryByTestId("gamut-map-info-popover")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What is the Gamut Map?" }));

    const popover = screen.getByTestId("gamut-map-info-popover");
    expect(within(popover).getAllByRole("link").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("gamut-map-info-popover")).not.toBeInTheDocument();
  });

  it("tap-toggles the Name Wheel trivia open and closed", () => {
    render(<MobileShell />);

    const question = screen.getByRole("button", {
      name: "Where do these names come from?",
    });
    expect(screen.queryByTestId("name-wheel-info-tooltip")).not.toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.getByTestId("name-wheel-info-tooltip")).toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.queryByTestId("name-wheel-info-tooltip")).not.toBeInTheDocument();
  });

  it("the affordances live outside the wheel's interactive container (no drag/flick interference)", () => {
    render(<MobileShell />);

    const tickerSlot = screen.getByTestId("mobile-ticker-slot");
    expect(tickerSlot.contains(screen.getByTestId("name-wheel-header"))).toBe(true);

    const wheel = screen.getByTestId("name-wheel");
    expect(
      wheel.contains(
        screen.getByRole("button", { name: "Where do these names come from?" }),
      ),
    ).toBe(false);
    expect(
      wheel.contains(screen.getByRole("button", { name: "What is the Gamut Map?" })),
    ).toBe(false);
  });
});

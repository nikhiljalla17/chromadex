/**
 * Ticket 20 + 24b: the Gamut Map's "?" info affordance, now a click-open
 * Popover (the deep-dive carries clickable links, which a plain Tooltip's
 * pointer-leave dismissal would make unusable — ticket 24b's mechanism note).
 * The popover opens on click with no hover timers, so radix's own open and
 * Escape/outside-click dismissal is deterministic in jsdom. Also asserts the
 * map drag surface is untouched (no pointer-events interference) and that
 * every further-reading link is external, new-tab, and noopener.
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

describe("Gamut Map info affordance (ticket 20 + 24b)", () => {
  it("opens the deep-dive popover on click, with the expanded technical story", () => {
    render(<App />);

    const info = screen.getByRole("button", { name: "What is the Gamut Map?" });
    expect(screen.getByTestId("gamut-map-header")).toBeInTheDocument();
    // Closed by default; content mounts on open.
    expect(screen.queryByTestId("gamut-map-info-popover")).not.toBeInTheDocument();

    fireEvent.click(info);

    const popover = screen.getByTestId("gamut-map-info-popover");
    // The ticket-24b story: CIE 1931 + 2° observer, spectral horseshoe +
    // line of purples, sRGB IEC 61966-2-1, washed-out display-impossible
    // colors, the Cursor's wall.
    expect(popover).toHaveTextContent(/CIE 1931 chromaticity diagram/i);
    expect(popover).toHaveTextContent(/2° standard observer/i);
    expect(popover).toHaveTextContent(/line of purples/i);
    expect(popover).toHaveTextContent(/380 to 700/i);
    expect(popover).toHaveTextContent(/IEC 61966-2-1/i);
    expect(popover).toHaveTextContent(/sRGB/i);
    expect(popover).toHaveTextContent(/no RGB display can produce/i);
    expect(popover).toHaveTextContent(/wall/i);
  });

  it("dismisses on Escape", () => {
    render(<App />);

    const info = screen.getByRole("button", { name: "What is the Gamut Map?" });
    fireEvent.click(info);
    expect(screen.getByTestId("gamut-map-info-popover")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("gamut-map-info-popover")).not.toBeInTheDocument();
  });

  it("lists the further-reading links with correct hrefs, new tab, and noopener", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "What is the Gamut Map?" }));

    const expected = [
      ["CIE 1931 color space — Wikipedia", "https://en.wikipedia.org/wiki/CIE_1931_color_space"],
      ["sRGB — Wikipedia", "https://en.wikipedia.org/wiki/SRGB"],
      ["Bruce Lindbloom's color math pages", "https://brucelindbloom.com/"],
      ["The sRGB standard — W3C", "https://www.w3.org/Graphics/Color/sRGB"],
      ["meodai/color-names (the 31,914-name dataset)", "https://github.com/meodai/color-names"],
      [
        "meodai/colornames-oklab (the wheel's 4,444 names)",
        "https://github.com/meodai/colornames-oklab",
      ],
    ] as const;
    for (const [name, href] of expected) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("the affordance is a real button outside the map's drag surface (no pointer interference)", () => {
    render(<App />);

    const map = screen.getByTestId("gamut-map");
    const info = screen.getByRole("button", { name: "What is the Gamut Map?" });
    // The affordance lives in the header row, not inside the draggable svg.
    expect(map.contains(info)).toBe(false);
  });
});

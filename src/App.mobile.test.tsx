/**
 * Mobile Spotlight shell tests (ticket 30).
 *
 * The breakpoint is a JS matchMedia swap (`use-is-mobile-viewport.ts`):
 * jsdom lacks `window.matchMedia`, so the hook reads as desktop and the
 * desktop suite (App.test.tsx) runs untouched. Every test here stubs
 * matchMedia BEFORE mounting with the shape `{ matches, addEventListener,
 * removeEventListener }` (the documented stub shape from
 * NameWheel.test.tsx) and un-stubs after.
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App, { currentColorStore } from "./App";
import { STARTING_COLOR_SRGB } from "./state/current-color-store";

/** Stub matchMedia as a mobile viewport (< 768px). */
function stubMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
});

describe("mobile Spotlight shell", () => {
  it("renders the Spotlight stack below the breakpoint; desktop panes absent", () => {
    stubMobileViewport();
    render(<App />);

    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
    // Media slot: the Spotlight focus starts on the map. The thumbnail row
    // also mounts a live map, hence getAllBy.
    expect(screen.getByTestId("mobile-media-slot")).toBeInTheDocument();
    expect(screen.getAllByTestId("gamut-map").length).toBeGreaterThanOrEqual(1);
    // Drivers region with RGB + HSL mounted.
    expect(screen.getByTestId("mobile-drivers")).toBeInTheDocument();
    expect(within(screen.getByTestId("mobile-drivers")).getByTestId("rgb-r")).toBeInTheDocument();
    expect(within(screen.getByTestId("mobile-drivers")).getByTestId("hsl-h")).toBeInTheDocument();
    // Swatch-hex bar (the compact upload row was removed — owner: redundant
    // with the Spotlight image thumbnail; upload now lives in the thumbnail →
    // image-slot flow, and the privacy note lives in the focused Eyedropper).
    expect(screen.getByTestId("mobile-swatch-hex")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-upload-row")).not.toBeInTheDocument();
    // Ticker slot with the ticket-31 label and the REAL Name Wheel mounted
    // in horizontal ticker mode (ticket 31).
    const tickerSlot = screen.getByTestId("mobile-ticker-slot");
    expect(tickerSlot.textContent).toContain(
      "Name Wheel — the color closest to your current color",
    );
    const tickerWheel = within(tickerSlot).getByTestId("name-wheel");
    expect(tickerWheel).toHaveAttribute("aria-orientation", "horizontal");
    // Desktop-only panes are not mounted (one tree in the DOM).
    expect(screen.queryByTestId("info-panel")).not.toBeInTheDocument();
  });

  it("the Drivers region is the only scroll container; the shell root does not scroll", () => {
    stubMobileViewport();
    render(<App />);

    expect(screen.getByTestId("mobile-drivers").className).toContain("overflow-y-auto");
    expect(screen.getByTestId("mobile-shell").className).not.toContain("overflow");
  });

  it("swatch-hex bar edits two ways: typing a hex moves the store and the bar follows", async () => {
    const user = userEvent.setup();
    stubMobileViewport();
    render(<App />);

    const input = screen.getByTestId("mobile-hex-input");
    const bar = screen.getByTestId("mobile-swatch-hex");
    expect(input).toHaveValue("aaffcc");
    expect(bar).toHaveStyle({ backgroundColor: "#aaffcc" });

    await user.clear(input);
    await user.type(input, "ff0000");

    expect(currentColorStore.getState().color).toEqual({ r: 1, g: 0, b: 0 });
    expect(bar).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("swatch-hex bar edits two ways: store changes from another source update the bar", () => {
    stubMobileViewport();
    render(<App />);

    act(() => {
      currentColorStore.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });
    });

    expect(screen.getByTestId("mobile-hex-input")).toHaveValue("0000ff");
    expect(screen.getByTestId("mobile-swatch-hex")).toHaveStyle({
      backgroundColor: "#0000ff",
    });
  });

  it("thumbnails promote the Spotlight focus; Upload focuses the image slot", async () => {
    const user = userEvent.setup();
    stubMobileViewport();
    render(<App />);

    // Starts on the map; the image slot is not mounted.
    expect(screen.queryByTestId("mobile-image-slot")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("thumb-image"));
    expect(screen.getByTestId("eyedropper")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-image-slot")).toBeInTheDocument();
    // The thumbnail's live map is still mounted (only one GamutMap now).
    expect(screen.getAllByTestId("gamut-map")).toHaveLength(1);

    // Thumbnails promote the Spotlight focus; the image thumbnail is now the
    // upload entry point (the compact upload row was removed — owner).
    await user.click(screen.getByTestId("thumb-image"));
    expect(screen.getByTestId("eyedropper")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-image-slot")).toBeInTheDocument();
    // The thumbnail's live map is still mounted (only one GamutMap now).
    expect(screen.getAllByTestId("gamut-map")).toHaveLength(1);
    // The focused image slot carries the full Eyedropper: its Browse button
    // and privacy note are the upload entry points now.
    expect(screen.getByTestId("eyedropper-privacy")).toBeInTheDocument();

    await user.click(screen.getByTestId("thumb-map"));
    expect(screen.getAllByTestId("gamut-map").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("eyedropper")).not.toBeInTheDocument();
  });

  it("the live map thumbnail renders a real, pointer-inert GamutMap", () => {
    stubMobileViewport();
    render(<App />);

    const thumb = screen.getByTestId("thumb-map");
    const map = within(thumb).getByTestId("gamut-map");
    // Thumbnail content never drags the Cursor — tap promotes focus only.
    expect(within(thumb).getByTestId("thumb-map-stage").className).toContain(
      "pointer-events-none",
    );
    expect(map).toBeInTheDocument();
  });
});
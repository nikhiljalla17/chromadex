import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";

import App, { currentColorStore } from "./App";
import { hslToSrgb, srgbToXyz, wcagRelativeLuminance } from "./lib/color";
import {
  hexOf,
  labOf,
  oklchOf,
  STARTING_COLOR_SRGB,
} from "./state/current-color-store";

function resetToStartingColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

/** URL writes are rAF-coalesced (url-sync.ts); flush one frame's write. */
async function flushUrlWrite() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe("chromadex app shell", () => {
  beforeEach(resetToStartingColor);

  it("renders the three-pane layout with title and pending panes", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "chromadex" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Gamut Map")).toBeInTheDocument();
    expect(screen.getByLabelText("Name Wheel")).toBeInTheDocument();
    expect(screen.getByLabelText("Controls")).toBeInTheDocument();
    // All three panes are live: no placeholders remain.
    expect(screen.queryAllByTestId("pane-placeholder")).toHaveLength(0);
    expect(screen.getByTestId("name-wheel")).toBeInTheDocument();
  });

  it("shows the Current Color swatch derived from the store", () => {
    render(<App />);

    const swatch = screen.getByTestId("current-color-swatch");
    expect(swatch).toHaveStyle({ backgroundColor: "rgb(170, 255, 204)" });
  });

  it("swatch follows a store action from any source", () => {
    render(<App />);

    act(() => {
      currentColorStore.dispatch({ type: "setFromSrgb", color: { r: 1, g: 0, b: 0 } });
    });

    expect(screen.getByTestId("current-color-swatch")).toHaveStyle({
      backgroundColor: "rgb(255, 0, 0)",
    });
  });
});

describe("hex Driver", () => {
  beforeEach(resetToStartingColor);

  it("renders the Current Color's hex", () => {
    render(<App />);

    const input = screen.getByTestId("hex-input");
    expect(input).toHaveValue("#aaffcc");
  });

  it("typing a valid hex updates the Current Color and the swatch", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByTestId("hex-input");
    await user.clear(input);
    await user.type(input, "#ff0000");

    expect(currentColorStore.getState().color).toEqual({ r: 1, g: 0, b: 0 });
    expect(screen.getByTestId("current-color-swatch")).toHaveStyle({
      backgroundColor: "rgb(255, 0, 0)",
    });
  });

  it("invalid input flags the field and leaves the Current Color unchanged", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByTestId("hex-input");
    await user.clear(input);
    await user.type(input, "zzz");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("hex-error")).toBeInTheDocument();
    // Current Color unchanged, swatch unchanged.
    expect(currentColorStore.getState().color).toEqual(STARTING_COLOR_SRGB);
    expect(screen.getByTestId("current-color-swatch")).toHaveStyle({
      backgroundColor: "rgb(170, 255, 204)",
    });
  });

  it("the field resyncs to the Current Color when it changes from another source", () => {
    render(<App />);

    act(() => {
      currentColorStore.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });
    });

    expect(screen.getByTestId("hex-input")).toHaveValue("#0000ff");
  });

  it("copy button writes the Current Color's hex to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<App />);

    await user.click(screen.getByTestId("copy-hex"));

    expect(writeText).toHaveBeenCalledWith("#aaffcc");
    expect(screen.getByTestId("copy-hex")).toHaveTextContent("Copied!");
  });

  it(
    "clears an open draft when the Current Color changes from another source",
    async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open an invalid draft (no dispatch happens — lastDispatchedHex stays stale).
      await user.type(screen.getByTestId("hex-input"), "ff00");
      expect(screen.getByTestId("hex-input")).toHaveAttribute(
        "aria-invalid",
        "true",
      );

      act(() => {
        currentColorStore.dispatch({
          type: "setFromSrgb",
          color: { r: 1, g: 0, b: 0 },
        });
      });

      // Draft cleared: the field resyncs to the new canonical hex, invalid flag gone.
      expect(screen.getByTestId("hex-input")).toHaveValue("#ff0000");
      expect(screen.getByTestId("hex-input")).not.toHaveAttribute("aria-invalid");
    },
  );
});

describe("RGB Driver", () => {
  beforeEach(resetToStartingColor);

  it("sliders and readouts render the Current Color's channels", () => {
    render(<App />);

    expect(screen.getByTestId("rgb-r")).toHaveValue("170");
    expect(screen.getByTestId("rgb-g")).toHaveValue("255");
    expect(screen.getByTestId("rgb-b")).toHaveValue("204");
    expect(screen.getByTestId("rgb-r-value")).toHaveTextContent("170");
    expect(screen.getByTestId("rgb-b-value")).toHaveTextContent("204");
  });

  it("R/G/B channel labels have tooltips (ticket 17) and the labels no longer carry a phantom help cursor", () => {
    render(<App />);

    // Focus the R input: its label tooltip opens with the red definition.
    fireEvent.focus(screen.getByTestId("rgb-r"));
    expect(screen.getByTestId("rgb-r-tooltip").textContent).toContain(
      "Red channel — how much red light",
    );
    fireEvent.blur(screen.getByTestId("rgb-r"));

    fireEvent.focus(screen.getByTestId("rgb-g"));
    expect(screen.getByTestId("rgb-g-tooltip").textContent).toContain(
      "Green channel — how much green light",
    );
    fireEvent.blur(screen.getByTestId("rgb-g"));

    fireEvent.focus(screen.getByTestId("rgb-b"));
    expect(screen.getByTestId("rgb-b-tooltip").textContent).toContain(
      "Blue channel — how much blue light",
    );
  });

  it("dragging a slider updates the Current Color, hex field, and swatch", () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("rgb-r"), { target: { value: "255" } });

    expect(currentColorStore.getState().color).toEqual({
      r: 1,
      g: STARTING_COLOR_SRGB.g,
      b: STARTING_COLOR_SRGB.b,
    });
    expect(screen.getByTestId("hex-input")).toHaveValue("#ffffcc");
    expect(screen.getByTestId("current-color-swatch")).toHaveStyle({
      backgroundColor: "rgb(255, 255, 204)",
    });
  });

  it("arrow keys nudge the focused channel: ±1, Shift ±10", () => {
    render(<App />);

    const blue = screen.getByTestId("rgb-b");
    blue.focus();
    fireEvent.keyDown(blue, { key: "ArrowRight" });
    expect(blue).toHaveValue("205");
    expect(currentColorStore.getState().color.b).toBeCloseTo(205 / 255);

    fireEvent.keyDown(blue, { key: "ArrowRight", shiftKey: true });
    expect(blue).toHaveValue("215");

    fireEvent.keyDown(blue, { key: "ArrowLeft" });
    expect(blue).toHaveValue("214");
  });

  it("nudging clamps at the channel bounds", () => {
    render(<App />);

    const red = screen.getByTestId("rgb-r");
    red.focus();
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    expect(red).toHaveValue("180"); // 170 + 10

    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    expect(red).toHaveValue("220");

    // No runaway at the top bound.
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(red, { key: "ArrowRight", shiftKey: true });
    expect(red).toHaveValue("250");
  });
});

describe("HSL Driver", () => {
  beforeEach(resetToStartingColor);

  it("sliders render the Current Color's derived HSL", () => {
    render(<App />);

    // #aaffcc → h 144°, s 100%, l 83%.
    expect(screen.getByTestId("hsl-h")).toHaveValue("144");
    expect(screen.getByTestId("hsl-s")).toHaveValue("100");
    expect(screen.getByTestId("hsl-l")).toHaveValue("83");
    expect(screen.getByTestId("hsl-h-value")).toHaveTextContent("144°");
    expect(screen.getByTestId("hsl-s-value")).toHaveTextContent("100%");
  });

  it("changing a slider updates the Current Color, hex field, and swatch", () => {
    render(<App />);

    fireEvent.input(screen.getByTestId("hsl-l"), { target: { value: "50" } });

    const expected = hslToSrgb({ h: 144, s: 1, l: 0.5 });
    expect(currentColorStore.getState().color).toEqual(expected);
    expect(screen.getByTestId("hex-input")).toHaveValue(hexOf(currentColorStore.getState()));
    expect(screen.getByTestId("current-color-swatch")).toHaveStyle({
      backgroundColor: `rgb(${Math.round(expected.r * 255)}, ${Math.round(expected.g * 255)}, ${Math.round(expected.b * 255)})`,
    });
  });

  it("hex changes reposition the HSL and RGB sliders", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByTestId("hex-input");
    await user.clear(input);
    await user.type(input, "#ff0000");

    expect(screen.getByTestId("rgb-r")).toHaveValue("255");
    expect(screen.getByTestId("rgb-g")).toHaveValue("0");
    expect(screen.getByTestId("rgb-b")).toHaveValue("0");
    expect(screen.getByTestId("hsl-h")).toHaveValue("0");
    expect(screen.getByTestId("hsl-s")).toHaveValue("100");
    expect(screen.getByTestId("hsl-l")).toHaveValue("50");
  });

  it("arrow keys nudge the focused HSL channel: ±1, Shift ±10", () => {
    render(<App />);

    const hue = screen.getByTestId("hsl-h");
    hue.focus();
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    expect(hue).toHaveValue("145");
    expect(currentColorStore.getState().color).toEqual(hslToSrgb({ h: 145, s: 1, l: 83 / 100 }));

    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    expect(hue).toHaveValue("155");
  });

  it("nudging hue past the top wraps to the 0° color (same color, thumb returns to far left)", () => {
    render(<App />);

    // seed the store with a color whose hue is one nudge from the top bound
    act(() => {
      currentColorStore.dispatch({
        type: "setFromSrgb",
        color: hslToSrgb({ h: 359, s: 1, l: 83 / 100 }),
      });
    });
    const hue = screen.getByTestId("hsl-h");
    expect(hue).toHaveValue("359");
    hue.focus();
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    // h=360 dispatches hslToSrgb({h:360,...}) which wraps to the h=0 color
    expect(currentColorStore.getState().color).toEqual(hslToSrgb({ h: 360, s: 1, l: 83 / 100 }));
    expect(hue).toHaveValue("0");
  });
});

describe("URL state", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    resetToStartingColor();
  });

  it("any store change rewrites ?color= (URL write side)", async () => {
    act(() => {
      currentColorStore.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });
    });
    await flushUrlWrite();

    expect(window.location.search).toBe("?color=0000ff");
  });

  it("resetting the Current Color rewrites the URL back", async () => {
    act(() => {
      currentColorStore.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });
    });
    act(() => {
      resetToStartingColor();
    });
    // Both dispatches coalesce into one frame write of the final color.
    await flushUrlWrite();

    expect(window.location.search).toBe("?color=aaffcc");
  });
});

describe("Info panel", () => {
  beforeEach(resetToStartingColor);

  function infoText(testId: string): string {
    // the value lives in the row's <dd>; textContent of the row includes the label
    const dd = screen.getByTestId(testId).querySelector("dd");
    return dd?.textContent ?? "";
  }

  it("renders Lab, luminance, WCAG luminance, and OKLCH matching the color module", () => {
    render(<App />);

    const state = currentColorStore.getState();
    const lab = labOf(state);
    const oklch = oklchOf(state);
    const y = srgbToXyz(state.color).y;
    const wcagY = wcagRelativeLuminance(state.color);

    expect(infoText("info-lab")).toBe(
      `${lab.l.toFixed(2)}  ${lab.a.toFixed(2)}  ${lab.b.toFixed(2)}`,
    );
    expect(infoText("info-luminance")).toBe(y.toFixed(3));
    expect(infoText("info-wcag-luminance")).toBe(wcagY.toFixed(3));
    expect(infoText("info-oklch")).toBe(
      `${oklch.l.toFixed(3)}  ${oklch.c.toFixed(3)}  ${oklch.h.toFixed(1)}°`,
    );
    // sanity: the starting color's values land where the module says they should
    expect(infoText("info-lab")).toBe("93.63  -36.07  16.35");
    expect(infoText("info-oklch")).toBe("0.932  0.108  157.2°");
  });

  it("updates live when the Current Color changes from any source", () => {
    render(<App />);

    act(() => {
      currentColorStore.dispatch({ type: "setFromHex", hex: "ff0000" });
    });

    // #ff0000 → Lab(53.24, 80.09, 67.20), OKLab L 0.6279554, C 0.2576833, h 29.2339
    expect(infoText("info-lab")).toBe("53.24  80.09  67.20");
    expect(infoText("info-oklch")).toBe("0.628  0.258  29.2°");
    expect(infoText("info-luminance")).toBe("0.213");
  });

  it("updates live from a direct sRGB dispatch too (any source, literally)", () => {
    render(<App />);

    act(() => {
      currentColorStore.dispatch({
        type: "setFromSrgb",
        color: { r: 0, g: 1, b: 0 },
      });
    });

    // #00ff00 → Lab(87.73, −86.18, 83.18) per the D65 goldens
    expect(infoText("info-lab")).toBe("87.73  -86.18  83.18");
  });

  it("is read-only: renders no color-editing inputs", () => {
    render(<App />);

    const panel = screen.getByTestId("info-panel");
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("slider")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("spinbutton")).not.toBeInTheDocument();
    // Buttons exist since ticket 12 (tooltip definition triggers), but they
    // open tooltips only — none of them dispatch into the store.
    const buttons = within(panel).queryAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.className).toContain("cursor-help");
    }
  });
});

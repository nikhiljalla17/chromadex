/**
 * Name Wheel horizontal ticker tests (ticket 31). The mobile shell mounts
 * `<NameWheel orientation="horizontal" />`; these render that component
 * directly and assert through the store seam and the DOM — the desktop
 * vertical rail's suite (NameWheel.test.tsx) is untouched and stays the
 * authority for the shared physics.
 *
 * Environment notes (mirroring NameWheel.test.tsx):
 * - jsdom has no layout, so the ticker runs at FALLBACK_WIDTH (390px) and
 *   the offset that centers chip i is `i * 84 - (390 - 84) / 2` = i*84 - 153.
 *   `data-scroll-pos` on the wheel root exposes the offset.
 * - The offset is inverted against the pointer coordinate on BOTH axes, so
 *   dragging/flicking LEFT browses toward later chips (the same math as the
 *   vertical rail's drag-up), with clientX substituted for clientY.
 * - Trail timestamps come from the component's performance.now() reads; the
 *   mock clock makes release velocity exact.
 * - jsdom lacks `window.matchMedia`; the component treats it as
 *   reduce=false. The reduced-motion test stubs it before rendering.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NameWheel } from "./NameWheel";
import { nearestNamesChain } from "../../lib/color/names";
import { currentColorStore } from "../../state/store";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";

const CHIP_PITCH = 84;
const FALLBACK_WIDTH = 390;
/** The chain sequence's center index at the 150-row window. */
const CENTER = Math.floor((150 - 1) / 2);

/** Offset centering chip i on the needle in the unmeasured environment. */
function centeredPosH(index: number, count = 150): number {
  const min = -(FALLBACK_WIDTH - CHIP_PITCH) / 2;
  const max = (count - 1) * CHIP_PITCH + min;
  return Math.min(max, Math.max(min, index * CHIP_PITCH + min));
}

function resetToStartingColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

function storeColor() {
  return currentColorStore.getState().color;
}

/** Let real rAF fire a few frames (jsdom rAF ≈ 16ms timer). */
async function pumpFrames(count = 4) {
  await act(async () => {
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
}

/** Wait out the ~200ms snap tween + 250ms settle window. */
async function flushSettle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
}

/** Controllable performance.now clock (the component's sole timebase). */
function useMockClock(startAt = 1000) {
  const clock = { t: startAt };
  const spy = vi.spyOn(performance, "now").mockImplementation(() => clock.t);
  return {
    advance: (ms: number) => {
      clock.t += ms;
    },
    stop: () => spy.mockRestore(),
  };
}

/** Horizontal drag gesture with controlled timing (clientX; see header). */
function flickGestureX(
  wheel: HTMLElement,
  startX: number,
  endX: number,
  clock: { advance(ms: number): void },
  opts: { stepMs?: number; steps?: number } = {},
) {
  const stepMs = opts.stepMs ?? 16;
  const steps = opts.steps ?? 6;
  clock.advance(stepMs);
  fireEvent.pointerDown(wheel, { clientX: startX });
  for (let i = 1; i <= steps; i++) {
    clock.advance(stepMs);
    const x = startX + ((endX - startX) * i) / steps;
    fireEvent.pointerMove(wheel, { clientX: x });
  }
  clock.advance(stepMs);
  fireEvent.pointerUp(wheel, { clientX: endX });
}

describe("Name Wheel horizontal ticker (ticket 31)", () => {
  beforeEach(resetToStartingColor);

  it("renders as a horizontal listbox: chips on the X axis, vertical center-line needle", () => {
    render(<NameWheel orientation="horizontal" />);

    const wheel = screen.getByTestId("name-wheel");
    // ARIA: the listbox contract adapts via orientation (see header).
    expect(wheel).toHaveAttribute("role", "listbox");
    expect(wheel).toHaveAttribute("aria-orientation", "horizontal");
    expect(wheel).toHaveAttribute(
      "aria-activedescendant",
      `name-wheel-option-${CENTER}`,
    );

    // The spacer is a ROW: width covers all 150 chips at the pitch, offset
    // applied on X (translateX), centered on the seed chip.
    const spacer = wheel.querySelector(".relative") as HTMLElement;
    expect(spacer.style.width).toBe(`${150 * CHIP_PITCH}px`);
    expect(spacer.style.transform).toBe(
      `translateX(${-centeredPosH(CENTER)}px)`,
    );
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPosH(CENTER))),
    );

    // Chips are positioned on X at multiples of the pitch, with the
    // prototype's hex fill + contrast ink look.
    const chip = wheel.querySelector(
      `[data-index="${CENTER}"]`,
    ) as HTMLElement;
    expect(chip.style.left).toBe(`${CENTER * CHIP_PITCH}px`);
    expect(chip.style.width).toBe(`${CHIP_PITCH - 4}px`);
    const seed = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER];
    // jsdom serializes the hex fill as rgb().
    const n = parseInt(seed.hex.slice(1), 16);
    expect(chip.style.backgroundColor).toBe(
      `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`,
    );

    // The needle is a vertical center line (the prototype's w-px inset-y line).
    const needle = wheel.querySelector(
      '[data-testid="name-wheel-needle"]',
    ) as HTMLElement;
    expect(needle.className).toContain("left-1/2");
    expect(needle.className).not.toContain("top-1/2");
  });

  it("dragging along X live-updates the Current Color, and the trailing click is still suppressed (ticket 23 semantics)", () => {
    const clock = useMockClock();
    try {
      render(<NameWheel orientation="horizontal" />);
      const wheel = screen.getByTestId("name-wheel");

      // A deliberate 60px leftward drag over ~200ms (release velocity ≈
      // 0.3px/ms, below the flick threshold): browsing, not a spin. The
      // offset is inverted against clientX, so dragging LEFT browses toward
      // later chips: 60px < 1 pitch → the needle ends on chip CENTER+1.
      flickGestureX(wheel, 195, 135, clock, { stepMs: 40, steps: 4 });

      const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(storeColor()).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });

      // The gesture's synthesized click on the pressed chip is suppressed.
      fireEvent.click(
        wheel.querySelector(`[data-index="${CENTER + 2}"]`) as HTMLElement,
      );
      expect(storeColor()).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });
    } finally {
      clock.stop();
    }
  });

  it("pointer capture must NOT be active on a plain pointerdown; crossing the drag threshold on X captures lazily", () => {
    render(<NameWheel orientation="horizontal" />);

    const wheel = screen.getByTestId("name-wheel");
    const captureSpy = vi.fn();
    (wheel as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture =
      captureSpy;

    // Plain press + release without crossing the drag threshold (X axis).
    fireEvent.pointerDown(wheel, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(wheel, { clientX: 100, pointerId: 1 });
    expect(captureSpy).not.toHaveBeenCalled();

    // Crossing the threshold with a horizontal movement captures lazily.
    fireEvent.pointerDown(wheel, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(wheel, { clientX: 160 });
    expect(captureSpy).toHaveBeenCalledWith(1);
  });

  it("ArrowRight browses one chip (live-dispatch per keypress); ArrowLeft browses back", async () => {
    render(<NameWheel orientation="horizontal" />);
    const wheel = screen.getByTestId("name-wheel");

    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
    expect(storeColor()).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPosH(CENTER + 1))),
    );

    fireEvent.keyDown(wheel, { key: "ArrowLeft" });
    const back = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER];
    expect(storeColor()).toEqual({
      r: back.srgb.r,
      g: back.srgb.g,
      b: back.srgb.b,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPosH(CENTER))),
    );
  });

  it("wheel deltas drive the strip on X (deltaX; deltaY honored as fallback) with live dispatch", () => {
    render(<NameWheel orientation="horizontal" />);
    const wheel = screen.getByTestId("name-wheel");

    fireEvent.wheel(wheel, { deltaX: 2 * CHIP_PITCH });
    const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 2];
    expect(storeColor()).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPosH(CENTER) + 2 * CHIP_PITCH)),
    );

    // A plain vertical wheel still browses (deltaY fallback).
    fireEvent.wheel(wheel, { deltaY: CHIP_PITCH });
    const expected2 = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 3];
    expect(storeColor()).toEqual({
      r: expected2.srgb.r,
      g: expected2.srgb.g,
      b: expected2.srgb.b,
    });
  });

  it("a flick imparts X momentum: travels past the drag distance, center-snaps, and re-anchors at rest", async () => {
    const clock = useMockClock();
    try {
      render(<NameWheel orientation="horizontal" />);
      const wheel = screen.getByTestId("name-wheel");
      const before = storeColor();

      // Drag 110px left over ~112ms → release velocity ≈ 1px/ms (a flick);
      // the offset is inverted against clientX, so the strip travels forward…
      flickGestureX(wheel, 210, 100, clock);
      // …and momentum carries it far beyond the 110px drag before decaying.
      // Same frame-bumping pattern as the desktop suite (64ms/frame cap).
      for (let i = 0; i < 40; i++) {
        clock.advance(64);
        await pumpFrames(2);
      }

      // Center-snapped AND re-indexed: the landed chip is the new center
      // entry, so the ticker rests exactly at the center-chip position and
      // the selected (Current Color's) chip is the center entry.
      expect(wheel.getAttribute("data-scroll-pos")).toBe(
        String(Math.round(centeredPosH(CENTER))),
      );
      const selected = wheel.querySelector(
        '[aria-selected="true"]',
      ) as HTMLElement;
      expect(selected.getAttribute("data-index")).toBe(String(CENTER));
      const after = storeColor();
      expect(after).not.toEqual(before);
    } finally {
      clock.stop();
    }
  });

  it("after a slow release the strip SETTLE-REANCHORS: 250ms after input stops, the landed chip becomes the center entry", async () => {
    const clock = useMockClock();
    try {
      render(<NameWheel orientation="horizontal" />);
      const wheel = screen.getByTestId("name-wheel");

      // Slow leftward drag: needle ends on chip CENTER+1, strip still
      // scroll-anchored (authorship: no rebuild mid-gesture).
      flickGestureX(wheel, 195, 135, clock, { stepMs: 40, steps: 4 });
      const landed = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(storeColor()).toEqual({
        r: landed.srgb.r,
        g: landed.srgb.g,
        b: landed.srgb.b,
      });
      const selectedMid = wheel.querySelector(
        '[aria-selected="true"]',
      ) as HTMLElement;
      expect(selectedMid.getAttribute("data-index")).toBe(String(CENTER + 1));

      // Let the snap tween finish and the 250ms settle window elapse.
      clock.stop();
      await flushSettle();

      // Settled: the chain re-anchored around the landed color — the landed
      // chip is now the CENTER entry (index shifted by the rebuild), and the
      // offset rests at the center-chip position. The color is unchanged.
      expect(storeColor()).toEqual({
        r: landed.srgb.r,
        g: landed.srgb.g,
        b: landed.srgb.b,
      });
      const selected = wheel.querySelector(
        '[aria-selected="true"]',
      ) as HTMLElement;
      expect(selected.getAttribute("data-index")).toBe(String(CENTER));
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPosH(CENTER))),
      );
    } finally {
      clock.stop();
    }
  });

  it("expansion works on the X axis: End expands the strip and the offset shifts with the indices", async () => {
    render(<NameWheel orientation="horizontal" />);
    const wheel = screen.getByTestId("name-wheel");

    // End: the needle rests on the sequence's last chip; landing within the
    // edge trigger fires an expansion (100 chips prepended per side), so the
    // offset shifts by the chunk — same name under the needle, new index.
    fireEvent.keyDown(wheel, { key: "End" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const oldCount = 150;
    const expandedCount = oldCount + 200;
    // The spacer now spans the expanded sequence.
    const spacer = wheel.querySelector(".relative") as HTMLElement;
    expect(spacer.style.width).toBe(`${expandedCount * CHIP_PITCH}px`);
    // Same name as the pre-expansion last chip is now under the needle
    // (index oldCount - 1 + 100 after the symmetric prepend).
    const oldLast = nearestNamesChain(STARTING_COLOR_SRGB, oldCount)[
      oldCount - 1
    ];
    const activeId = wheel.getAttribute("aria-activedescendant") ?? "";
    expect(document.getElementById(activeId)?.getAttribute("aria-label")).toBe(
      oldLast.name,
    );
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(
        Math.round(centeredPosH(oldCount - 1 + 100, expandedCount)),
      ),
    );
  });

  it("under prefers-reduced-motion a flick does not travel: stops where released and selects instantly", () => {
    const clock = useMockClock();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("reduce"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    try {
      render(<NameWheel orientation="horizontal" />);
      const wheel = screen.getByTestId("name-wheel");

      flickGestureX(wheel, 210, 100, clock);
      // …has ALREADY center-snapped and selected, without any animation
      // wait. The selection re-indexes the strip, so the ticker rests at
      // centeredPosH(CENTER) with the landed chip pinned at the needle:
      // 110px ≈ 1.3 pitches → the old strip's chip CENTER+1.
      const landed = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(storeColor()).toEqual({
        r: landed.srgb.r,
        g: landed.srgb.g,
        b: landed.srgb.b,
      });
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPosH(CENTER))),
      );
    } finally {
      clock.stop();
      vi.unstubAllGlobals();
    }
  });
});

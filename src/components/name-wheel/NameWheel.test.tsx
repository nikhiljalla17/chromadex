/**
 * Name Wheel behavior tests (ticket 08). These render the full App (the
 * GamutMap.test.tsx idiom) and assert through the store seam and the DOM —
 * no internals.
 *
 * Environment notes:
 * - jsdom has no layout, so the wheel runs at its FALLBACK_HEIGHT (440px)
 *   and the offset that centers row i is `i * 44 - (440 - 44) / 2` = -198
 *   for row 0. `data-scroll-pos` on the wheel root exposes the offset.
 * - jsdom lacks `window.matchMedia`; the component treats it as
 *   reduce=false. The reduced-motion test stubs it before mounting — the
 *   stub shape is `{ matches, addEventListener, removeEventListener }`.
 * - The swish animates via requestAnimationFrame (jsdom fires rAF on a
 *   ~16ms timer); the smooth-path test waits out the full animation with a
 *   real-timer sleep inside `act`.
 * - Dataset matches carry `a: 1`; the store's `setFromSrgb` returns the
 *   opaque `{ r, g, b }` Current Color, so expectations compare the three
 *   channels.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App, { currentColorStore } from "../../App";
import { nearestNamesChain } from "../../lib/color/names";
import { defaultListSize } from "../../lib/color-names/names";
import { srgbToHex } from "../../lib/color/hex";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";

const ROW_HEIGHT = 44;
const FALLBACK_HEIGHT = 440;
/** The chain sequence's center index at WHEEL_SIZE 150 (ticket 16/22). */
const CENTER = Math.floor((150 - 1) / 2);
/** Rows added to EACH side per expansion (ticket 19; mirrors NameWheel). */
const EXPAND_CHUNK = 100;
/** Max expansions before the strip spans the whole dataset (ticket 21). */
const MAX_EXPANSIONS = 22;
/** Offset centering row i at the needle in the unmeasured environment. */
function centeredPos(index: number): number {
  return index * ROW_HEIGHT - (FALLBACK_HEIGHT - ROW_HEIGHT) / 2;
}

/** Same, clamped to a sequence of `count` rows (ticket-19 expanded geometry). */
function centeredPosIn(index: number, count: number): number {
  const min = -(FALLBACK_HEIGHT - ROW_HEIGHT) / 2;
  const max = (count - 1) * ROW_HEIGHT + min;
  return Math.min(max, Math.max(min, index * ROW_HEIGHT + min));
}

function resetToStartingColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

/** Wait out the ~280ms swish animation (jsdom rAF runs on real timers). */
async function flushSwish() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

describe("Name Wheel", () => {
  beforeEach(resetToStartingColor);

  it("renders the nearest ~150 names chained outward from the Current Color", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150);
    expect(expected).toHaveLength(150);

    // The full list exists (spacer height covers all 150 rows)…
    const spacer = wheel.querySelector(".relative") as HTMLElement;
    expect(spacer.style.height).toBe(`${150 * ROW_HEIGHT}px`);

    // …but only the visible window + overscan is in the DOM (virtualized).
    const rendered = within(wheel).getAllByTestId("name-wheel-row");
    expect(rendered.length).toBeGreaterThan(5);
    expect(rendered.length).toBeLessThan(150);

    // Chain ordering (ticket 22): the center row is the seed — the global
    // minimum — so its immediate neighbors on BOTH sides are farther. Beyond
    // ±1 the walk wanders by design (consecutive rows are color-space
    // neighbors, not distance-ranked — the fold's V-shaped profile is gone),
    // so only the seed's local minimum is asserted here; adjacency is
    // asserted at the engine level (names.test.ts).
    const rowName = (index: number) =>
      wheel.querySelector(`[data-index="${index}"]`)?.textContent ?? "";
    expect(rowName(CENTER)).toContain(expected[CENTER].name);
    const dist = (index: number) =>
      Number(
        (wheel.querySelector(`[data-index="${index}"]`) as HTMLElement).dataset
          .distance,
      );
    expect(dist(CENTER - 1)).toBeGreaterThan(dist(CENTER));
    expect(dist(CENTER + 1)).toBeGreaterThan(dist(CENTER));
  });

  it("marks the Current Color's Name as the centered row", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    // The center row is the current Name (aria-selected), styled as current…
    const current = wheel.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(current).toHaveAttribute("data-index", String(CENTER));
    expect(current.textContent).toContain(
      nearestNamesChain(STARTING_COLOR_SRGB, 1)[0].name,
    );
    // …and it is pinned at the exact vertical center on mount.
    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPos(CENTER))),
    );
  });

  it("clicking a visible Name sets the Current Color (two-way)", async () => {
    const user = userEvent.setup();
    render(<App />);

    const expected =
      nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 7];
    const row = document.querySelector(
      `[data-index="${CENTER + 7}"]`,
    ) as HTMLElement;
    await user.click(row);

    expect(currentColorStore.getState().color).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
    // Hex Driver follows the Current Color.
    expect(screen.getByTestId("hex-input")).toHaveValue(
      srgbToHex({ ...expected.srgb, a: 1 }),
    );
  });

  it("a drag live-updates the Current Color as the wheel moves, and the trailing click is still suppressed (ticket 23)", () => {
    const clock = useMockClock();
    try {
      render(<App />);

      const wheel = screen.getByTestId("name-wheel");

      // A deliberate 60px upward drag over ~200ms (release velocity ≈ 0.19px/ms,
      // below the flick threshold): browsing, not a spin. The wheel offset is
      // inverted Y, so dragging UP browses toward higher indices: 60px ≈ 1.36
      // rows → the needle ends on row CENTER+1.
      flickGesture(wheel, 180, 120, clock, { stepMs: 40, steps: 4 });

      // Live dispatch: the needle row's color became the Current Color during
      // the drag — not only on release or selection.
      const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });

      // The gesture's synthesized click on the pressed row is still suppressed:
      // the dragged-to color survives (the pressed row is NOT selected).
      const row = wheel.querySelector(
        `[data-index="${CENTER + 2}"]`,
      ) as HTMLElement;
      fireEvent.click(row);
      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });
    } finally {
      clock.stop();
    }
  });

  it("wheel-authored scrolling updates the Current Color live WITHOUT re-anchoring the strip (no rebuild, no swish — ticket 23)", async () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");

    // Scroll two rows: the store follows the needle row...
    fireEvent.wheel(wheel, { deltaY: 2 * ROW_HEIGHT });
    const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 2];
    expect(currentColorStore.getState().color).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
    // ...the strip does NOT re-center: a wheel-authored change must skip the
    // chain rebuild + swish (the feedback loop would move the strip under a
    // scrolling user). The offset moved by exactly the delta.
    expect(wheel.getAttribute("data-scroll-pos")).toBe(
      String(Math.round(centeredPos(CENTER) + 2 * ROW_HEIGHT)),
    );
    // The needle row is the Current Color's row (aria-selected during motion).
    const selected = wheel.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement;
    expect(selected.getAttribute("data-index")).toBe(String(CENTER + 2));

    // A swish-only regression (rAF tween after the sync assertions) would slip
    // past the checks above — flush the tween window and re-assert the offset.
    await flushSwish();
    expect(wheel.getAttribute("data-scroll-pos")).toBe(
      String(Math.round(centeredPos(CENTER) + 2 * ROW_HEIGHT)),
    );

    // A further scroll keeps the strip anchored: the offset again moves by
    // exactly the delta (a rebuild+swish would have snapped it back to the
    // center row), and the still-unrebuilt chain's row is dispatched.
    fireEvent.wheel(wheel, { deltaY: ROW_HEIGHT });
    const expected2 = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 3];
    expect(currentColorStore.getState().color).toEqual({
      r: expected2.srgb.r,
      g: expected2.srgb.g,
      b: expected2.srgb.b,
    });
    expect(wheel.getAttribute("data-scroll-pos")).toBe(
      String(Math.round(centeredPos(CENTER) + 3 * ROW_HEIGHT)),
    );
  });

  it("a plain click (no movement) selects the pressed row", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    const row = wheel.querySelector(
      `[data-index="${CENTER + 4}"]`,
    ) as HTMLElement;
    fireEvent.pointerDown(wheel, { clientY: 100 });
    fireEvent.pointerUp(wheel, { clientY: 100 });
    fireEvent.click(row);

    const expected =
      nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 4];
    expect(currentColorStore.getState().color).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
  });

  it("pointer capture must NOT be active on a plain pointerdown (capture retargets the browser's click to the container, which would break row clicks)", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    // jsdom does not implement setPointerCapture — stub it so we can spy.
    const captureSpy = vi.fn();
    (wheel as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = captureSpy;

    // Plain press + release without crossing the drag threshold.
    fireEvent.pointerDown(wheel, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(wheel, { clientY: 100, pointerId: 1 });
    expect(captureSpy).not.toHaveBeenCalled();

    // Crossing the threshold captures lazily.
    fireEvent.pointerDown(wheel, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(wheel, { clientY: 160 });
    expect(captureSpy).toHaveBeenCalledWith(1);
  });

  it("re-centers smoothly on the current Name when the color changes elsewhere", async () => {
    render(<App />);

    // Browse away from the center first.
    const wheel = screen.getByTestId("name-wheel");
    fireEvent.wheel(wheel, { deltaY: 240 });
    expect(wheel.getAttribute("data-scroll-pos")).not.toBe(
      String(Math.round(centeredPos(CENTER))),
    );

    // External change: a hex Driver dispatch → the new nearest Name is the
    // new center entry, and the swish glides the wheel back to center it.
    act(() => {
      currentColorStore.dispatch({ type: "setFromHex", hex: "ff0000" });
    });
    await flushSwish();

    expect(wheel).toHaveAttribute(
      "data-scroll-pos",
      String(Math.round(centeredPos(CENTER))),
    );
    const current = wheel.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(current.textContent).toContain(
      nearestNamesChain(currentColorStore.getState().color, 1)[0].name,
    );
  });

  it("skips the swish under prefers-reduced-motion (instant re-center)", () => {
    // Stub matchMedia BEFORE mount: the hook reads it in its initializer.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("reduce"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );

    try {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");
      fireEvent.wheel(wheel, { deltaY: 240 });
      const browsed = wheel.getAttribute("data-scroll-pos");
      expect(browsed).not.toBe(String(Math.round(centeredPos(CENTER))));

      act(() => {
        currentColorStore.dispatch({ type: "setFromHex", hex: "ff0000" });
      });

      // Instant: no rAF wait needed — already re-centered.
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPos(CENTER))),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // --- Ticket 12: keyboard browsing & ARIA contract ---

  describe("keyboard browsing (a11y pass)", () => {
    it("ArrowDown browses one row and live-updates the Current Color per keypress (ticket 23)", async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      // Live per keypress: the target row's color is current immediately,
      // before the center-snap tween finishes.
      const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });

      await flushSwish();

      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPos(CENTER + 1))),
      );
      // The activedescendant follows the needle.
      expect(wheel).toHaveAttribute(
        "aria-activedescendant",
        `name-wheel-option-${CENTER + 1}`,
      );
    });

    it("ArrowUp browses back one row (toward the center from above)", async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      await flushSwish();
      fireEvent.keyDown(wheel, { key: "ArrowUp" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPos(CENTER))),
      );
    });

    it("PageDown pages five rows; End reaches the end and EXPANDS the strip (ticket 19)", async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      fireEvent.keyDown(wheel, { key: "PageDown" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPos(CENTER + 5))),
      );

      // End: the needle rests on the current sequence's last row. Landing
      // within the edge trigger fires an expansion, which prepends
      // EXPAND_CHUNK rows per side — every absolute index shifts, so the
      // offset shifts with it (same name under the needle, new index).
      const oldCount = 150;
      const expandedCount = oldCount + 2 * EXPAND_CHUNK;
      fireEvent.keyDown(wheel, { key: "End" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(
          Math.round(centeredPosIn(oldCount - 1 + EXPAND_CHUNK, expandedCount)),
        ),
      );
      // Same name as the pre-expansion last row is now under the needle.
      const oldLast = nearestNamesChain(STARTING_COLOR_SRGB, oldCount)[
        oldCount - 1
      ];
      const activeId = wheel.getAttribute("aria-activedescendant") ?? "";
      expect(document.getElementById(activeId)?.getAttribute("aria-label")).toBe(
        oldLast.name,
      );

      // Browsing down past the old end reaches NEW rows — no wall until the cap.
      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(
          Math.round(
            centeredPosIn(oldCount + EXPAND_CHUNK, expandedCount),
          ),
        ),
      );
      expect(
        wheel.querySelector(`[data-index="${oldCount + EXPAND_CHUNK}"]`),
      ).not.toBeNull();
    });

    it("Home reaches the left end and expands it; browsing up reaches new rows", async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      // Home: needle on the old first row; expansion prepends EXPAND_CHUNK
      // rows per side, so the offset shifts with the indices.
      const expandedCount = 150 + 2 * EXPAND_CHUNK;
      fireEvent.keyDown(wheel, { key: "Home" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPosIn(EXPAND_CHUNK, expandedCount))),
      );

      // Browsing up past the old end reaches NEW prepended rows.
      fireEvent.keyDown(wheel, { key: "ArrowUp" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPosIn(EXPAND_CHUNK - 1, expandedCount))),
      );
      expect(
        wheel.querySelector(`[data-index="${EXPAND_CHUNK - 1}"]`),
      ).not.toBeNull();
    });

    it(
      "at the expansion cap the strip spans the dataset (MAX_EXPANSIONS)",
      async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      // Drive to the cap: each End lands on the (growing) end and expands.
      // The final chunk is partial: the engine clamps to the dataset (4,444
      // rows), so bookkeeping min()s against the bundled list size.
      let count = 150;
      for (let i = 0; i < MAX_EXPANSIONS; i++) {
        fireEvent.keyDown(wheel, { key: "End" });
        await flushSwish();
        count = Math.min(count + 2 * EXPAND_CHUNK, defaultListSize());
      }
      expect(count).toBe(defaultListSize());
      // One more End: the cap is reached; the strip no longer grows.
      fireEvent.keyDown(wheel, { key: "End" });
      await flushSwish();
      const cappedEnd = centeredPosIn(count - 1, count);
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(cappedEnd)),
      );

      // Browsing down past the capped end clamps hard.
      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      await flushSwish();
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(cappedEnd)),
      );
      },
      // 22 expansions × ~420ms swish flush each — the 5s default is too tight.
      30000,
    );

    it("selection at depth re-anchors the strip around the landed Name (ticket 19)", async () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      // Go deep: End expands the strip; the needle rests on the old end row.
      fireEvent.keyDown(wheel, { key: "End" });
      await flushSwish();
      const deepName =
        document.getElementById(wheel.getAttribute("aria-activedescendant") ?? "")
          ?.getAttribute("aria-label") ?? "";
      expect(deepName).not.toBe("");

      // Enter selects the deep row; the strip re-anchors around it: the
      // landed Name becomes the new center entry (depth persists — the strip
      // size is unchanged), and the offset jumps to the new center in the
      // same commit.
      const expandedCount = 150 + 2 * EXPAND_CHUNK;
      fireEvent.keyDown(wheel, { key: "Enter" });

      const newSeq = nearestNamesChain(currentColorStore.getState().color, expandedCount);
      // The landed Name is the new sequence's center entry.
      expect(newSeq[Math.floor((expandedCount - 1) / 2)].name).toBe(deepName);
      // Offset jumped to the new center in the same commit (no glide).
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(
          Math.round(centeredPosIn(Math.floor((expandedCount - 1) / 2), expandedCount)),
        ),
      );
      // The new center row is aria-selected.
      const activeId = wheel.getAttribute("aria-activedescendant") ?? "";
      expect(
        document.getElementById(activeId)?.getAttribute("aria-selected"),
      ).toBe("true");
    });

    it("Enter selects the row under the needle (explicit selection)", () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");
      const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[
        CENTER + 3
      ];

      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      fireEvent.keyDown(wheel, { key: "ArrowDown" });
      fireEvent.keyDown(wheel, { key: "Enter" });

      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });
      // Selection re-indexes in the same commit: the chosen Name is the new
      // center entry, already centered — no glide.
      expect(wheel).toHaveAttribute(
        "data-scroll-pos",
        String(Math.round(centeredPos(CENTER))),
      );
    });

    it("the listbox contract: root is a focusable listbox naming the needle row", () => {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      expect(wheel).toHaveAttribute("role", "listbox");
      expect(wheel).toHaveAttribute("tabindex", "0");
      expect(wheel).toHaveAttribute(
        "aria-activedescendant",
        `name-wheel-option-${CENTER}`,
      );
      const option = wheel.querySelector('[role="option"]');
      expect(option).not.toBeNull();
      expect(option!.id).toMatch(/^name-wheel-option-\d+$/);
    });
  });

  // --- Ticket 09: spin physics & momentum ---

  /**
   * Drag gesture with controlled timing: trail timestamps come from the
   * component's performance.now() reads, so a controllable mock clock makes
   * release velocity exact (velocity = total distance / trail duration).
   * NOTE: the wheel offset increases when the pointer moves UP (offset is
   * inverted Y) and clamps at centeredPos(0) (list top) — momentum tests
   * flick upward.
   */
  function flickGesture(
    wheel: HTMLElement,
    startY: number,
    endY: number,
    clock: { advance(ms: number): void },
    opts: { stepMs?: number; steps?: number } = {},
  ) {
    const stepMs = opts.stepMs ?? 16;
    const steps = opts.steps ?? 6;
    clock.advance(stepMs);
    fireEvent.pointerDown(wheel, { clientY: startY });
    for (let i = 1; i <= steps; i++) {
      clock.advance(stepMs);
      const y = startY + ((endY - startY) * i) / steps;
      fireEvent.pointerMove(wheel, { clientY: y });
    }
    clock.advance(stepMs);
    fireEvent.pointerUp(wheel, { clientY: endY });
  }

  /** Controllable performance.now clock (the component's sole timebase —
   * trail sampling, spin decay, and tweens all read it). Real rAF drives
   * the animation frames; each clock advance is one effective frame. */
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

  /** Let real rAF fire a few frames (jsdom rAF ≈ 16ms timer). */
  async function pumpFrames(count = 4) {
    await act(async () => {
      for (let i = 0; i < count; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
  }

  it("a flick imparts momentum: the wheel travels well past the drag distance, center-snaps, and the landed Name becomes the Current Color", async () => {
    const clock = useMockClock();
    try {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");
      const before = currentColorStore.getState().color;

      // Drag 110px upward over ~112ms → release velocity ≈ 1px/ms (a flick);
      // the wheel offset is inverted Y, so the wheel moves down the list…
      flickGesture(wheel, 210, 100, clock);
      // …and momentum carries it far beyond the 110px drag before decaying.
      // The component caps per-frame dt at 64ms, so bump the clock 64ms per
      // frame; ~30 frames (≈1.9s of wheel time) cover the full decay+snap.
      for (let i = 0; i < 40; i++) {
        clock.advance(64);
        await pumpFrames(2);
      }

      // Center-snapped AND re-indexed: the landed Name is the new center
      // entry, so the wheel rests exactly at the center-row position.
      expect(wheel.getAttribute("data-scroll-pos")).toBe(
        String(Math.round(centeredPos(CENTER))),
      );
      // Landed Name selected: the store changed, and hex follows it.
      const after = currentColorStore.getState().color;
      expect(after).not.toEqual(before);
      expect(screen.getByTestId("hex-input")).toHaveValue(
        srgbToHex({ ...after, a: 1 }),
      );
    } finally {
      clock.stop();
    }
  });

  it("the spin updates the Current Color live during travel and re-anchors at rest (ticket 23)", async () => {
    const clock = useMockClock();
    try {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");
      const before = currentColorStore.getState().color;

      flickGesture(wheel, 210, 100, clock);
      // Live travel (slot-machine): the color starts following the needle
      // frames BEFORE the spin settles (the landed-selection/one-dispatch
      // contract is dissolved).
      for (let i = 0; i < 6; i++) {
        clock.advance(64);
        await pumpFrames(1);
      }
      expect(currentColorStore.getState().color).not.toEqual(before);
      // Still mid-travel: the strip has NOT re-anchored to the center row.
      expect(wheel.getAttribute("data-scroll-pos")).not.toBe(
        String(Math.round(centeredPos(CENTER))),
      );

      for (let i = 0; i < 40; i++) {
        clock.advance(64);
        await pumpFrames(2);
      }

      // Rest: re-indexed — the landed Name is the new center entry, the wheel
      // rests exactly at the center-row position, and the needle row (the
      // Current Color's row) is the selected one.
      expect(wheel.getAttribute("data-scroll-pos")).toBe(
        String(Math.round(centeredPos(CENTER))),
      );
      const selected = wheel.querySelector(
        '[aria-selected="true"]',
      ) as HTMLElement;
      expect(selected.getAttribute("data-index")).toBe(String(CENTER));
      expect(screen.getByTestId("hex-input")).toHaveValue(
        srgbToHex({ ...currentColorStore.getState().color, a: 1 }),
      );
    } finally {
      clock.stop();
    }
  });

  it("pointerdown mid-spin stops the spin immediately (grabbing the wheel)", async () => {
    const clock = useMockClock();
    try {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      flickGesture(wheel, 210, 100, clock);
      // Let the spin run a few frames…
      clock.advance(150);
      await pumpFrames(2);
      const midSpinPos = wheel.getAttribute("data-scroll-pos");
      const midSpinColor = currentColorStore.getState().color;
      // …then grab it.
      fireEvent.pointerDown(wheel, { clientY: 100 });
      for (let i = 0; i < 12; i++) {
        clock.advance(150);
        await pumpFrames(2);
      }

      // No further travel: the grab killed the spin. The live color freezes
      // WITH it — the grabbed needle row's color simply stays current
      // (ticket 23: travel dispatches live, so the pre-grab frames changed
      // the color away from the starting one).
      expect(wheel.getAttribute("data-scroll-pos")).toBe(midSpinPos);
      expect(currentColorStore.getState().color).toEqual(midSpinColor);
    } finally {
      clock.stop();
    }
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
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");
      const before = currentColorStore.getState().color;

      // A fast flick (110px upward, tight trail → high release velocity)…
      flickGesture(wheel, 210, 100, clock, { stepMs: 8, steps: 4 });

      // …has ALREADY center-snapped and selected, without any animation
      // wait. The selection re-indexes the list, so the wheel rests at
      // centeredPos(CENTER) with the landed name pinned at the needle.
      expect(wheel.getAttribute("data-scroll-pos")).toBe(
        String(Math.round(centeredPos(CENTER))),
      );
      // The landed Name is the one that sat under the needle at release:
      // drag of 110px ≈ 2.5 rows → the old list's row CENTER+3
      // (Math.round(2.5) = 3 rows below the center).
      const expected = nearestNamesChain(before, 150)[CENTER + 3];
      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });
    } finally {
      clock.stop();
      vi.unstubAllGlobals();
    }
  });

  it("a slow release (below flick threshold) aligns to the nearest row and its color is current (ticket 23)", async () => {
    const clock = useMockClock();
    try {
      render(<App />);
      const wheel = screen.getByTestId("name-wheel");

      // A deliberate 24px upward drag over 120ms → release velocity ≈ 0.13px/ms,
      // below FLICK_MIN_VELOCITY: browsing, not a spin. The wheel offset is
      // inverted Y, so the needle ends on row CENTER+1 (24px ≈ 0.55 rows).
      flickGesture(wheel, 180, 156, clock, { stepMs: 30, steps: 4 });
      for (let i = 0; i < 6; i++) {
        clock.advance(100);
        await pumpFrames(2);
      }

      // Wheel aligned to a row center; browsing is live, so the settled
      // needle row's color IS the Current Color (no explicit selection
      // happened — the color changed during the drag/snap, not on selection).
      const settled = Number(wheel.getAttribute("data-scroll-pos"));
      expect((settled - centeredPos(CENTER)) % ROW_HEIGHT).toBe(0);
      const expected = nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 1];
      expect(currentColorStore.getState().color).toEqual({
        r: expected.srgb.r,
        g: expected.srgb.g,
        b: expected.srgb.b,
      });
    } finally {
      clock.stop();
    }
  });

  it("a zero-velocity release (plain click gesture) still selects the pressed row", () => {
    render(<App />);

    const wheel = screen.getByTestId("name-wheel");
    const row = wheel.querySelector(
      `[data-index="${CENTER + 4}"]`,
    ) as HTMLElement;
    fireEvent.pointerDown(wheel, { clientY: 100 });
    fireEvent.pointerUp(wheel, { clientY: 100 });
    fireEvent.click(row);

    const expected =
      nearestNamesChain(STARTING_COLOR_SRGB, 150)[CENTER + 4];
    expect(currentColorStore.getState().color).toEqual({
      r: expected.srgb.r,
      g: expected.srgb.g,
      b: expected.srgb.b,
    });
  });
});

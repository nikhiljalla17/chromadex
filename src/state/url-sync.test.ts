import { describe, expect, it, vi } from "vitest";

import { createCurrentColorStore, STARTING_COLOR_SRGB } from "./current-color-store";
import { startUrlSync } from "./url-sync";

/** Deterministic scheduler: queues callbacks, flush() runs them explicitly. */
function manualScheduler() {
  const pending: Array<() => void> = [];
  const scheduled = vi.fn();
  const schedule = vi.fn((callback: () => void) => {
    scheduled();
    pending.push(callback);
    return () => {
      const i = pending.indexOf(callback);
      if (i >= 0) pending.splice(i, 1);
    };
  });
  return {
    schedule,
    flush() {
      while (pending.length) pending.shift()!();
    },
    cancelAll() {
      pending.length = 0;
    },
    callCount: () => scheduled.mock.calls.length,
  };
}

describe("startUrlSync", () => {
  it("coalesces a burst of dispatches into one write of the final color", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);
    const timer = manualScheduler();
    const write = vi.fn();
    const stop = startUrlSync(store, timer.schedule, write);

    // A drag burst: three dispatches in one frame.
    store.dispatch({ type: "setFromSrgb", color: { r: 1, g: 0, b: 0 } });
    store.dispatch({ type: "setFromSrgb", color: { r: 0, g: 1, b: 0 } });
    store.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });

    // One frame scheduled despite three dispatches…
    expect(timer.callCount()).toBe(1);
    expect(write).not.toHaveBeenCalled();

    // …and it writes the *final* color once.
    timer.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("#0000ff");

    stop();
  });

  it("schedules a fresh frame after each flush — later dispatches are not lost", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);
    const timer = manualScheduler();
    const write = vi.fn();
    const stop = startUrlSync(store, timer.schedule, write);

    store.dispatch({ type: "setFromSrgb", color: { r: 1, g: 0, b: 0 } });
    timer.flush();
    store.dispatch({ type: "setFromSrgb", color: { r: 0, g: 1, b: 0 } });
    timer.flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("#00ff00");

    stop();
  });

  it("stop() cancels a pending flush", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);
    const timer = manualScheduler();
    const write = vi.fn();
    const stop = startUrlSync(store, timer.schedule, write);

    store.dispatch({ type: "setFromSrgb", color: { r: 1, g: 0, b: 0 } });
    stop();
    timer.flush();

    expect(write).not.toHaveBeenCalled();
  });
});

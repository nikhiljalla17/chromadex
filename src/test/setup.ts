import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver; radix-ui primitives (Tooltip) require it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
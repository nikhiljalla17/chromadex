/**
 * Tooltip wiring tests (ticket 14): tooltips open on keyboard focus, close on
 * blur and Escape, and leave normal slider behavior untouched. Hover-open is
 * radix's own path (controlled onOpenChange); jsdom tests drive the
 * deterministic focus/Escape seams — see channel-slider.tsx's controlled-open
 * note for why hover timers are not exercised here.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChannelSlider } from "./channel-slider";

afterEach(cleanup);

function renderHue() {
  return render(
    <ChannelSlider
      id="test-h"
      label="H"
      ariaLabel="Hue"
      tooltip="Hue — which color on the hue circle (red → green → blue), measured in degrees."
      min={0}
      max={360}
      value={144}
      format={(v) => `${v}°`}
      onChange={() => {}}
      testId="test-h"
    />
  );
}

describe("ChannelSlider tooltip wiring", () => {
  it("renders the label as a tooltip trigger without changing the accessible name", () => {
    renderHue();

    expect(screen.getByTestId("test-h")).toHaveAccessibleName("Hue");
    expect(screen.getByText("H")).toBeInTheDocument();
    // Closed by default: no content in the tree.
    expect(screen.queryByTestId("test-h-tooltip")).not.toBeInTheDocument();
  });

  it("opens on input focus and closes on blur", () => {
    renderHue();

    fireEvent.focus(screen.getByTestId("test-h"));
    expect(
      screen.getByTestId("test-h-tooltip").textContent
    ).toContain("Hue — which color on the hue circle");

    fireEvent.blur(screen.getByTestId("test-h"));
    expect(screen.queryByTestId("test-h-tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape while open", () => {
    renderHue();

    const input = screen.getByTestId("test-h");
    fireEvent.focus(input);
    expect(screen.getByTestId("test-h-tooltip")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("test-h-tooltip")).not.toBeInTheDocument();
  });

  it("does not break arrow-key nudging while a tooltip is wired", () => {
    let last = -1;
    render(
      <ChannelSlider
        id="test-h"
        label="H"
        ariaLabel="Hue"
        tooltip="Hue definition"
        min={0}
        max={360}
        value={144}
        format={(v) => `${v}°`}
        onChange={(next) => {
          last = next;
        }}
        testId="test-h"
      />
    );

    const input = screen.getByTestId("test-h");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowRight", shiftKey: true });
    expect(last).toBe(154);
  });

  it("renders no tooltip machinery when no tooltip is given", () => {
    render(
      <ChannelSlider
        id="test-r"
        label="R"
        ariaLabel="Red channel"
        min={0}
        max={255}
        value={255}
        format={(v) => `${v}`}
        onChange={() => {}}
        testId="test-r"
      />
    );

    // Plain label stays plain (no tooltip spam criterion) — and, ticket 17,
    // without a tooltip the label must NOT carry cursor-help (the help cursor
    // with nothing behind it read as a phantom '?').
    fireEvent.focus(screen.getByTestId("test-r"));
    expect(screen.queryByTestId("test-r-tooltip")).not.toBeInTheDocument();
    expect(screen.getByText("R")).not.toHaveClass("cursor-help");
  });
});

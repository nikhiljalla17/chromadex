/**
 * Eyedropper tests (ticket 10). jsdom cannot decode images or rasterize
 * canvas, so every test drives the two documented seams:
 *  - `loadImage`: a fake that resolves a LoadedImage with a no-op draw
 *    (the component's real loader is DOM-only).
 *  - `makePixelReader`: a deterministic reader returning a known color
 *    grid, so click-to-sample and loupe assertions never touch canvas.
 *
 * File-picker and paste paths are exercised through real DOM events with
 * File objects; only the decode+read internals are faked.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentColorStore } from "../../state/store";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";
import { Eyedropper } from "./Eyedropper";
import type { LoadedImage, PixelReader, Rgb8 } from "./image-sample";

function resetColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

const KNOWN: Rgb8 = { r: 18, g: 52, b: 86 }; // 0x123456

/** Fake image: 8×6, no-op draw (jsdom canvas stays blank; reader is faked). */
function fakeImage(name = "pic.png"): LoadedImage {
  return { name, width: 8, height: 6, draw: () => undefined };
}

/** Deterministic reader: every in-bounds read returns the known color. */
function knownReader(): PixelReader {
  return (x, y, half) => {
    if (x < 0 || y < 0) return null;
    const size = 2 * half + 1;
    return Array.from({ length: size * size }, () => ({ ...KNOWN }));
  };
}

function imageFile(name = "pic.png", type = "image/png"): File {
  return new File(["fake"], name, { type });
}

describe("Eyedropper", () => {
  beforeEach(resetColor);

  it("renders the empty state with browse button", () => {
    render(<Eyedropper />);
    expect(screen.getByTestId("eyedropper-browse")).toBeInTheDocument();
    expect(screen.queryByTestId("eyedropper-canvas")).not.toBeInTheDocument();
  });

  it("loads via the file picker and shows the caption", async () => {
    const loadImage = vi.fn(async () => fakeImage("uploaded.png"));
    render(<Eyedropper loadImage={loadImage} />);

    const input = screen.getByTestId("eyedropper-file-input");
    await userEvent.upload(input, imageFile("uploaded.png"));

    await screen.findByTestId("eyedropper-canvas");
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent(
      "uploaded.png · 8×6",
    );
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it("file-picking a non-image is ignored", async () => {
    const loadImage = vi.fn(async () => fakeImage());
    render(<Eyedropper loadImage={loadImage} />);

    const input = screen.getByTestId("eyedropper-file-input");
    await userEvent.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));

    await act(async () => {});
    expect(screen.queryByTestId("eyedropper-canvas")).not.toBeInTheDocument();
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("loads via drag-and-drop and toggles the drag-over state", async () => {
    render(<Eyedropper loadImage={vi.fn(async () => fakeImage("dropped.jpg"))} />);
    const zone = screen.getByTestId("eyedropper");

    fireEvent.dragEnter(zone);
    expect(zone.className).toContain("border-primary");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-primary");

    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile("dropped.jpg", "image/jpeg")] },
    });
    await screen.findByTestId("eyedropper-canvas");
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("dropped.jpg");
  });

  it("ignores non-image drops without breaking", async () => {
    const loadImage = vi.fn(async () => fakeImage());
    render(<Eyedropper loadImage={loadImage} />);
    const zone = screen.getByTestId("eyedropper");

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] },
    });
    await act(async () => {});
    expect(loadImage).not.toHaveBeenCalled();
    expect(screen.queryByTestId("eyedropper-canvas")).not.toBeInTheDocument();
  });

  it("rapid re-uploads: only the latest decode wins (concurrency guard)", async () => {
    // Two decodes racing: slow first, fast second. The first must never
    // clobber the second when it finally resolves (seq-guard semantics).
    let resolveSlow!: (image: LoadedImage) => void;
    const slow = new Promise<LoadedImage>((resolve) => {
      resolveSlow = resolve;
    });
    const loadImage = vi
      .fn<(file: File) => Promise<LoadedImage | null>>()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(fakeImage("fast.png"));

    render(<Eyedropper loadImage={loadImage} />);
    const input = screen.getByTestId("eyedropper-file-input");

    await userEvent.upload(input, imageFile("slow.png"));
    await userEvent.upload(input, imageFile("fast.png"));

    // The fast decode lands first…
    await screen.findByTestId("eyedropper-canvas");
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("fast.png");

    // …then the slow one resolves — and must be discarded.
    await act(async () => {
      resolveSlow(fakeImage("slow.png"));
      await slow;
    });
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("fast.png");
  });

  it("loads via clipboard paste of an image file", async () => {
    render(<Eyedropper loadImage={vi.fn(async () => fakeImage("pasted.png"))} />);

    const file = imageFile("pasted.png");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    // jsdom has no DataTransfer constructor for clipboardData; stub minimally.
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      },
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent);
    });

    await screen.findByTestId("eyedropper-canvas");
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("pasted.png");
  });

  it("paste without an image is ignored", async () => {
    const loadImage = vi.fn(async () => fakeImage());
    render(<Eyedropper loadImage={loadImage} />);

    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
      },
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent);
    });

    expect(loadImage).not.toHaveBeenCalled();
  });

  it("clicking the canvas samples the pixel and sets the Current Color", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    await screen.findByTestId("eyedropper-canvas");

    const canvas = screen.getByTestId("eyedropper-canvas");
    // jsdom getBoundingClientRect is zero-sized; eventToCanvasPoint divides by
    // max(w,1) and floors — clientX 0.5 lands on canvas pixel (0, 0).
    fireEvent.pointerDown(canvas, { clientX: 0.5, clientY: 0.5 });

    expect(currentColorStore.getState().color).toEqual({
      r: KNOWN.r / 255,
      g: KNOWN.g / 255,
      b: KNOWN.b / 255,
    });
  });

  it("keyboard sampling: arrows move the sample point, Enter samples it", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    const canvas = screen.getByTestId("eyedropper-canvas");
    await screen.findByTestId("eyedropper-canvas");

    // The canvas is focusable with role img (a11y contract).
    expect(canvas).toHaveAttribute("tabindex", "0");
    expect(canvas).toHaveAttribute("role", "img");

    // No hover yet: Enter samples the image center — every read is the
    // known color, so the Current Color changes either way.
    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(currentColorStore.getState().color).toEqual({
      r: KNOWN.r / 255,
      g: KNOWN.g / 255,
      b: KNOWN.b / 255,
    });

    // Arrow keys move the sample point (the hover/loupe state); unhandled
    // keys fall through without breaking.
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    fireEvent.keyDown(canvas, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(canvas, { key: "Tab" });
    expect(canvas.getAttribute("aria-label")).toContain("arrow keys");
  });

  it("a live marker tracks the hovered pixel on the image (ticket 18)", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    await screen.findByTestId("eyedropper-canvas");

    // No pointer on the image yet: no marker.
    expect(screen.queryByTestId("eyedropper-marker")).not.toBeInTheDocument();

    const canvas = screen.getByTestId("eyedropper-canvas");
    fireEvent.pointerMove(canvas, { clientX: 0.5, clientY: 0.5 });

    // Marker appears at the hovered pixel and is inert.
    const marker = screen.getByTestId("eyedropper-marker");
    expect(marker).toBeInTheDocument();
    expect(marker.className).toContain("pointer-events-none");
    expect(marker.style.transform).toContain("translate");

    // Leaving the image hides it.
    fireEvent.pointerLeave(canvas);
    expect(screen.queryByTestId("eyedropper-marker")).not.toBeInTheDocument();
  });

  it("sampling flashes a confirmation pulse at the sampled point (ticket 18)", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    await screen.findByTestId("eyedropper-canvas");

    const canvas = screen.getByTestId("eyedropper-canvas");
    fireEvent.pointerDown(canvas, { clientX: 0.5, clientY: 0.5 });

    // Pulse visible right after the sample…
    expect(screen.getByTestId("eyedropper-pulse")).toBeInTheDocument();

    // …and gone after the 600ms flash window (real timers — fake timers
    // wedged the suite's polling seams in a previous attempt).
    await waitFor(
      () => expect(screen.queryByTestId("eyedropper-pulse")).not.toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it("hovering shows the magnified loupe with the crosshair pixel", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    const canvas = await screen.findByTestId("eyedropper-canvas");

    fireEvent.pointerMove(canvas, { clientX: 0.5, clientY: 0.5 });
    const loupe = screen.getByTestId("eyedropper-loupe");
    expect(loupe.children).toHaveLength(9 * 9);
    // The crosshair cell paints the known color. Center of the 9×9 grid is
    // linear index 40 (row 4, col 4) — ticket 18 fixed the outline/title
    // pointing two rows high (index 20).
    expect((loupe.children[4 * 9 + 4] as HTMLElement).style.backgroundColor).toBe(
      "rgb(18, 52, 86)",
    );
    // Ticket 18: the selected cell is unmistakable — 2px outline + inset rims
    // (visible over any fill color), unlike the old 1px whisper. jsdom does
    // not reflect the `outline` shorthand on .style, so assert the inline
    // style attribute (the only jsdom-visible seam for these declarations).
    const crosshair = loupe.children[4 * 9 + 4] as HTMLElement;
    expect(crosshair.getAttribute("style")).toContain("outline: 2px solid");
    expect(crosshair.getAttribute("style")).toContain("box-shadow");
    // …and exactly one cell carries the selection treatment.
    const marked = Array.from(loupe.children).filter((cell) =>
      (cell as HTMLElement).getAttribute("style")?.includes("outline: 2px solid"),
    );
    expect(marked).toHaveLength(1);
    expect(Array.from(loupe.children).indexOf(marked[0])).toBe(4 * 9 + 4);
  });

  it("clear resets to the empty state without changing the Current Color", async () => {
    render(
      <Eyedropper
        loadImage={vi.fn(async () => fakeImage())}
        makePixelReader={knownReader}
      />,
    );
    await userEvent.upload(screen.getByTestId("eyedropper-file-input"), imageFile());
    const canvas = await screen.findByTestId("eyedropper-canvas");
    fireEvent.pointerDown(canvas, { clientX: 0.5, clientY: 0.5 });
    expect(currentColorStore.getState().color).toEqual({
      r: KNOWN.r / 255,
      g: KNOWN.g / 255,
      b: KNOWN.b / 255,
    });

    fireEvent.click(screen.getByTestId("eyedropper-clear"));
    expect(screen.queryByTestId("eyedropper-canvas")).not.toBeInTheDocument();
    // Clearing the tool must not touch the Current Color.
    expect(currentColorStore.getState().color).toEqual({
      r: KNOWN.r / 255,
      g: KNOWN.g / 255,
      b: KNOWN.b / 255,
    });
  });

  it("re-upload replaces the image", async () => {
    const loadImage = vi
      .fn()
      .mockResolvedValueOnce(fakeImage("one.png"))
      .mockResolvedValueOnce(fakeImage("two.png"));
    render(<Eyedropper loadImage={loadImage} />);
    const input = screen.getByTestId("eyedropper-file-input");

    await userEvent.upload(input, imageFile("one.png"));
    await screen.findByTestId("eyedropper-canvas");
    await userEvent.upload(input, imageFile("two.png"));
    await waitFor(() =>
      expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("two.png"),
    );
  });

  it("drop area opens the file picker on Enter/Space", async () => {
    render(<Eyedropper />);
    const zone = screen.getByTestId("eyedropper");
    const input = screen.getByTestId("eyedropper-file-input");
    const clickSpy = vi.spyOn(input, "click");
    zone.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("a failed decode keeps the previous image and state sane", async () => {
    const loadImage = vi
      .fn()
      .mockResolvedValueOnce(fakeImage("good.png"))
      .mockResolvedValueOnce(null); // decode failure
    render(<Eyedropper loadImage={loadImage} />);
    const input = screen.getByTestId("eyedropper-file-input");

    await userEvent.upload(input, imageFile("good.png"));
    await screen.findByTestId("eyedropper-canvas");

    await userEvent.upload(input, imageFile("bad.png"));
    await act(async () => {});
    // Previous image stays; no crash, no empty limbo.
    expect(screen.getByTestId("eyedropper-caption")).toHaveTextContent("good.png");
  });
});

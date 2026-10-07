import { Eyedropper } from "./components/eyedropper/Eyedropper";
import { HexDriver } from "./components/drivers/HexDriver";
import { InfoPanel } from "./components/info-panel/InfoPanel";
import { RgbDriver } from "./components/drivers/RgbDriver";
import { HslDriver } from "./components/drivers/HslDriver";
import { GamutMap } from "./components/gamut/GamutMap";
import { GamutMapInfo } from "./components/gamut/GamutMapInfo";
import { LuminanceSlider } from "./components/gamut/LuminanceSlider";
import { NameWheel } from "./components/name-wheel/NameWheel";
import { NameWheelInfo } from "./components/name-wheel/NameWheelInfo";
import { chromaticityOf } from "./lib/color";
import { currentColorStore, useCurrentColor } from "./state/store";

function App() {
  // The Current Color is the store's single mutable state; the swatch is a pure view of it.
  const currentColor = useCurrentColor().color;
  const chroma = chromaticityOf(currentColor);
  const swatchColor = `rgb(${Math.round(currentColor.r * 255)} ${Math.round(
    currentColor.g * 255,
  )} ${Math.round(currentColor.b * 255)})`;

  return (
    <div className="flex h-dvh">
      {/* Left column: header + the map/center workspace. The wheel rail sits
          OUTSIDE this column so it spans the full viewport height (ticket 16:
          the rolodex fills the entire height of the page, edge to edge). */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <header className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">chromadex</h1>
          <span className="text-xs text-muted-foreground">
            explore color values, find human-friendly names
          </span>
          <a
            href="https://github.com/nikhiljalla17/chromadex"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="github-link"
            className="ml-auto text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            GitHub
          </a>
        </header>

        <main className="flex min-h-0 flex-1 gap-3">
          {/* Left pane: Gamut Map + luminance slider (ticket 05). Co-equal
              third (round-2 rebalance: the owner wants roughly equal capture
              across the three panes, with the center knob panel the main
              interactive area). */}
          <section
            aria-label="Gamut Map"
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            <GamutMapInfo />
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <GamutMap chroma={chroma} />
            </div>
            <LuminanceSlider chroma={chroma} />
          </section>

          {/* Center pane: Current Color swatch + Drivers — the instrument panel,
              and per the owner the main interactive portion: co-equal flex
              third (min width keeps sliders usable; max keeps cards sane on
              wide monitors). */}
          <section
            aria-label="Controls"
            className="flex min-w-72 max-w-md flex-1 flex-col gap-2 min-h-0 overflow-y-auto"
          >
            <div
              data-testid="current-color-swatch"
              style={{ backgroundColor: swatchColor }}
              className="min-h-28 flex-1 rounded-lg border border-border shadow-inner ring-1 ring-inset ring-white/10"
              role="img"
              aria-label="Current Color swatch"
            />
            <HexDriver />
            <RgbDriver />
            <HslDriver />
            <InfoPanel />
            <Eyedropper />
          </section>
        </main>
      </div>

      {/* Right rail: the Name Wheel — full page height, full-bleed (no card
          rounding; a left border separates it from the workspace). Deliberately
          narrower than the flex thirds (round-2 rebalance, owner: the wheel
          pane was stealing 50% of the screen) — fixed width with the flex
          thirds sharing the rest; w-80 ≈ the pre-v2 width the owner liked. */}
      <section
        aria-label="Name Wheel"
        className="flex w-80 shrink-0 flex-col"
      >
        {/* Ticket 24a: the trivia affordance lives in a slim header row ABOVE
            the wheel container — never inside it — so the rail's scroll/drag/
            flick pointer paths stay untouched. */}
        <NameWheelInfo />
        <NameWheel />
      </section>
    </div>
  );
}

export { App, currentColorStore };
export default App;

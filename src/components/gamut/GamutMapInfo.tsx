import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/**
 * Ticket 20 + 24b: the Gamut Map explains itself — and now goes deep. A small
 * "?" info affordance on the pane's header row, unchanged as a target: it is
 * NOT an overlay on the map surface, so map dragging keeps an untouched
 * pointer path.
 *
 * Ticket 24b mechanism choice: the original hover/focus Tooltip folded into a
 * click-open Popover (no duplicated content). Rationale: the deep-dive carries
 * clickable further-reading links, and a plain Tooltip closes on pointer-leave
 * — links inside it are effectively unusable. The Popover's trigger is the
 * same "?" button (click), and Escape / outside click dismiss it. The popover
 * opens on click with no hover timers, so radix's own open/dismiss behavior is
 * deterministic (unlike the tooltip, no controlled-open convention needed).
 *
 * Copy aligns with CONTEXT.md vocabulary (Gamut Map, Cursor) and covers the
 * ticket's bullets: CIE 1931 chromaticity diagram from the 2° standard
 * observer; the spectral horseshoe (380–700 nm) closed by the line of
 * purples; the sRGB (IEC 61966-2-1, 1996, HP & Microsoft) triangle where
 * everything the Drivers express — and the Cursor — lives; the washed-out
 * regions as real, display-impossible colors rendered desaturated toward
 * white; the Cursor clamping at the triangle boundary.
 *
 * Further reading (ticket 24b, external, new tab): Wikipedia's CIE 1931 and
 * sRGB articles, Bruce Lindbloom's color math pages, and both meodai
 * datasets (color-names + colornames-oklab) — the wheel's own trivia
 * affordance (NameWheelInfo) cites the latter.
 */
export function GamutMapInfo() {
  return (
    <div
      className="flex items-center justify-between gap-2"
      data-testid="gamut-map-header"
    >
      <h2 className="text-xs text-muted-foreground">Gamut Map</h2>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="What is the Gamut Map?"
            aria-haspopup="dialog"
            className="flex size-5 items-center justify-center rounded-full border border-border text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/60"
          >
            ?
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 text-xs leading-relaxed"
          data-testid="gamut-map-info-popover"
        >
          <p>
            The horseshoe is the CIE 1931 chromaticity diagram — the map of
            every color human vision can distinguish. It comes from
            color-matching experiments: in 1931, researchers had observers
            mix red, green, and blue light to match every pure spectral
            color, viewing through only the central 2° of their vision — the
            eye&apos;s sweet spot, where the color-sensing cones are
            densest. Those averaged results became the “2° standard
            observer,” the model of human vision this whole diagram is built
            on. Its curved edge traces pure spectral light, wavelength by
            wavelength from 380 to 700&nbsp;nm; the straight edge closing it
            is the &ldquo;line of purples&rdquo; — colors no single wavelength
            can match, only mixtures.
          </p>
          <p className="mt-2">
            The shaded triangle is sRGB (IEC 61966-2-1, 1996, HP &amp;
            Microsoft): the slice of visible color a standard monitor can
            reproduce — everything the Drivers can express lives inside it, and
            the Cursor moves freely there. The washed-out regions outside it
            are real, visible colors no RGB display can produce, rendered
            desaturated toward white. The Cursor clamps at the triangle
            boundary — the wall you hit when dragging.
          </p>
          <p className="mt-2 text-muted-foreground">Further reading:</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://en.wikipedia.org/wiki/CIE_1931_color_space"
                target="_blank"
                rel="noopener noreferrer"
              >
                CIE 1931 color space — Wikipedia
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://en.wikipedia.org/wiki/SRGB"
                target="_blank"
                rel="noopener noreferrer"
              >
                sRGB — Wikipedia
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://brucelindbloom.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Bruce Lindbloom&apos;s color math pages
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://www.w3.org/Graphics/Color/sRGB"
                target="_blank"
                rel="noopener noreferrer"
              >
                The sRGB standard — W3C
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/meodai/color-names"
                target="_blank"
                rel="noopener noreferrer"
              >
                meodai/color-names (the 31,914-name dataset)
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/meodai/colornames-oklab"
                target="_blank"
                rel="noopener noreferrer"
              >
                meodai/colornames-oklab (the wheel&apos;s 4,444 names)
              </a>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

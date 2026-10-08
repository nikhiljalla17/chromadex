import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Ticket 24a: the Name Wheel explains its own names. The Gamut Map's "?"
 * idiom (GamutMapInfo), adapted to the rail: a slim header row mounted in
 * App's Name Wheel section ABOVE the wheel container — deliberately not a
 * floating overlay on the rail and not inside the NameWheel component, so
 * the wheel's pointer paths (scroll / drag / flick, all bound on the rail
 * container) are untouched. Trivia is short and link-free, so it uses the
 * ticket-14 controlled-open Tooltip (hover + focus trigger) rather than a
 * popover; the deep-dive popover idiom is reserved for link-bearing content
 * (GamutMapInfo, ticket 24b).
 *
 * Trivia voice, per the ticket's three bullets: the algorithmically-even
 * colornames-oklab list (blue-noise over OKLab, 4,444 names), the 2017
 * Google Spreadsheet lineage (meodai's crowd-sourced color-names, 31,914
 * names), and the AI-authored twist.
 */
export function NameWheelInfo({
  tapToggle = false,
  slim = false,
}: {
  /**
   * Mobile shell (ticket 36): tap the "?" to toggle the trivia open/closed.
   * Touch has no hover, so the desktop hover/focus idiom is replaced: the
   * controlled `open` is driven solely by taps (radix's onOpenChange is
   * disconnected, or a tap's own focus event would open it and the click
   * would immediately close it). Desktop call sites omit it and keep the
   * shipped hover/focus behavior byte-for-byte.
   */
  tapToggle?: boolean;
  /** Mobile shell (ticket 36): drop the desktop rail's border/indent chrome. */
  slim?: boolean;
} = {}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className={
        slim
          ? "flex items-center justify-between gap-2 px-2 py-1"
          : "flex items-center justify-between gap-2 border-l border-border px-3 py-2"
      }
      data-testid="name-wheel-header"
    >
      <h2
        className={
          "text-xs text-muted-foreground" + (slim ? " min-w-0 truncate" : "")
        }
      >
        Name Wheel — the color closest to your current color
      </h2>
      <Tooltip
        open={open}
        // tapToggle: taps drive open/close, but radix's dismissal requests
        // (Escape/outside-tap) must still close — ignoring onOpenChange
        // entirely left the trivia stuck open on mobile (reviewer finding 2,
        // ticket 36). Only radix's hover/focus OPEN requests are ignored.
        onOpenChange={
          tapToggle
            ? (next) => {
                if (!next) setOpen(false);
              }
            : setOpen
        }
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Where do these names come from?"
            onClick={tapToggle ? () => setOpen(!open) : undefined}
            className="flex size-5 items-center justify-center rounded-full border border-border text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/60"
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          className="max-w-72"
          data-testid="name-wheel-info-tooltip"
        >
          This is a catalog of 4,444 named colors, arranged so that every name
          covers its own even patch of color space — the positions were placed
          by algorithm (blue-noise sampling in OKLab), so there are no dense
          clusters and no empty gaps. The strip shows the Names nearest your
          Current Color: the center is the closest match, and moving in either
          direction walks away through progressively different colors.

          The catalog descends from a crowd-sourced collection started as a
          Google Spreadsheet in April 2017 — 31,914 names today — and the
          curated subset you&apos;re browsing was authored with AI assistance
          (Claude, from Anthropic), each name written with its color&apos;s
          coordinates in view.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

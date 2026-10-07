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
export function NameWheelInfo() {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="flex items-center justify-between gap-2 border-l border-border px-3 py-2"
      data-testid="name-wheel-header"
    >
      <h2 className="text-xs text-muted-foreground">Name Wheel</h2>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Where do these names come from?"
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

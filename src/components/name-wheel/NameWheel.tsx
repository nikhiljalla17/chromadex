/**
 * The Name Wheel: a vertically scrolling, two-way rolodex of the Names
 * nearest the Current Color (CONTEXT.md: Name Wheel), arranged by the
 * spatial-chain nearest-names engine (ticket 22): the Current Color's Name
 * (the global nearest, the "seed") sits at the CENTER index
 * `floor((count-1)/2)` under the needle, and stepping up or down both moves
 * away from the Current Color — each side is a greedy nearest-unvisited walk
 * from the seed's frontier, so consecutive rows are color-space neighbors and
 * the strip reads as one continuous gradient (the ticket-15 fold's V-shaped
 * distance profile is gone by design; see the engine's CHAIN MODE header).
 * The window grows on demand (ticket 19): approaching either end EXTENDS the
 * walk with new names from the dataset instead of clamping, so the strip is
 * effectively unbounded — depth persists across selections, and each
 * selection re-anchors the whole sequence around the new color.
 *
 * Architecture — state-driven virtual window, not native scrolling: the
 * scroll offset (`scrollPos`) is component state; the container is a
 * fixed-height window and rows are absolutely positioned inside a translated
 * spacer. Wheel deltas and pointer drags mutate `scrollPos` directly. This
 * keeps the wheel deterministic in jsdom (no layout/scroll APIs), makes the
 * swish a plain rAF tween of one number, and renders only the visible slice
 * plus overscan — never all 150 rows (and never the full 4,444-row dataset;
 * the list itself is already the nearest-names window).
 *
 * Two-way (spec): clicking a Name dispatches its exact sRGB into the store —
 * that Name becomes the Current Color and, being then the distance-0 match,
 * the new center index. Click vs scroll-drag: a pointer gesture that moves
 * more than the drag threshold suppresses the following click.
 *
 * Live linkage (ticket 23): browsing IS the color change. Every wheel-authored
 * offset motion — wheel delta, drag move, spin travel frame, keyboard browse —
 * dispatches the needle row's sRGB through `setFromSrgb`, so the swatch, hex
 * and knob Drivers, Gamut Map cursor, and URL all follow live. A cheap store
 * write per motion event needs no throttle (a state swap plus subscriber
 * notifications; URL sync is already rAF-coalesced).
 *
 * Authorship (the feedback-loop guard): a wheel-authored color change must NOT
 * take the external-change path (chain rebuild + swish re-center) — that would
 * rearrange the strip under a scrolling user and loop. Mechanism: two
 * hex-keyed stamps (`authoredChainKeyRef` for the render-phase chain memo,
 * `authoredEffectKeyRef` for the post-render colorKey effect), set together
 * immediately before every wheel-authored dispatch and consumed-or-discarded
 * by their respective consumers. A stamp is the EXPECTED colorKey, so the
 * check is self-validating (a boolean flag could go stale when a dispatch
 * does not change the colorKey — e.g. re-dispatching the row already under
 * the needle — and would then wrongly swallow a later external change). The
 * chain memo adopts the new key into the existing chain IN PLACE (rows
 * unchanged, no rebuild; row distances still read from the strip's original
 * anchor until the next genuine re-anchor) and the effect skips the swish AND
 * the keyboard browse-base reset. Both consumers unconditionally clear their
 * stamp on every run, so a stamp can never outlive the commit it belongs to.
 * Edge cases:
 *  - External change mid-browse/mid-spin: external wins and re-centers
 *    (unstamped dispatch → rebuild + swish), consistent with ticket 19's
 *    mid-spin ruling. An external change batched after a wheel dispatch in
 *    the same commit also wins: the stamp holds the wheel's key, the final
 *    colorKey is the external one, so the check misses and the external path
 *    runs.
 *  - Wheel-authored dispatch that does not change the colorKey (sub-row
 *    scroll, redundant snap dispatch): memo and effect never rerun; a leftover
 *    stamp only ever equals the CURRENT colorKey, and any later effect fire
 *    has a different key, so it cannot mask a future external change.
 *  - Explicit selections (click, Enter/Space, spin rest) are NOT authored:
 *    they re-anchor the chain around the selected color (rebuild) — see
 *    `selectLandedAndReindex` and `selectRow`.
 *
 * Swish re-center: the current Name is always the sequence's center entry
 * (restored by every rebuild), so re-centering means animating the offset back
 * to "center index under the needle" whenever the Current Color changes from
 * an EXTERNAL source (hex/knobs/horseshoe/eyedropper — ticket 23: wheel-
 * authored changes skip the swish, the strip stays anchored to the scroll) —
 * a smooth glide (rAF, ease-out), skipped instantly under
 * `prefers-reduced-motion`.
 *
 * Spin physics (ticket 09, live semantics per ticket 23): a pointer flick
 * (release velocity above FLICK_MIN_VELOCITY, estimated from the last ~100ms
 * of the drag trail) imparts momentum — exponential decay, v(t) = v0·e^(−t/τ)
 * with τ = SPIN_TAU_MS. Travel is a slot machine: every momentum frame
 * dispatches the needle row's color (wheel-authored — no rebuild, no swish).
 * When |v| decays below SNAP_VELOCITY the spin ends: a short center-snap tween
 * (≤ half a row) settles the needle on the nearest row — that row may differ
 * from the last travel row, so the snap dispatches it live too — and then
 * `selectLandedAndReindex` re-anchors: the landed color becomes the new chain
 * anchor (a rebuild, NOT authored — the rest state restores the "current Name
 * is the center entry" invariant) and the offset jumps to the new center in
 * the same commit, so the needle keeps showing the landed Name (a glide here
 * would read as the flick undoing itself — hence the instant path in the
 * colorKey effect). A slow drag release (below flick threshold) is browsing:
 * the drag already dispatched live; the ≤half-row snap dispatches the settled
 * row. Wheel deltas stay 1:1 with no momentum by choice. Grabbing
 * (pointerdown) cancels any spin or swish immediately — the grabbed needle
 * row's color simply stays current. Under `prefers-reduced-motion` there is
 * no momentum phase (live updates are state writes, not motion, so they apply
 * unchanged).
 *
 * Keyboard (a11y pass, ticket 12): the wheel root is focusable (tabIndex 0).
 * ArrowUp/ArrowDown browse one row; PageUp/PageDown five rows; Home/End jump
 * to the FIRST/LAST entry of the CURRENT strip (ARIA convention — index 0 is
 * the far end of the left radial side, count-1 the far end of the right; the
 * current Name lives at the center index, not at Home; approaching an end
 * expands the strip per ticket 19, so End at the cap = the deepest expanded
 * row) — each keypress LIVE-DISPATCHES the target row's color (wheel-authored)
 * and then aligns it under the needle with the same center-snap tween a slow
 * drag release uses (instant under reduced motion; the tween frames do not
 * re-dispatch — the color jumps to the target rather than sweeping intermediate
 * rows, so during the ~200ms tween the needle can briefly sit between the
 * previous and the current row). Enter/Space remain explicit jumps: they
 * select the row under the needle through the same re-anchoring path as
 * clicking (redundant color-wise after live browsing, but it re-centers the
 * strip around the needle row).
 *
 * ARIA contract (ticket 12, amended by ticket 23): the root is role="listbox"
 * with aria-activedescendant pointing at the row under the needle — the sound
 * pattern for a virtualized list. Rows are role="option"; aria-selected marks
 * the Current Color's row — during live browsing that is the needle row (the
 * strip stays anchored to the scroll, so the current Name is NOT the center
 * entry); after a rebuild (mount, external change, explicit selection) it is
 * the center entry. Both cases resolve by hex equality against the Current
 * Color, with the center entry as the fallback (the anchor Name is the nearest
 * match, not an exact hex match). The needle itself — the center-pin anchor —
 * is unchanged. With a virtualized window the needle row is always rendered,
 * so the activedescendant id always resolves.
 *
 * Axis parameterization (ticket 31): the SAME component renders the desktop
 * vertical rail (orientation="vertical", the default) and the mobile bottom
 * ticker (orientation="horizontal", mounted by MobileShell below 768px). The
 * offset model, momentum physics, velocity trail, expansion, authorship
 * stamps, settle semantics, and ARIA contract are genuinely shared — the
 * axis only chooses: the drag coordinate (clientY vs clientX), the chip axis
 * (top vs left), the pane size measured along the strip (height vs width),
 * and the chip pitch (ROW_HEIGHT vs the prototype-validated CHIP_PITCH).
 * One `pitch` and one `size` feed every formula below, so the math is
 * written once. Flick/drag sign conventions are identical on both axes:
 * the offset is inverted against the pointer coordinate (drag up / drag
 * left → later rows), so velocity estimation and spin travel need no fork.
 *
 * Ticker adaptations (ticket 31, prototype-validated semantics):
 *  - Needle: a vertical center line (the prototype's w-px inset-y line).
 *  - Chips: colored (hex fill + contrast ink), name-centered, at the
 *    prototype's 84px pitch; layout is a row, not a column.
 *  - Settle re-anchor: the prototype's "frozen-while-scrolling + 250ms
 *    settle". Frozen-while-scrolling is inherent here (the ticket-23
 *    authorship stamps never rebuild mid-gesture); the settle half is
 *    explicit — after input stops for SETTLE_MS, the strip re-anchors
 *    around the needle row (the same selectLandedAndReindex a spin rest
 *    uses), restoring the "current Name is the center entry" invariant.
 *    Horizontal mode only: the desktop rail keeps its existing
 *    scroll-anchored slow-release semantics.
 *  - Wheel deltas: deltaX drives the strip (trackpad / shift-wheel); a
 *    plain vertical wheel's deltaY is honored as a fallback so
 *    desktop-grade input still browses.
 *  - Keyboard: ArrowLeft/ArrowRight browse one chip (primary); ArrowUp/
 *    ArrowDown remain working aliases in both orientations (the strip is
 *    one-dimensional, so they reach the same rows). PageUp/PageDown,
 *    Home/End, Enter/Space are axis-independent.
 *  - ARIA: the listbox contract is kept as-is — listbox semantics are
 *    orientation-agnostic; `aria-orientation="horizontal"` advertises the
 *    reading order and aria-activedescendant/option work unchanged on
 *    chips. (Documented adaptation per ticket 31.)
 *
 * Testing hooks (jsdom has no layout): the wheel root carries
 * `data-scroll-pos` (current offset in px) and rows carry `data-index` /
 * `data-distance`; the offset that centers row i is
 * `i * pitch - (size - pitch) / 2` with `size` the measured pane extent
 * along the strip axis (FALLBACK_HEIGHT vertically, FALLBACK_WIDTH on the
 * horizontal ticker, in unmeasured environments).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  buildNamesChain,
  extendNamesChain,
  namesChainMatches,
  type NameMatch,
  type NamesChain,
} from "../../lib/color/names";
import { contrastInk, srgbToHex } from "../../lib/color/hex";
import { currentColorStore, useCurrentColor } from "../../state/store";
import { hexOf } from "../../state/current-color-store";
import { usePrefersReducedMotion } from "./prefers-reduced-motion";
import { defaultListSize } from "../../lib/color-names/names";

/** Names in the wheel (the nearest-n window over the bundled dataset). */
const WHEEL_SIZE = 150;

/**
 * Near-infinite strip (ticket 19, owner-chosen architecture: expanding rings).
 * Browsing past either end GROWS the chain sequence instead of clamping:
 * `EXPAND_CHUNK_PER_SIDE` rows are added per side per crossing — an
 * `extendNamesChain` call that CONTINUES each side's walk from its frontier
 * (no rebuild; ~2–6ms per chunk even at the full-dataset pool), so the strip
 * keeps extending and already-visible rows never rearrange.
 *
 * Cap semantics (ticket 22 re-measured against the colornames-oklab list —
 * 4,444 rows, blue-noise even over OKLab): a full `buildNamesChain` costs
 * ~1.4ms @ n=150, ~12–19ms @ n=1500, ~30–50ms @ n=4444 (medians, 15-run
 * scratch bench on the dev machine; the O(count·pool) walk dominates at
 * depth). At full-list depth the rebuild exceeds a 16ms frame — accepted per
 * ticket 22: a rebuild only happens when the Current Color changes while the
 * strip is already at that depth (re-anchor on selection), and only the
 * absolute end of the dataset pays it; depths ≤1500 stay within one frame.
 * Expansion never pays it (incremental extend). The cap still simply IS the
 * dataset: MAX_EXPANSIONS = 22 lets 150 + 22×200 = 4,550 ≥ 4,444 rows come
 * into existence, i.e. the whole bundled list is reachable. maybeExpand
 * clamps the final chunk to `defaultListSize()` (the engine returns the full
 * list once; the last expansion adds 94 rows, not 200) and no-ops once the
 * strip spans the dataset — cumulative depth is exactly dataset-bounded per
 * color anchor (each selection re-anchors and grants a fresh budget; but
 * since the dataset is finite, depth never exceeds it).
 */
const EXPAND_CHUNK_PER_SIDE = 100; // rows added to EACH side per crossing
// INVARIANT: WHEEL_SIZE, EXPAND_CHUNK_PER_SIDE, and the dataset size must all
// be EVEN — `addedRows = (newCount − liveCount) / 2` must stay integral, or
// the needle drifts by half a row (22px) with no error. 150/100/4444 are even
// by construction; keep any future change even.
const MAX_EXPANSIONS = 22; // max sequence: the full 4,444-row dataset
/** Rows from either end at which an expansion triggers. */
const EDGE_TRIGGER_ROWS = 12;

/** Row height in px; rows are absolutely positioned at multiples of this. */
const ROW_HEIGHT = 44;

/**
 * Chip pitch on the horizontal axis (ticket 31): the on-device-validated
 * prototype's 84px — an 80px chip + 4px gap. Both pitches feed the SAME
 * offset math through the per-instance `pitch` (see the axis note above).
 */
const CHIP_PITCH = 84;
/** Gap between chips inside the pitch (the prototype's gap-1). */
const CHIP_GAP = 4;

/** Rows rendered beyond the visible window on each side. */
const OVERSCAN = 6;

/** Swish animation duration (ms). */
const SWISH_MS = 280;

function clampPos(pos: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, pos));
}

/** Offset that puts row `index` under the center needle, clamped to the list. */
function centeredPos(
  index: number,
  size: number,
  pitch: number,
  count: number,
): number {
  const min = -(size - pitch) / 2;
  const max = (count - 1) * pitch - (size - pitch) / 2;
  return clampPos(index * pitch - (size - pitch) / 2, min, max);
}

/** Container height fallback when unmeasurable (jsdom, first paint). */
const FALLBACK_HEIGHT = 440;
/** Width fallback for the horizontal ticker (typical phone viewport). */
const FALLBACK_WIDTH = 390;

/** Pointer travel (px) beyond which a press is a drag, not a click. */
const DRAG_THRESHOLD = 5;

/** Pointer trail (ms) used for release-velocity estimation. */
const FLICK_TRAIL_MS = 100;
/** Release velocity (px/ms) at or above which a drag release is a flick. */
const FLICK_MIN_VELOCITY = 0.5;
/** Momentum decay time constant (ms) — v(t) = v0·e^(−t/τ). */
const SPIN_TAU_MS = 450;
/** |velocity| (px/ms) below which the spin ends and center-snaps. */
const SNAP_VELOCITY = 0.02;
/** Center-snap tween duration (ms) at spin end. */
const SNAP_MS = 200;
/** Rows per PageUp/PageDown keypress (keyboard browsing). */
const KEY_PAGE_ROWS = 5;
/** Settle window (ms) after input stops before the ticker re-anchors (ticket 31). */
const SETTLE_MS = 250;

/** The wheel's axis: a vertical rail (desktop) or a horizontal ticker (mobile). */
export type NameWheelOrientation = "vertical" | "horizontal";

export function NameWheel({
  orientation = "vertical",
}: {
  orientation?: NameWheelOrientation;
} = {}) {
  const horizontal = orientation === "horizontal";
  const state = useCurrentColor();
  const colorKey = hexOf(state);

  // Chain sequence (ticket 22): the Current Color's Name is the center entry
  // by construction; each side walks outward through color-space neighbors.
  // State-driven (ticket 19): a color change REBUILDS the chain at the
  // current depth (colorKey mismatch below); an expansion EXTENDS the cached
  // walk in place (no rebuild — the whole point of the chain engine, ticket
  // 22). The memo only materializes the rolodex sequence from the walk state.
  // Recomputes only when the Current Color changes OR the sequence grows
  // (see the bench note in the constants block).
  const [extraPerSide, setExtraPerSide] = useState(0);
  const chainRef = useRef<NamesChain | null>(null);

  // Authorship stamps + forced re-anchor request (ticket 23 — see the header's
  // "Authorship" and "Live linkage" notes). The stamps are hex keys set
  // together by `stampAuthored` right before a wheel-authored dispatch; the
  // chain memo consumes its stamp during render and the colorKey effect its
  // own after commit (render necessarily precedes the effect for the same
  // store change, so one shared stamp would be gone by effect time).
  // `forceReanchorRef` + `reanchorTick` implement the explicit-selection
  // re-anchor when the dispatched color is ALREADY current (live travel or
  // keyboard browsing dispatched it first): the colorKey-keyed memo would
  // otherwise see no change and skip the rebuild that puts the selected Name
  // at the center entry.
  const authoredChainKeyRef = useRef<string | null>(null);
  const authoredEffectKeyRef = useRef<string | null>(null);
  const forceReanchorRef = useRef(false);
  const [reanchorTick, setReanchorTick] = useState(0);

  const matchesCacheRef = useRef<NameMatch[] | null>(null);
  const matches = useMemo(() => {
    const target = WHEEL_SIZE + extraPerSide * 2;
    let chain = chainRef.current;
    const authoredKey = authoredChainKeyRef.current;
    authoredChainKeyRef.current = null; // consume-or-discard on EVERY run
    let rowsChanged = true;
    if (chain === null || forceReanchorRef.current) {
      forceReanchorRef.current = false;
      chain = buildNamesChain(state.color, target);
    } else if (
      authoredKey !== null &&
      authoredKey === colorKey &&
      chain.colorKey !== colorKey
    ) {
      // Wheel-authored color change (ticket 23): the needle row IS the Current
      // Color now — keep the strip anchored to the scroll. Adopt the new key
      // into the existing chain IN PLACE (rows and distances unchanged — no
      // rebuild, no re-anchor); a later expansion still extends this chain and
      // a later external change still rebuilds. A same-key dispatch (chain
      // already adopted) falls through to the extend/no-op branches below.
      chain.colorKey = colorKey;
      if (chain.count < target) chain = extendNamesChain(chain, target);
      else rowsChanged = false;
    } else if (chain.colorKey !== colorKey) {
      chain = buildNamesChain(state.color, target);
    } else if (chain.count < target) {
      chain = extendNamesChain(chain, target);
    } else {
      rowsChanged = false;
    }
    chainRef.current = chain;
    // The adopt/no-op paths leave every row identical — replay the cached
    // materialization instead of rebuilding ~150–4,444 objects per live frame
    // (per-frame dispatches make the memo hot; ticket 23).
    if (!rowsChanged && matchesCacheRef.current) return matchesCacheRef.current;
    const next = namesChainMatches(chain);
    matchesCacheRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey, extraPerSide, reanchorTick]);

  const reduced = usePrefersReducedMotion();

  // Pane measurement (GamutMap stage idiom; jsdom → fallback). Both extents
  // are measured; the axis picks which one drives the offset math (`size`).
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0)
        setMeasured({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = measured?.height || FALLBACK_HEIGHT;
  const width = measured?.width || FALLBACK_WIDTH;
  /** Pane extent along the strip axis: height on the rail, width on the ticker. */
  const size = horizontal ? width : height;
  /** Chip pitch along the strip axis: one constant feeds all offset math. */
  const pitch = horizontal ? CHIP_PITCH : ROW_HEIGHT;
  const count = matches.length;
  /** Index of the Current Color's Name — the center of the chain
   * sequence (the engine's convention: seed at floor((count-1)/2)). */
  const centerIndex = Math.floor((count - 1) / 2);
  const minPos = centeredPos(0, size, pitch, count);
  const maxPos = centeredPos(Math.max(count - 1, 0), size, pitch, count);

  // The scroll offset — a ref (animation writes at 60fps) mirrored into
  // state (rows re-derive from it).
  const scrollPosRef = useRef(minPos);
  const [scrollPos, setScrollPos] = useState(minPos);
  const rafRef = useRef<number | null>(null);
  /** Last keyboard browse target; null once any non-keyboard input moves the wheel. */
  const keyIndexRef = useRef<number | null>(null);
  /** Expansion bookkeeping (ticket 19): chunks added so far this color.
   * A ref so rAF closures read the live value; reset on color change. */
  const expansionsRef = useRef(0);
  /**
   * Pixel drift animations must apply on top of their stale baselines
   * (ticket 19): swish/snap tweens and pointer drags capture absolute
   * offsets when they start; if an expansion fires mid-flight, every
   * absolute index moves by the chunk, so those writers must add this
   * accumulator per frame or they clobber maybeExpand's offset
   * compensation. The spin loop and wheel deltas read the live ref instead
   * and are unaffected. Reset to 0 by every writer that establishes a fresh
   * true-coordinate baseline (swishTo/snapTo/startSpin/onPointerDown).
   */
  const animShiftRef = useRef(0);

  /**
   * Stamp + dispatch the wheel-authored color change (ticket 23): row `index`
   * becomes the Current Color without triggering the external-change path
   * (chain rebuild + swish). See the header's "Authorship" note for the stamp
   * mechanics and edge cases.
   */
  function stampAuthored(match: NameMatch) {
    // The stamp must equal the colorKey the store will derive from this
    // dispatch (hexOf → srgbToHex of the clamped sRGB) — not the dataset hex
    // — so the memo/effect checks are exact.
    const key = srgbToHex({ ...match.srgb, a: 1 });
    authoredChainKeyRef.current = key;
    authoredEffectKeyRef.current = key;
  }

  function dispatchAuthoredColor(index: number) {
    // Live mirror: rAF closures (spin/snap frames) may be older than the last
    // render, and an expansion can have shifted indices under them.
    const match: NameMatch | undefined = matchesRef.current[index];
    if (!match) return;
    stampAuthored(match);
    currentColorStore.dispatch({ type: "setFromSrgb", color: match.srgb });
  }

  /**
   * LIVE clamp bounds. setPos is the single offset funnel — including calls
   * from rAF closures created in earlier renders (spin/swish frames). Those
   * closures must clamp against the CURRENT geometry, not the bounds of the
   * render they were created in: an expansion mid-spin grows the bounds and
   * a stale closure would stall the wheel at the old end. Assigned at render
   * scope (latest-value ref, same pattern as scrollPosRef).
   */
  const boundsRef = useRef({ min: minPos, max: maxPos, count });
  boundsRef.current = { min: minPos, max: maxPos, count };

  /**
   * Near-infinite strip expansion (ticket 19). Called from setPos after every
   * offset mutation; when the needle is within EDGE_TRIGGER_ROWS of an end
   * and the cap allows, grows the sequence by EXPAND_CHUNK_PER_SIDE rows per
   * side. Growth is SYMMETRIC: the engine adds `addedRows` to each radial
   * side, so EVERY absolute index shifts by `addedRows` regardless of which
   * end triggered — the offset (and the keyboard base) must therefore shift
   * by the same amount UNCONDITIONALLY, or the needle would land on the
   * wrong names after a max-side crossing (the probe-confirmed bug: min-side
   * only compensation left max-side crossings needle-shifted by -100 rows).
   * Done synchronously (bounds + offset) so an in-flight drag/spin continues
   * seamlessly past the old end.
   */
  function maybeExpand(pos: number) {
    if (expansionsRef.current >= MAX_EXPANSIONS) return;
    const { min, max, count: liveCount } = boundsRef.current;
    // The final chunk is partial: the engine clamps n to the dataset (4,444
    // rows), so the last expansion adds fewer than EXPAND_CHUNK_PER_SIDE rows
    // per side (94 total). Once the strip spans the dataset, stop expanding.
    const newCount = Math.min(
      liveCount + EXPAND_CHUNK_PER_SIDE * 2,
      defaultListSize(),
    );
    if (newCount <= liveCount) return;
    const addedRows = (newCount - liveCount) / 2; // prepended on EACH side
    const edge = EDGE_TRIGGER_ROWS * pitch;
    const nearMax = max - pos <= edge;
    const nearMin = pos - min <= edge;
    if (!nearMax && !nearMin) return;
    expansionsRef.current += 1;
    // All absolute indices shift down by `addedRows` (the engine prepends on
    // each side): shift the offset (and the keyboard base) by the same
    // amount so the visible names stay under the needle, re-clamped to the
    // new geometry. In-flight animation baselines get the same drift via
    // animShiftRef, consumed per-frame by the stale-baseline writers. The
    // shift applies to the offset regardless of axis (ticket 31).
    const shift = addedRows * pitch;
    animShiftRef.current += shift;
    let nextPos = clampPos(
      pos + shift,
      min,
      centeredPos(newCount - 1, size, pitch, newCount),
    );
    if (keyIndexRef.current !== null) keyIndexRef.current += addedRows;
    // Live bounds for the new geometry (size unchanged; count grew).
    boundsRef.current = {
      min: min,
      max: centeredPos(newCount - 1, size, pitch, newCount),
      count: newCount,
    };
    scrollPosRef.current = nextPos;
    setScrollPos(nextPos);
    // Functional update: two expansions can fire within one render batch
    // (e.g. a tween crossing both trigger windows) — the closure value would
    // compound wrong.
    setExtraPerSide((extra) => extra + addedRows);
  }

  function setPos(next: number) {
    const b = boundsRef.current;
    const clamped = clampPos(next, b.min, b.max);
    scrollPosRef.current = clamped;
    setScrollPos(clamped);
    maybeExpand(clamped);
  }

  /** Stop any in-flight swish. */
  function stopSwish() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  /** Animate the offset to `target`; instant under reduced motion. */
  function swishTo(target: number) {
    stopSwish();
    animShiftRef.current = 0; // fresh true-coordinate baseline
    const from = scrollPosRef.current;
    if (reduced || Math.abs(target - from) < 0.5) {
      setPos(target);
      return;
    }
    const start = performance.now();
    // Progress is measured with performance.now() inside the step rather
    // than the rAF callback timestamp: jsdom's rAF clock does not share the
    // performance.now() timebase, and a mismatched timestamp yields negative
    // progress (overshoot past the clamp bounds).
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / SWISH_MS);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setPos(from + (target - from) * eased + animShiftRef.current);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
  }

  // Swish on external color changes (and on pane resize, which moves the
  // centering offset). First run: center instantly, no mount-time glide.
  // The fallback→measured height transition also re-centers instantly:
  // animating it would read as an ~80px glide on first paint (P2 from
  // ticket-08 review); genuine pane resizes keep the swish.
  // NOTE: `count` is deliberately NOT a dependency. An expansion (ticket 19)
  // grows the count without changing the color — the needle already keeps
  // its names because maybeExpand compensates the offset — and re-centering
  // here would glide the user back to the seed mid-exploration. The closure's
  // count is current whenever this effect actually fires (colorKey/size
  // change), since a re-render with the new count precedes it.
  const mountedRef = useRef(false);
  const hadMeasuredRef = useRef(measured !== null);
  // Track what drove the last effect fire: an effect run triggered by a pane
  // size (or reduced-motion) change
  // or reduced-motion change (not a colorKey change) must take the external
  // path even if a same-key authorship stamp is lingering — a same-key
  // authored dispatch does not re-run this effect, so a stamp surviving into
  // a resize-driven fire would nondeterministically suppress the resize
  // re-center (reviewer P2, ticket 23).
  const prevColorKeyRef = useRef(colorKey);
  useEffect(() => {
    const colorKeyChanged = prevColorKeyRef.current !== colorKey;
    prevColorKeyRef.current = colorKey;
    // Consume-or-discard the authorship stamp on EVERY run (ticket 23): a
    // stamp can only ever equal the colorKey of the commit it was set in, so
    // clearing it here can never mask a later external change.
    const authored = colorKeyChanged && authoredEffectKeyRef.current === colorKey;
    authoredEffectKeyRef.current = null;
    const target = centeredPos(centerIndex, size, pitch, count);
    const measurementArrived = measured !== null && !hadMeasuredRef.current;
    if (measured !== null) hadMeasuredRef.current = true;
    if (!mountedRef.current || measurementArrived) {
      mountedRef.current = true;
      setPos(target);
      return;
    }
    // Wheel-authored color change (ticket 23): the strip stays anchored to
    // the scroll — no swish (the needle row IS the Current Color's row), and
    // no keyboard browse-base reset (held-key repeats restart from the
    // intended row, which their own dispatches must not clobber).
    if (authored) return;
    // Mid-spin external color change (e.g. a hex edit while the wheel is
    // spinning): let the spin finish — it selects from the fresh list at
    // snap time and re-indexes; animating against the spin here would mean
    // two writers fighting over the offset.
    if (spinRafRef.current !== null) return;
    keyIndexRef.current = null;
    swishTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- count is live at fire time; see NOTE above
  }, [colorKey, size, reduced]);

  // Expansion budget resets per Current Color: every selection re-anchors the
  // sequence around the new color at the current depth (the strip size
  // persists — extraPerSide is NOT reset), so the expansion cap applies
  // per anchor and the journey stays effectively unbounded.
  useEffect(() => {
    expansionsRef.current = 0;
  }, [colorKey]);

  // Cancel any in-flight spin, swish, or settle on unmount.
  useEffect(
    () => () => {
      stopSwish();
      stopSpin();
      stopSettle();
    },
    [],
  );

  // --- Spin physics (ticket 09) ---

  // rAF handle for the momentum loop (separate from the swish tween's).
  const spinRafRef = useRef<number | null>(null);

  /** Stop any in-flight momentum spin (grabbing the wheel; no snap). */
  function stopSpin() {
    if (spinRafRef.current !== null) cancelAnimationFrame(spinRafRef.current);
    spinRafRef.current = null;
  }

  /**
   * Index of the row currently under the needle (nearest center). Live
   * geometry: an in-flight spin can expand the sequence mid-flight
   * (ticket 19), so closures must read the ref, not a captured render's
   * minPos/count.
   */
  function nearestIndexToNeedle(): number {
    const { min, count: liveCount } = boundsRef.current;
    return clampPos(
      Math.round((scrollPosRef.current - min) / pitch),
      0,
      Math.max(liveCount - 1, 0),
    );
  }

  /**
   * Select the landed Name and re-index instantly (explicit selection / spin
   * rest — ticket 23 semantics): the color was already dispatched live during
   * travel or keyboard browsing, so this dispatch is often a no-op — but the
   * re-anchor is not. The dispatch is deliberately NOT stamped authored: the
   * landed color becomes the new chain anchor (a rebuild restores the
   * "current Name is the center entry" invariant at rest), and when the
   * dispatched color is already current, `forceReanchorRef` + `reanchorTick`
   * force that rebuild through the colorKey-keyed memo. The offset must jump
   * to centeredPos(centerIndex) in the SAME commit — after the rebuild the
   * landed Name IS the center entry, and leaving the offset at
   * centeredPos(landed) would make the colorKey effect glide the wheel
   * through every row the spin just passed ("the flick undoing itself").
   * With both updates batched, the needle shows the same Name before and
   * after — one frame, no visible jump. (count is stable at WHEEL_SIZE, so
   * centerIndex is the same before and after the re-index.)
   */
  function selectLandedAndReindex(landed: number) {
    const match: NameMatch | undefined = matchesRef.current[landed];
    if (match) {
      currentColorStore.dispatch({ type: "setFromSrgb", color: match.srgb });
      forceReanchorRef.current = true;
      setReanchorTick((tick) => tick + 1);
    }
    keyIndexRef.current = null;
    // Re-index against LIVE geometry: mid-spin expansion can have grown the
    // sequence, so the new center entry's position differs from the stale
    // closure's count. setPos re-clamps against boundsRef (live).
    const liveCount = matchesRef.current.length;
    setPos(centeredPos(Math.floor((liveCount - 1) / 2), size, pitch, liveCount));
  }

  // matchesRef/matchesLenRef: live mirrors for rAF closures created in older
  // renders (spin/snap steps), same latest-value pattern as boundsRef.
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const matchesLenRef = useRef(matches.length);
  matchesLenRef.current = matches.length;

  // --- Ticker settle re-anchor (ticket 31) ---

  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel any pending settle re-anchor (new input grabbed the strip). */
  function stopSettle() {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }

  /**
   * Settle re-anchor (ticket 31, ported from the on-device prototype's
   * validated ticker: frozen-while-scrolling + 250ms settle). "Frozen while
   * scrolling" is inherent here — the ticket-23 authorship stamps keep the
   * strip anchored to the scroll for the whole gesture (no rebuild, no
   * re-anchor mid-gesture). The settle half is explicit: after input stops
   * for SETTLE_MS, re-anchor the chain around the needle row through the
   * same selectLandedAndReindex a spin rest uses, restoring the "current
   * Name is the center entry" rest invariant. Horizontal mode only — the
   * desktop rail keeps its scroll-anchored slow-release semantics.
   */
  function scheduleSettleReanchor() {
    if (!horizontal) return;
    stopSettle();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const index = nearestIndexToNeedle();
      const match = matchesRef.current[index];
      // Guard: only re-anchor if the browsing still owns the color — an
      // external change during the settle window must win (the colorKey
      // effect already swished to its center; re-anchoring around the stale
      // needle would override it).
      if (match && match.hex === hexOf(currentColorStore.getState())) {
        selectLandedAndReindex(index);
      }
    }, SETTLE_MS);
  }

  /**
   * Center-snap tween: glide ≤ half a row to `target`, then run `onDone`.
   * Cancelled by any stopSwish (grab) — the callback must not fire after a
   * cancel, or a grabbed spin would still dispatch.
   *
   * `live` (ticket 23): the tween is wheel-authored motion — dispatch the
   * needle row's color per frame and once more at rest, so the settled row is
   * current even when the snap crosses a row boundary (the ≤half-row snap can
   * land on a different row than the last travel/drag frame dispatched).
   */
  function snapTo(target: number, onDone?: () => void, live = false) {
    stopSwish();
    animShiftRef.current = 0; // fresh true-coordinate baseline
    const from = scrollPosRef.current;
    if (reduced || Math.abs(target - from) < 0.5) {
      setPos(target);
      if (live) dispatchAuthoredColor(nearestIndexToNeedle());
      onDone?.();
      return;
    }
    const start = performance.now();
    let done = false;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / SNAP_MS);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setPos(from + (target - from) * eased + animShiftRef.current);
      if (live) dispatchAuthoredColor(nearestIndexToNeedle());
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        if (!done) {
          done = true;
          onDone?.();
        }
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  /**
   * Momentum loop: exponential decay, v(t) = v0·e^(−t/τ), integrated per
   * frame (offset += v·dt; velocity rescaled by e^(−dt/τ) — the exact
   * closed form per step, no accumulated approximation). Total travel ≈
   * v0·τ, so a 2px/ms flick carries ~20 rows over ~2s — the Price-is-Right
   * feel. Every travel frame live-dispatches the needle row's color (ticket
   * 23 slot-machine semantics; wheel-authored — no rebuild, no swish). At
   * |v| < SNAP_VELOCITY the spin ends: a short center-snap tween (≤ half a
   * row) settles the needle on the nearest row (still dispatching live — the
   * snapped row may differ from the last travel row), and only then does
   * selectLandedAndReindex re-anchor the list around it.
   */
  function startSpin(velocity: number) {
    stopSwish();
    animShiftRef.current = 0; // fresh true-coordinate baseline (reads the live ref per frame)
    let last = performance.now();
    let v = velocity;
    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - last, 64); // tab-switch clamp
      last = now;
      const decay = Math.exp(-dt / SPIN_TAU_MS);
      // Exact closed-form per-step travel for v(t)=v0·e^(−t/τ):
      // Δx = v·τ·(1 − e^(−dt/τ)) (semi-implicit Euler would over-travel ~2%).
      setPos(scrollPosRef.current + v * (1 - decay) * SPIN_TAU_MS);
      v *= decay;
      // Live slot-machine dispatch (ticket 23): the needle row is the Current
      // Color for the duration of the travel.
      dispatchAuthoredColor(nearestIndexToNeedle());
      if (Math.abs(v) < SNAP_VELOCITY) {
        spinRafRef.current = null;
        const landed = nearestIndexToNeedle();
        // Live count: an expansion mid-spin can have grown the sequence, so
        // the landed row's centering must clamp against the new geometry.
        snapTo(
          centeredPos(landed, size, pitch, matchesLenRef.current),
          () => selectLandedAndReindex(landed),
          true,
        );
        return;
      }
      spinRafRef.current = requestAnimationFrame(step);
    };
    spinRafRef.current = requestAnimationFrame(step);
  }

  // --- Browsing: wheel deltas + pointer drag, both offset mutations ---

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    // Horizontal ticker (ticket 31): deltaX drives the strip (trackpad /
    // shift-wheel); a plain vertical mouse wheel's deltaY is honored as a
    // fallback so desktop-grade input still browses. Vertical rail: deltaY.
    const raw = horizontal && event.deltaX !== 0 ? event.deltaX : event.deltaY;
    // deltaMode 1 (line scrolling, e.g. Firefox) → px per line.
    const delta = event.deltaMode === 1 ? raw * pitch : raw;
    // Direct input wins: wheel deltas never gain momentum (a flick gesture is
    // momentum's only source) and they stop an in-flight spin dead. Reads the
    // live ref (true coordinates), so no animShift consumption needed.
    stopSpin();
    stopSwish();
    keyIndexRef.current = null;
    setPos(scrollPosRef.current + delta);
    // Live dispatch (ticket 23): the row under the needle is now the Current
    // Color — wheel-authored, so no rebuild/swish follows.
    dispatchAuthoredColor(nearestIndexToNeedle());
    scheduleSettleReanchor();
  }

  // Drag-to-scroll state (click-vs-drag discrimination + flick velocity).
  // `coord` is the pointer coordinate on the ACTIVE axis (clientY on the
  // vertical rail, clientX on the horizontal ticker, ticket 31) — the offset
  // is inverted against it identically on both axes, so every formula below
  // (drag delta, trail, release velocity) is written once.
  const dragStart = useRef<{ coord: number; pos: number; moved: boolean } | null>(null);
  // Recent (timestamp, coord) samples over the last FLICK_TRAIL_MS — a
  // longer window dilutes a fast flick with stale slow movement. Timestamps
  // come from performance.now() (not event.timeStamp): one timebase across
  // trail sampling and the spin loop, and deterministic under a test clock.
  const trailRef = useRef<Array<{ t: number; coord: number }>>([]);
  const suppressClickRef = useRef(false);
  const capturedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // NOTE: pointer capture is set LAZILY in onPointerMove, once the drag
    // threshold is crossed — NOT here. Capturing on pointerdown retargets the
    // browser's post-release `click` event to this container (Pointer Lock/
    // Capture spec), so row onClick handlers would never fire and clicking a
    // name would do nothing in real browsers (jsdom tests bypass capture
    // retargeting, which is how this slipped past the suite — ticket 16 must
    // preserve this invariant).
    // Grabbing the wheel kills any spin/swish/settle immediately; the drag
    // resumes from the current offset (start.pos = where the wheel is NOW).
    stopSpin();
    stopSwish();
    stopSettle();
    keyIndexRef.current = null;
    const now = performance.now();
    pointerIdRef.current = event.pointerId;
    capturedRef.current = false;
    animShiftRef.current = 0; // fresh true-coordinate baseline for the drag
    const coord = horizontal ? event.clientX : event.clientY;
    dragStart.current = { coord, pos: scrollPosRef.current, moved: false };
    trailRef.current = [{ t: now, coord }];
    suppressClickRef.current = false;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const now = performance.now();
    const coord = horizontal ? event.clientX : event.clientY;
    trailRef.current.push({ t: now, coord });
    const cutoff = now - FLICK_TRAIL_MS;
    // Burst-robust retention (ticket 34): keep the newest out-of-window
    // sample as a dt anchor. Mobile touch delivery can coalesce a fast
    // flick's pointermoves into one late burst whose samples all share a
    // performance.now() read (the whole batch dispatches in one task).
    // Pruning purely by timestamp then collapses the retained window to a
    // single instant — dt = 0 at release → velocity 0 → the flick gate can
    // never pass → no momentum, exactly the on-device symptom. Keeping one
    // stale anchor guarantees dt > 0 whenever any movement was sampled.
    while (trailRef.current.length > 2 && trailRef.current[1].t < cutoff) {
      trailRef.current.shift();
    }
    const d = coord - start.coord;
    if (!start.moved && Math.abs(d) > DRAG_THRESHOLD) {
      start.moved = true;
      // Drag threshold crossed: NOW capture the pointer so the gesture keeps
      // receiving moves outside the container (and so the release `click` is
      // retargeted to us, where suppressClickRef handles it). A plain click
      // (no threshold crossing) never captures, so row onClick still fires.
      if (!capturedRef.current) {
        try {
          event.currentTarget.setPointerCapture(pointerIdRef.current!);
          capturedRef.current = true;
        } catch {
          // jsdom / no active pointer: drags still work inside the element.
        }
      }
    }
    if (start.moved) {
      stopSwish();
      // start.pos was captured in true coordinates at pointerdown; an
      // expansion since then shifted every index — apply the drift. The
      // offset is inverted against the pointer coordinate on BOTH axes
      // (drag up / drag left → later rows).
      setPos(start.pos - d + animShiftRef.current);
      // Live dispatch (ticket 23): dragging IS browsing — the needle row
      // becomes the Current Color per move event (wheel-authored).
      dispatchAuthoredColor(nearestIndexToNeedle());
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    // A drag suppresses the click that follows on the pressed row.
    if (start?.moved) suppressClickRef.current = true;
    dragStart.current = null;
    if (capturedRef.current && event.currentTarget.hasPointerCapture?.(pointerIdRef.current!)) {
      try {
        event.currentTarget.releasePointerCapture(pointerIdRef.current!);
      } catch {
        // already released by the browser on pointerup
      }
    }
    capturedRef.current = false;
    if (!start?.moved) return;

    // Release velocity from the trail (px/ms; the offset is inverted against
    // the pointer coordinate on both axes).
    const trail = trailRef.current;
    trail.push({ t: performance.now(), coord: horizontal ? event.clientX : event.clientY });
    const first = trail[0];
    const last = trail[trail.length - 1];
    const dt = last.t - first.t;
    const v = dt > 0 ? -(last.coord - first.coord) / dt : 0;
    trailRef.current = [];

    if (Math.abs(v) >= FLICK_MIN_VELOCITY) {
      if (reduced) {
        // Reduced motion: no momentum phase — the wheel stops where released
        // and center-snaps/selects INSTANTLY (same spin semantics, no motion).
        const landed = nearestIndexToNeedle();
        setPos(centeredPos(landed, size, pitch, count));
        selectLandedAndReindex(landed);
        return;
      }
      startSpin(v);
    } else {
      // Slow release: browsing, not a spin (a real flick is required). The
      // drag already dispatched live; the ≤half-row alignment snap may settle
      // on a neighboring row, so it dispatches live too (ticket 23).
      snapTo(centeredPos(nearestIndexToNeedle(), size, pitch, count), undefined, true);
      // Ticker settle (ticket 31): once input stops, re-anchor the strip
      // around the needle row (horizontal mode only — see the header).
      scheduleSettleReanchor();
    }
  }

  function selectRow(index: number) {
    if (suppressClickRef.current) return;
    const match: NameMatch | undefined = matches[index];
    if (!match) return;
    currentColorStore.dispatch({ type: "setFromSrgb", color: match.srgb });
  }

  /**
   * Keyboard contract (see header): arrows/page/home/end browse without
   * selecting; Enter/Space select the row under the needle. All handled keys
   * preventDefault so focus stays put and page scrolling doesn't hijack the
   * gesture.
   *
   * The browse base is `keyIndexRef` — the last keyboard target — not the
   * needle: each keypress restarts the snap tween, so a held/repeated key
   * must advance from the *intended* row (the needle lags the tween and
   * would otherwise pin browsing to one row per tween completion).
   */
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const needleIndex = nearestIndexToNeedle();
    // Horizontal ticker (ticket 31): ArrowLeft/ArrowRight are the primary
    // browse keys; they map onto the same -1/+1 steps as ArrowUp/ArrowDown,
    // which remain working aliases in BOTH orientations (the strip is one-
    // dimensional, so they reach the same rows). PageUp/PageDown, Home/End,
    // Enter/Space are axis-independent.
    const key =
      horizontal && event.key === "ArrowLeft"
        ? "ArrowUp"
        : horizontal && event.key === "ArrowRight"
          ? "ArrowDown"
          : event.key;
    let target: number | null = null;
    switch (key) {
      case "ArrowUp":
        target = (keyIndexRef.current ?? needleIndex) - 1;
        break;
      case "ArrowDown":
        target = (keyIndexRef.current ?? needleIndex) + 1;
        break;
      case "PageUp":
        target = (keyIndexRef.current ?? needleIndex) - KEY_PAGE_ROWS;
        break;
      case "PageDown":
        target = (keyIndexRef.current ?? needleIndex) + KEY_PAGE_ROWS;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = count - 1;
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        // Same-commit batching as the spin path (selectLandedAndReindex): the
        // landed Name becomes the new center entry and the offset jumps to its
        // center in the same commit, or the colorKey effect would glide the
        // wheel from the old offset to the new center ("flick
        // undoing itself", keyboard edition).
        selectLandedAndReindex(keyIndexRef.current ?? needleIndex);
        return;
      }
      default:
        return;
    }
    if (target === null || target < 0 || target > count - 1) return;
    event.preventDefault();
    stopSpin();
    keyIndexRef.current = target;
    // Live dispatch (ticket 23): the target row becomes the Current Color per
    // keypress — wheel-authored. The tween frames do NOT re-dispatch (the
    // color jumps to the target; it does not sweep intermediate rows).
    dispatchAuthoredColor(target);
    snapTo(centeredPos(target, size, pitch, count));
  }

  // Virtual window: only rows in [first, last] exist in the DOM.
  const first = Math.max(0, Math.floor(scrollPos / pitch) - OVERSCAN);
  const last = Math.min(count - 1, Math.ceil((scrollPos + size) / pitch) + OVERSCAN);
  // The activedescendant target: the row under the needle — always inside the
  // rendered window, so its id always resolves (ARIA contract in header).
  const activeIndex = nearestIndexToNeedle();
  // The Current Color's row (ticket 23): the needle row while the strip is
  // anchored to the scroll (live browsing — the dispatched needle row's hex
  // IS the Current Color's hex), the center entry after a rebuild (mount,
  // external change, explicit selection). Hex equality covers both; the
  // center entry is the fallback because the anchor Name is the nearest match,
  // not an exact hex match. (Dataset hexes are canonical lowercase #rrggbb,
  // the same form hexOf produces, so equality is exact.)
  const currentRow = matches.findIndex((match) => match.hex === colorKey);
  const currentRowIndex = currentRow === -1 ? centerIndex : currentRow;
  const rows: ReactNode[] = [];
  for (let i = first; i <= last; i++) {
    const match = matches[i];
    if (!match) continue;
    const isCurrent = i === currentRowIndex;
    // Chip geometry: vertical rows stack at multiples of ROW_HEIGHT; ticker
    // chips sit at multiples of CHIP_PITCH (prototype-validated 84px = an
    // 80px chip + 4px gap) and carry the hex fill + contrast ink of the
    // validated mock.
    const style = horizontal
      ? {
          left: i * pitch,
          width: pitch - CHIP_GAP,
          backgroundColor: match.hex,
          color: contrastInk(match.hex),
        }
      : { top: i * ROW_HEIGHT, height: ROW_HEIGHT };
    rows.push(
      <div
        key={match.name}
        id={`name-wheel-option-${i}`}
        role="option"
        data-testid="name-wheel-row"
        data-index={i}
        data-distance={match.distance.toFixed(2)}
        aria-selected={isCurrent}
        aria-label={match.name}
        onClick={() => selectRow(i)}
        style={style}
        className={
          "absolute flex rounded-md text-left transition-colors " +
          (horizontal
            ? "inset-y-0 flex-col items-center justify-center border border-border px-1"
            : "inset-x-0 items-center gap-2 px-3") +
          " " +
          (isCurrent
            ? horizontal
              ? "ring-2 ring-primary"
              : "bg-primary/15 ring-1 ring-primary/40"
            : "hover:bg-muted/60")
        }
      >
        {horizontal ? (
          // Ticker chip: the prototype mock's colored chip — name centered,
          // contrast ink (the hex fill IS the swatch). Distance stays in
          // data-distance / the option's accessible content.
          <span
            className={
              "max-w-full truncate " +
              (isCurrent ? "text-[10px] font-semibold" : "text-[9px]")
            }
          >
            {match.name}
          </span>
        ) : (
          <>
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded border border-border"
              style={{ backgroundColor: match.hex }}
            />
            <span
              className={
                "truncate " +
                (isCurrent ? "text-sm font-semibold" : "text-sm text-foreground/90")
              }
            >
              {match.name}
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {match.distance.toFixed(2)}
            </span>
          </>
        )}
      </div>,
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="name-wheel"
      data-scroll-pos={Math.round(scrollPos)}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={count > 0 ? `name-wheel-option-${activeIndex}` : undefined}
      aria-label="Name Wheel: nearest color names"
      aria-orientation={orientation}
      className={
        "relative min-h-0 flex-1 select-none overflow-hidden bg-card/40 focus-visible:outline-2 focus-visible:outline-ring " +
        (horizontal ? "" : "border-l border-border")
      }
      style={{
        touchAction: "none",
        // Real-device hardening (owner: flick worked in devtools emulation,
        // not on the actual phone): iOS long-press shows the touch-callout
        // menu and Android shows context menus — both fire pointercancel
        // mid-flick and kill the gesture. Emulation never does this.
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* The needle: marks the exact center — the current Name rests here.
          Vertical rail: a horizontal line; horizontal ticker: the
          prototype's vertical center line (ticket 31). */}
      <div
        aria-hidden
        data-testid="name-wheel-needle"
        className={
          horizontal
            ? "pointer-events-none absolute inset-y-2 left-1/2 z-10 -translate-x-1/2"
            : "pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2"
        }
      >
        <div className={horizontal ? "h-full w-px bg-primary/80" : "h-px bg-primary/70"} />
      </div>
      <div
        className="relative h-full"
        style={
          horizontal
            ? { width: count * pitch, transform: `translateX(${-scrollPos}px)` }
            : { height: count * ROW_HEIGHT, transform: `translateY(${-scrollPos}px)` }
        }
      >
        {rows}
      </div>
      {count === 0 && (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          No names available
        </div>
      )}
    </div>
  );
}

/**
 * Nearest-names engine: the n human-friendly Names perceptually closest to a
 * color, per CIEDE2000 over a color-name list (see `../color-names/names.ts`).
 *
 * Two-stage lookup (standard approach; see the ticket-02 research brief):
 *  1. Cheap squared-Euclidean distance in Lab space prefilter — keeps a
 *     small pool of likely candidates (a full ΔE00 is only computed on
 *     the pool).
 *  2. Full CIEDE2000 (validated against the official Sharma pairs) on the
 *     surviving candidates, final sort, top n.
 *
 * The prefilter pool is a heuristic: Euclidean-in-Lab and CIEDE2000 have no
 * strict ordering guarantee, so a fixed pool size cannot theoretically contain
 * the true ΔE00 top-n. In practice a 64-entry pool agrees with brute force on
 * the visible top-n for every tested query (see the parity test), and the pool
 * size is a single knob if a pathological case ever shows up.
 *
 * CHAIN MODE (see `nearestNamesChain` / `buildNamesChain`, ticket 22 —
 * replaces ticket 15's alternating fold):
 *
 * The one-way `nearestNames` list is distance-monotone in a single direction;
 * a rolodex needs names radiating OUTWARD FROM CENTER in both directions, so
 * spinning up or down both moves away from the Current Color. Beyond that,
 * rank-ordering makes the strip read as "random" a few hundred rows out:
 * ΔE00-rank-adjacent names can sit in different hue directions at similar
 * distances. The chain model instead grows TWO RADIAL GREEDY WALKS so that
 * consecutive entries on a side are actual color-space neighbors — the whole
 * strip reads as one continuous gradient meandering outward from the seed.
 *
 *   pool = Euclid-in-Lab prefilter (as the one-way engine) → ΔE00 score
 *   seed = pool's ΔE00-argmin (the global nearest within the pool)
 *   left/right sides grow by repeatedly taking the nearest UNVISITED pool
 *   entry (Lab-Euclid) to that side's FRONTIER (its last pick; the seed at
 *   first). returned array: [ …left reversed, seed, …right ] — the seed sits
 *   at index `left.length = floor((count-1)/2)`, the same center convention
 *   the fold had.
 *
 * Frontier policy — STRICT ALTERNATION (right takes the first pick, then
 * sides alternate; equivalently: each step goes to the side with fewer picks
 * so far). The alternative (grow whichever frontier has the globally nearest
 * candidate) would defer a sparse side's forced pick, but it desyncs three
 * load-bearing conventions: the seed's center index stops being
 * `floor((n-1)/2)` (sides end unbalanced), incremental growth stops being
 * symmetric (the wheel's offset compensation, ticket 19, prepends the same
 * count on each side), and the walk stops being prefix-stable (side
 * assignment would depend on the target n, so extending would rearrange
 * already-visible rows). Feel implication of alternation: a side whose
 * frontier sits in a sparse region must take its (long) jump on its own turn
 * instead of deferring it — one side can stall visually while the other
 * advances. Accepted: per-side locality is what makes the strip read as a
 * gradient, and the balanced advance keeps the rolodex arithmetic intact.
 *
 * Walk metric: Lab-Euclid (the prefilter's metric), NOT ΔE00 — a ΔE00 walk
 * would cost O(n·pool) ΔE00 evaluations (~20M at full depth, seconds).
 * Euclid-in-Lab over a flat Float64Array keeps a full-depth walk ≈ 20–40ms
 * and a 150-row build ≈ 1.5ms. ΔE00 stays the reported/displayed distance.
 *
 * Guarantees (tested):
 *   - seed = nearest Name within the prefilter pool; sanity-tested against
 *     the brute-force global minimum on sampled queries (see the seed test)
 *   - no entry is used twice; n > list length covers every entry exactly once
 *   - LOCAL ADJACENCY instead of the fold's V-shaped distance profile: each
 *     consecutive same-side pair is spatially near (Lab-Euclid step small
 *     relative to the entry's distance from the seed — ticket 22's tradeoff:
 *     the strict outward distance monotonicity is gone, the walk wanders)
 *
 * INCREMENTAL EXPANSION (ticket 19 integration, the key win): the wheel's
 * maybeExpand must NOT rebuild the chain — `extendNamesChain` grows the pool
 * (prefilter with a larger keep is a prefix-stable superset: bounded
 * insertion keeps the `keep` smallest Euclid distances in order) and
 * CONTINUES each side's walk from its frontier. Strict alternation makes the
 * walk independent of the target n given the same pool, so:
 *   - the existing prefix never rearranges (already-visible rows are stable);
 *   - below the pool-growth threshold (count·2 ≤ CHAIN_POOL, i.e. count ≤
 *     512 here) a one-shot `nearestNamesChain(color, n)` equals the
 *     incremental build(150)→extend(n) path exactly (same pool, same walk);
 *     beyond it the one-shot build had the bigger pool from step 1, so early
 *     walk decisions can differ — the incremental path is the wheel's source
 *     of truth (measured extend cost: ~2–6ms per +200-row expansion, even at
 *     pool 4444).
 *
 * Costs (15-run medians, dev machine, 4,444-entry bundled dataset; replaces
 * the fold's ~1.17/5.96/10.71ms @ 150/1500/4444): full build ≈ 1.4ms @ n=150,
 * ≈ 12–19ms @ n=1500, ≈ 30–50ms @ n=4444 (ΔE00 pool scoring ~1–2ms; the walk
 * dominates at depth, ~20–40ms at n=4444 ≈ n²/2 Euclid evals). The n=4444
 * rebuild EXCEEDS a 16ms frame — accepted per ticket 22: a full rebuild only
 * happens when the Current Color changes while the strip is already at that
 * depth (re-anchor on selection), and only the absolute end of the dataset
 * pays it; every realistic depth (≤1500) stays within one frame. Expansion
 * never pays it (incremental extend above). At full depth the walk also
 * takes forced long jumps: pool = dataset, so once a region is consumed the
 * nearest unvisited name is genuinely far — full coverage mandates it.
 */

import { ciede2000 } from "./delta-e";
import { hexToSrgb, srgbToHex } from "./hex";
import { srgbToXyz, xyzToLab } from "./xyz";
import type { Lab, Srgb } from "./types";
import { loadDefaultList, type PrecomputedNameList } from "../color-names/names";

/** A nearest-names result: the Name, its exact color, and the perceptual distance. */
export interface NameMatch {
  name: string;
  hex: string;
  srgb: Srgb;
  /** CIEDE2000 ΔE between the query color and this Name's color. */
  distance: number;
}

/** Candidates retained by the prefilter before the exact stage. */
const PREFILTER_KEEP = 64;

function prefilter(
  query: Lab,
  list: PrecomputedNameList,
  keep: number,
): number[] {
  const { labs } = list;
  // Single pass keeping the `keep` smallest squared distances via insertion
  // into a bounded array (k small ⇒ cheaper than a full sort of the list).
  const dists = new Float64Array(keep).fill(Infinity);
  const idxs = new Int32Array(keep).fill(-1);
  for (let i = 0; i < labs.length; i++) {
    const dl = labs[i].l - query.l;
    const da = labs[i].a - query.a;
    const db = labs[i].b - query.b;
    const d2 = dl * dl + da * da + db * db;
    if (d2 >= dists[keep - 1]) continue;
    let j = keep - 1;
    while (j > 0 && dists[j - 1] > d2) {
      dists[j] = dists[j - 1];
      idxs[j] = idxs[j - 1];
      j--;
    }
    dists[j] = d2;
    idxs[j] = i;
  }
  const out: number[] = [];
  for (let j = 0; j < keep; j++) if (idxs[j] >= 0) out.push(idxs[j]);
  return out;
}

/**
 * The `n` Names nearest `color`, sorted by CIEDE2000 distance ascending.
 * Total: empty list → []; n > list length → all names, sorted.
 */
export function nearestNames(
  color: Srgb,
  n: number,
  list: PrecomputedNameList = loadDefaultList(),
): NameMatch[] {
  if (n <= 0 || list.entries.length === 0) return [];
  const query = xyzToLab(srgbToXyz(color));
  const candidates = prefilter(query, list, Math.max(n, PREFILTER_KEEP));

  const scored: NameMatch[] = candidates.map((i) => ({
    name: list.entries[i].name,
    hex: list.entries[i].hex,
    srgb: list.srgbs[i],
    distance: ciede2000(query, list.labs[i]),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, n);
}

/**
 * Convenience wrapper accepting a hex string; null for invalid input.
 */
export function nearestNamesHex(
  hex: string,
  n: number,
  list?: PrecomputedNameList,
): NameMatch[] | null {
  const color = hexToSrgb(hex);
  if (!color) return null;
  return nearestNames(color, n, list);
}

/** Candidates retained by the chain prefilter before the walk. */
export const CHAIN_POOL = 1024;

/**
 * The walk state behind a chain sequence — built by `buildNamesChain`, grown
 * in place by `extendNamesChain`, materialized by `namesChainMatches`. The
 * wheel holds one in a ref (cache key `colorKey`) so expansions continue the
 * walk instead of rebuilding; the pool/walk fields are exposed so tests can
 * assert the greedy nearest-unvisited property directly.
 */
export interface NamesChain {
  /** Lowercase hex of the anchor color — the wheel's cache-invalidation key. */
  colorKey: string;
  /** Rows materialized so far: 1 + left.length + right.length (0 if empty). */
  count: number;
  /** Candidate pool: list indices in Euclid-asc prefilter order. */
  pool: number[];
  /** ΔE00 from the anchor color to each pool entry (slot-aligned with pool). */
  poolDist: Float64Array;
  /** Flat [l, a, b] per pool slot — the walk's cheap Euclid metric source. */
  walkLabs: Float64Array;
  /** 1 = pool slot already consumed by a walk side. */
  visited: Uint8Array;
  /** Pool slot of the seed (ΔE00-argmin); −1 for an empty chain. */
  seed: number;
  /** Left-side pool slots in walk order (innermost → outermost). */
  left: number[];
  /** Right-side pool slots in walk order (innermost → outermost). */
  right: number[];
  /** The list this chain indexes into (the wheel always uses the default). */
  list: PrecomputedNameList;
  /** Lab of the anchor color. */
  query: Lab;
}

/** Grow the pool to `keep` slots (no-op if already that large). Prefilter's
 * bounded insertion keeps the `keep` smallest Euclid distances in order, so a
 * larger keep yields a strict superset with an IDENTICAL PREFIX — existing
 * slots (and therefore seed/side indices) stay valid; only new slots get
 * scored. Asserted by the incremental-expansion tests. */
function growPool(chain: NamesChain, keep: number): void {
  if (keep <= chain.pool.length) return;
  const grown = prefilter(chain.query, chain.list, keep);
  const oldLen = chain.pool.length;
  chain.pool = grown;
  const dists = new Float64Array(grown.length);
  dists.set(chain.poolDist);
  const labs = new Float64Array(grown.length * 3);
  labs.set(chain.walkLabs);
  for (let i = oldLen; i < grown.length; i++) {
    const lab = chain.list.labs[grown[i]];
    dists[i] = ciede2000(chain.query, lab);
    labs[i * 3] = lab.l;
    labs[i * 3 + 1] = lab.a;
    labs[i * 3 + 2] = lab.b;
  }
  chain.poolDist = dists;
  chain.walkLabs = labs;
  const visited = new Uint8Array(grown.length);
  visited.set(chain.visited);
  chain.visited = visited;
}

/** Continue the walk until `count` reaches `target` (strict alternation,
 * right first — each step goes to the side with fewer picks so far). */
function walkTo(chain: NamesChain, target: number): void {
  const labs = chain.walkLabs;
  while (chain.count < target) {
    const side = chain.right.length <= chain.left.length ? chain.right : chain.left;
    const frontier = side.length > 0 ? side[side.length - 1] : chain.seed;
    const fl = labs[frontier * 3];
    const fa = labs[frontier * 3 + 1];
    const fb = labs[frontier * 3 + 2];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < chain.pool.length; i++) {
      if (chain.visited[i]) continue;
      const dl = labs[i * 3] - fl;
      const da = labs[i * 3 + 1] - fa;
      const db = labs[i * 3 + 2] - fb;
      const d2 = dl * dl + da * da + db * db;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    // Unreachable while pool.length ≥ target (pool ≥ count by policy), but a
    // guard keeps an under-pooled custom list from looping forever.
    if (best < 0) break;
    chain.visited[best] = 1;
    side.push(best);
    chain.count++;
  }
}

/**
 * Build a fresh chain sequence of `count = min(n, list length)` rows around
 * the Current Color: prefilter → ΔE00 score → seed = argmin → two greedy
 * radial walks (see the CHAIN MODE header). Cost: one prefilter pass + ≤pool
 * ΔE00 evaluations + an O(count·pool) Euclid walk — ≈1.4ms at n=150, ≈30–50ms
 * at the full 4,444-row depth (see the header's cost note).
 */
export function buildNamesChain(
  color: Srgb,
  n: number,
  list: PrecomputedNameList = loadDefaultList(),
): NamesChain {
  const chain: NamesChain = {
    colorKey: srgbToHex({ ...color, a: 1 }),
    count: 0,
    pool: [],
    poolDist: new Float64Array(0),
    walkLabs: new Float64Array(0),
    visited: new Uint8Array(0),
    seed: -1,
    left: [],
    right: [],
    list,
    query: xyzToLab(srgbToXyz(color)),
  };
  if (n <= 0 || list.entries.length === 0) return chain;
  const count = Math.min(n, list.entries.length);
  // Pool is a heuristic knob like the one-way prefilter's: Euclid-in-Lab and
  // CIEDE2000 have no strict ordering guarantee, so the pool can miss true
  // top-`count` entries; the seed/adjacency sanity tests bound the damage.
  // The 2× headroom over `count` (floor 1024) keeps either radial side from
  // starving in clustered regions.
  growPool(chain, Math.min(list.entries.length, Math.max(count * 2, CHAIN_POOL)));
  let seed = 0;
  for (let i = 1; i < chain.pool.length; i++) {
    if (chain.poolDist[i] < chain.poolDist[seed]) seed = i;
  }
  chain.seed = seed;
  chain.visited[seed] = 1;
  chain.count = 1;
  walkTo(chain, count);
  return chain;
}

/**
 * Grow a chain to `min(n, list length)` rows IN PLACE — the wheel's expansion
 * path (ticket 19): grows the pool to the target's policy size (prefix-stable
 * superset, see `growPool`) and continues each side's walk from its frontier;
 * no row already in the chain is recomputed or rearranged. Cost ≈ O(2·added
 * rows × pool) Euclid evals — ~2–6ms per +200-row expansion even at the
 * full-dataset pool (measured; see the header's cost note). Returns the same
 * (mutated) chain for call chaining.
 */
export function extendNamesChain(chain: NamesChain, n: number): NamesChain {
  const target = Math.min(n, chain.list.entries.length);
  if (target <= chain.count) return chain;
  growPool(
    chain,
    Math.min(
      chain.list.entries.length,
      Math.max(target * 2, CHAIN_POOL),
    ),
  );
  walkTo(chain, target);
  return chain;
}

/** Materialize the chain as the wheel's rolodex sequence:
 * [ …left outermost-first, seed, …right ] — seed at index left.length. */
export function namesChainMatches(chain: NamesChain): NameMatch[] {
  if (chain.seed < 0) return [];
  const { pool, poolDist, list } = chain;
  const match = (slot: number): NameMatch => ({
    name: list.entries[pool[slot]].name,
    hex: list.entries[pool[slot]].hex,
    srgb: list.srgbs[pool[slot]],
    distance: poolDist[slot],
  });
  const out: NameMatch[] = [];
  for (let i = chain.left.length - 1; i >= 0; i--) out.push(match(chain.left[i]));
  out.push(match(chain.seed));
  for (const slot of chain.right) out.push(match(slot));
  return out;
}

/**
 * One-shot convenience: a fresh chain of the `n` Names nearest `color`,
 * arranged as the wheel's rolodex sequence. NOTE: below the pool-growth
 * threshold (count·2 ≤ CHAIN_POOL ⇒ count ≤ 512 over the bundled list) this
 * equals the incremental build→extend path exactly; beyond it the walk had
 * the bigger pool from step 1, so early decisions can differ from the
 * incremental path — the wheel's expansion uses `extendNamesChain`, whose
 * prefix never rearranges (see the CHAIN MODE header).
 */
export function nearestNamesChain(
  color: Srgb,
  n: number,
  list: PrecomputedNameList = loadDefaultList(),
): NameMatch[] {
  return namesChainMatches(buildNamesChain(color, n, list));
}

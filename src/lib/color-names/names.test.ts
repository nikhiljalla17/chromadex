import { describe, expect, it } from "vitest";
import {
  loadDefaultList,
  loadColornamesList,
  precomputeList,
  defaultListSize,
  type NameEntry,
  type PrecomputedNameList,
} from "./names";
import {
  buildNamesChain,
  extendNamesChain,
  namesChainMatches,
  nearestNames,
  nearestNamesChain,
  nearestNamesHex,
} from "../color/names";
import { ciede2000 } from "../color/delta-e";
import { hexToSrgb, srgbToXyz, xyzToLab, type Lab, type Srgb } from "../color";

describe("default dataset", () => {
  it("bundles the colornames-oklab dataset (4,444 entries, unique names, valid hex)", () => {
    expect(defaultListSize()).toBe(4444);
    const list = loadDefaultList();
    const names = list.entries.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of list.entries) expect(e.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the 32k colornames dataset available as swappable config", async () => {
    const list = await loadColornamesList();
    expect(list.entries.length).toBeGreaterThan(25000);
  });

  it("precomputes Lab aligned with entries", () => {
    const list = loadDefaultList();
    expect(list.labs.length).toBe(list.entries.length);
    // "Signal Red" #fe0027 from the oklab list has a ≈ +80 in Lab (recomputed
    // for ticket 21 — the oklab list has no exact #ff0000 entry).
    const i = list.entries.findIndex((e) => e.hex === "#fe0027");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(list.labs[i].a).toBeGreaterThan(75);
  });
});

describe("nearestNames correctness", () => {
  it("finds an exact dataset color at ~0 distance; names #ff0000's nearest", () => {
    // "Scarlet Blaze" #ef2800 IS in the oklab list → exact hit at ΔE ≈ 0.
    const [top] = nearestNamesHex("#ef2800", 3)!;
    expect(top.distance).toBeLessThan(1);
    expect(top.name).toBe("Scarlet Blaze");
    // Recomputed for ticket 21: the oklab list has no #ff0000; its global
    // nearest is Scarlet Blaze #ef2800 (ΔE00 ≈ 2.9, scratch-bench verified).
    const [nearestRed] = nearestNamesHex("#ff0000", 1)!;
    expect(nearestRed.name).toBe("Scarlet Blaze");
    expect(nearestRed.distance).toBeLessThan(3);
  });

  it("white maps to Snow, the oklab list's nearest white", () => {
    // Recomputed for ticket 21: #ffffff → "Snow" #fffaf9 (ΔE00 ≈ 2.5).
    const [top] = nearestNamesHex("#ffffff", 1)!;
    expect(top.name).toBe("Snow");
    expect(top.distance).toBeLessThan(3);
  });

  it("results are sorted ascending by distance", () => {
    const matches = nearestNamesHex("#3366cc", 25)!;
    expect(matches.length).toBe(25);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].distance).toBeGreaterThanOrEqual(matches[i - 1].distance);
    }
  });

  it("n larger than the list returns all, sorted", () => {
    const tiny: NameEntry[] = [
      { name: "Solo Red", hex: "#ff0000" },
      { name: "Solo Blue", hex: "#0000ff" },
    ];
    const all = nearestNames({ r: 1, g: 0, b: 0 }, 10, precomputeList(tiny));
    expect(all.map((m) => m.name)).toEqual(["Solo Red", "Solo Blue"]);
  });

  it("empty list returns empty array", () => {
    expect(nearestNames({ r: 0, g: 0, b: 0 }, 5, precomputeList([]))).toEqual([]);
  });

  it("invalid hex → null (totality)", () => {
    expect(nearestNamesHex("nope", 5)).toBeNull();
  });

  it("result shape carries name, hex, srgb, distance", () => {
    const [top] = nearestNamesHex("#ff0000", 1)!;
    expect(typeof top.name).toBe("string");
    expect(top.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(top.srgb).toBeDefined();
    expect(typeof top.distance).toBe("number");
  });
});

describe("prefilter parity", () => {
  it("prefiltered top-n matches brute-force ΔE00 top-n on sampled queries", () => {
    const list = loadDefaultList();
    const sampleHexes = ["#aaffcc", "#ff0000", "#123456", "#fedcba", "#808080", "#00ffd5"];
    for (const hex of sampleHexes) {
      const color = hexToSrgb(hex)!;
      const query = xyzToLab(srgbToXyz(color));
      const fast = nearestNames(color, 10, list).map((m) => m.name);
      // brute force: full ΔE00 over every entry
      const brute = list.entries
        .map((e, i) => ({
          name: e.name,
          distance: ciede2000(query, list.labs[i]),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10)
        .map((m) => m.name);
      expect(fast).toEqual(brute);
    }
  });
});

describe("performance smoke", () => {
  it("a full nearestNames pass stays under a generous CI bound", () => {
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    const t0 = performance.now();
    nearestNames(color, 150, list);
    const ms = performance.now() - t0;
    // Smoke bound, not the real budget: the ticket target is ≪ one 16ms frame;
    // this only catches pathological regressions in CI. Measured numbers in
    // the delivery report.
    expect(ms).toBeLessThan(50);
  });
});

describe("nearestNamesChain (spatial chain, ticket 22)", () => {
  const makeList = (colors: Array<[string, string]>) =>
    precomputeList(colors.map(([name, hex]) => ({ name, hex })));

  it("center index holds the nearest Name; exact dataset colors match exactly", () => {
    // "Scarlet Blaze" #ef2800 IS in the oklab list (ticket 21 recompute; the
    // list has no #ff0000 entry).
    const seq = nearestNamesChain(hexToSrgb("#ef2800")!, 9);
    const center = Math.floor((9 - 1) / 2);
    expect(seq[center].distance).toBeLessThan(1);
    expect(seq[center].name).toBe("Scarlet Blaze");
  });

  it("no entry is used twice across the whole sequence", () => {
    const seq = nearestNamesChain(hexToSrgb("#3366cc")!, 150);
    const keys = seq.map((m) => `${m.name}|${m.hex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Local adjacency replaces the fold's V-shaped distance profile (ticket
  // 22's accepted trade-off): consecutive same-side entries are color-space
  // neighbors. Asserted in the walk's own metric (Lab-Euclid — the walk
  // picks by Euclid to the frontier): each step is small RELATIVE to the
  // entry's distance from the seed, so a side can never hue-jump across the
  // map in one row. Deterministic dataset + queries ⇒ these maxima are exact
  // measurements, not sampled noise (measured worst case 1.22× over the
  // sampled queries; a rank-fold hue jump measures 5×+).
  function maxAdjacencyRatio(color: Srgb, n: number, list: PrecomputedNameList): number {
    const query = xyzToLab(srgbToXyz(color));
    const chain = buildNamesChain(color, n, list);
    let max = 0;
    for (const side of [chain.left, chain.right]) {
      for (let i = 1; i < side.length; i++) {
        const a = list.labs[chain.pool[side[i - 1]]];
        const b = list.labs[chain.pool[side[i]]];
        const step = Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
        const fromSeed = Math.hypot(b.l - query.l, b.a - query.a, b.b - query.b);
        max = Math.max(max, step / fromSeed);
      }
    }
    return max;
  }

  it("chain adjacency: consecutive same-side entries are color-space neighbors (step ≪ distance from seed)", () => {
    const list = loadDefaultList();
    for (const hex of SAMPLE_HEXES) {
      expect(maxAdjacencyRatio(hexToSrgb(hex)!, 150, list)).toBeLessThanOrEqual(1.75);
    }
  });

  it("both directions are populated and the seed is the strip's distance minimum", () => {
    const seq = nearestNamesChain(hexToSrgb("#aaffcc")!, 21);
    expect(seq.length).toBe(21);
    const center = 10; // floor((21-1)/2)
    // The seed is the global minimum: its immediate neighbors on BOTH sides
    // are farther (a chain step cannot produce a closer entry — the seed is
    // the pool's ΔE00-argmin).
    expect(seq[center - 1].distance).toBeGreaterThan(seq[center].distance);
    expect(seq[center + 1].distance).toBeGreaterThan(seq[center].distance);
    expect(seq[0].distance).toBeGreaterThan(seq[center].distance);
    expect(seq[20].distance).toBeGreaterThan(seq[center].distance);
  });

  // Sanity (not parity): the Euclid-in-Lab prefilter has no strict ordering
  // guarantee vs CIEDE2000 (see the header note in names.ts), so a handful of
  // true top-150 entries can fall outside the pool. Exact multiset equality is
  // therefore unassertable; instead we bound the damage: the seed must be the
  // true global minimum, and the sequence's distance profile must stay within
  // generous factors of brute force. These floors catch pathological
  // starvation/hue-jump regressions while tolerating the known tail misses.
  const SAMPLE_HEXES = ["#aaffcc", "#ff0000", "#123456", "#fedcba", "#808080"];

  function bruteDistances(list: PrecomputedNameList, query: Lab): number[] {
    return list.entries.map((_, i) => ciede2000(query, list.labs[i])).sort((a, b) => a - b);
  }

  it("seed is the true global nearest Name (brute-force scan, sampled queries)", () => {
    const list = loadDefaultList();
    const center = Math.floor((150 - 1) / 2);
    for (const hex of SAMPLE_HEXES) {
      const color = hexToSrgb(hex)!;
      const seq = nearestNamesChain(color, 150, list);
      const query = xyzToLab(srgbToXyz(color));
      const bruteMin = bruteDistances(list, query)[0];
      expect(seq[center].distance).toBeCloseTo(bruteMin, 6);
    }
  });

  it("chain quality is bounded vs brute force: tail within 3.5×, inner core within 2× median (recomputed for the walk ordering)", () => {
    const list = loadDefaultList();
    const center = Math.floor((150 - 1) / 2);
    for (const hex of SAMPLE_HEXES) {
      const color = hexToSrgb(hex)!;
      const query = xyzToLab(srgbToXyz(color));
      const seq = nearestNamesChain(color, 150, list);
      const brute = bruteDistances(list, query);

      // Max distance no worse than 3.5× the true top-150 tail (prefiltered
      // pool scores all its members). Recomputed for ticket 22: the chain
      // orders by spatial adjacency, not ΔE00 rank, so its deepest entries
      // sit farther than the fold's rank-150 tail — measured worst case
      // across the sampled queries is 3.10× (the fold's 2× constant no
      // longer applies to a walk); anything beyond 3.5× would mean
      // catastrophic pool starvation.
      const maxDist = Math.max(...seq.map((m) => m.distance));
      expect(maxDist).toBeLessThanOrEqual(3.5 * brute[149]);

      // The innermost 10 entries per side (brute top-20 territory) must have
      // a median within 2× of the true top-20 median — the wheel's center is
      // what users see most. Recomputed for ticket 22: the walk's first picks
      // are Euclid-nearest to the seed, not ΔE00-rank-nearest, so the fold's
      // 25% constant no longer applies; measured worst case is 1.68×.
      const inner = [
        ...seq.slice(center - 10, center),
        ...seq.slice(center + 1, center + 11),
      ].map((m) => m.distance).sort((a, b) => a - b);
      const gotMedian = (inner[9] + inner[10]) / 2;
      const bruteMedian = (brute[9] + brute[10]) / 2;
      expect(gotMedian).toBeLessThanOrEqual(bruteMedian * 2);
    }
  });

  it("chain layout: seed at floor((n-1)/2) — the engine and wheel agree on the center", () => {
    const list = loadDefaultList();
    const n = 21;
    const seq = nearestNamesChain(hexToSrgb("#aaffcc")!, n, list);
    const center = Math.floor((n - 1) / 2);
    expect(seq[center]).toBeDefined();
    // The center entry is the global minimum (the seed) — both array ends are
    // farther (the chain's immediate-neighbor property, asserted fully above).
    expect(seq[center].distance).toBeLessThanOrEqual(seq[0].distance);
    expect(seq[center].distance).toBeLessThanOrEqual(seq[n - 1].distance);
  });

  it("greedy walk property: each pick is the nearest unvisited pool entry to its side's frontier (direct replay)", () => {
    // Replays the walk from the exported chain state: at each strict-
    // alternation step, the engine's pick must be the Lab-Euclid-argmin over
    // exactly the entries unvisited AT THAT TIME (the visited set is
    // reconstructed from the side sequences themselves — no re-derivation of
    // the choices). This asserts the nearest-unvisited property directly
    // rather than statistically.
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    const chain = buildNamesChain(color, 150, list);
    const visited = new Uint8Array(chain.pool.length);
    visited[chain.seed] = 1;
    let rightN = 0;
    let leftN = 0;
    const labs = chain.walkLabs;
    while (rightN + leftN < chain.right.length + chain.left.length) {
      const isRight = rightN <= leftN; // the engine's alternation (right first)
      const side = isRight ? chain.right : chain.left;
      const k = isRight ? rightN : leftN;
      const picked = side[k];
      const frontier = k > 0 ? side[k - 1] : chain.seed;
      const fl = labs[frontier * 3];
      const fa = labs[frontier * 3 + 1];
      const fb = labs[frontier * 3 + 2];
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < chain.pool.length; i++) {
        if (visited[i]) continue;
        const dl = labs[i * 3] - fl;
        const da = labs[i * 3 + 1] - fa;
        const db = labs[i * 3 + 2] - fb;
        const d2 = dl * dl + da * da + db * db;
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      expect(best).toBe(picked);
      visited[picked] = 1;
      if (isRight) rightN++;
      else leftN++;
    }
  });

  it("works on a synthetic list (list-agnostic): a gray ramp walks adjacent steps on each side", () => {
    // A 1-D gray ramp makes the greedy order hand-derivable: on a line, the
    // nearest unvisited entry to the frontier is always an immediate neighbor
    // (perceptual lightness is monotone in the ramp parameter), so each side
    // must be a MONOTONE RUN of adjacent grays moving away from the seed —
    // the direct nearest-unvisited property, no statistics.
    const grays: NameEntry[] = [];
    for (let i = 0; i <= 14; i++) {
      const v = (i * 17).toString(16).padStart(2, "0"); // 0x00 … 0xee
      grays.push({ name: `Gray ${i}`, hex: `#${v}${v}${v}` });
    }
    const list = precomputeList(grays);
    // #777777 = 7×17: an exact dataset color → seed = Gray 7.
    const chain = buildNamesChain(hexToSrgb("#777777")!, 15, list);
    const seq = namesChainMatches(chain);
    expect(seq.length).toBe(15);
    expect(seq[Math.floor(14 / 2)].name).toBe("Gray 7");
    const listIdx = (slot: number) => chain.pool[slot];
    const right = chain.right.map(listIdx);
    const left = chain.left.map(listIdx);
    // One side walks up the ramp, the other down — each a consecutive run.
    const asc = [right, left].find((s) => s.length > 0 && s[0] === 8);
    const desc = [right, left].find((s) => s.length > 0 && s[0] === 6);
    expect(asc).toBeDefined();
    expect(desc).toBeDefined();
    for (let i = 1; i < asc!.length; i++) expect(asc![i]).toBe(asc![i - 1] + 1);
    for (let i = 1; i < desc!.length; i++) expect(desc![i]).toBe(desc![i - 1] - 1);
    // Together the two sides cover every non-seed entry exactly once.
    expect(new Set([...right, ...left, 7]).size).toBe(15);
  });

  it("n larger than the list covers every entry exactly once", () => {
    const list = makeList([
      ["A", "#ff0000"],
      ["B", "#00ff00"],
      ["C", "#0000ff"],
    ]);
    const seq = nearestNamesChain(hexToSrgb("#ff0000")!, 99, list);
    expect(seq.length).toBe(3);
    // Seed A (exact match, ΔE=0) sits at the center; B and C flank it — which
    // side each rides is the walk's business (spatial adjacency, not rank
    // order); the invariant under test is coverage + centering:
    expect(seq[1].name).toBe("A");
    expect(new Set(seq.map((m) => m.name))).toEqual(new Set(["A", "B", "C"]));
  });

  it("incremental expansion: build→extend equals a one-shot build below the pool-growth threshold", () => {
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    // count·2 ≤ CHAIN_POOL (count ≤ 512 here) keeps the pool identical across
    // the whole path, and strict alternation makes the walk independent of
    // the target n — so the incremental path is exactly the one-shot walk.
    const chain = buildNamesChain(color, 150, list);
    extendNamesChain(chain, 350);
    extendNamesChain(chain, 450);
    expect(namesChainMatches(chain)).toEqual(nearestNamesChain(color, 450, list));
  });

  it("incremental expansion: extension never rearranges existing rows (stable relative to the seed, through pool growth)", () => {
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    const base = nearestNamesChain(color, 150, list);
    // Crossing the pool-growth threshold (count·2 > 1024 at count = 550): the
    // pool grows as a prefix-stable superset, so every row keeps its position
    // relative to the seed — the wheel's visible strip never jumps.
    const chain = buildNamesChain(color, 150, list);
    extendNamesChain(chain, 350);
    extendNamesChain(chain, 550);
    // One step past the threshold growth (550 → 1200, pool 1100 → 1400):
    // stability must hold at depth, not just at the first crossing (reviewer
    // P2, ticket 22).
    extendNamesChain(chain, 1200);
    const seq = namesChainMatches(chain);
    const center = Math.floor((seq.length - 1) / 2);
    const relative = seq.slice(center - 74, center + 76).map((m) => m.name);
    expect(relative).toEqual(base.map((m) => m.name));
    // No duplicates across the grown strip.
    const names = seq.map((m) => `${m.name}|${m.hex}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("incremental expansion at the cap: 4350 → 4444 adds exactly 47 rows per side (final-chunk parity)", () => {
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    // Mirrors the wheel's clamped final expansion: 4,350 + 200 clamped to the
    // 4,444-row dataset = 94 added rows = 47 per side (all even, the parity
    // invariant that keeps the needle on a row boundary).
    const chain = buildNamesChain(color, 4350, list);
    const before = chain.count;
    extendNamesChain(chain, 4444);
    expect(chain.count).toBe(4444);
    expect(chain.left.length - Math.floor((before - 1) / 2)).toBe(47);
    expect(chain.right.length - Math.ceil((before - 1) / 2)).toBe(47);
    const seq = namesChainMatches(chain);
    expect(new Set(seq.map((m) => m.name)).size).toBe(4444);
  });

  it("chain perf smoke: construction stays under a generous CI bound", () => {
    const list = loadDefaultList();
    const color = hexToSrgb("#7f5a3c")!;
    let t0 = performance.now();
    nearestNamesChain(color, 150, list);
    const build150 = performance.now() - t0;
    // Same style as the one-way smoke: catches pathological regressions only.
    expect(build150).toBeLessThan(50);
    // Full-depth rebuild (color change at max depth — the accepted >16ms
    // case, see the engine header) and the full incremental expansion path:
    t0 = performance.now();
    nearestNamesChain(color, 4444, list);
    const build4444 = performance.now() - t0;
    expect(build4444).toBeLessThan(250);
    t0 = performance.now();
    const chain = buildNamesChain(color, 150, list);
    for (let d = 350; d <= 4444; d += 200) extendNamesChain(chain, d);
    const incremental = performance.now() - t0;
    expect(incremental).toBeLessThan(500);
  });

  it("both directions radiate outward from the exact center", () => {
    const seq = nearestNamesChain(hexToSrgb("#aaffcc")!, 21);
    const center = 10; // floor((21-1)/2)
    expect(seq.length).toBe(21);
    // Both array ends are farther than the center: the walk moves away from
    // the seed in both directions (each side's first pick is the seed's
    // nearest unvisited neighbor; the seed is the global minimum).
    expect(seq[0].distance).toBeGreaterThan(seq[center].distance);
    expect(seq[seq.length - 1].distance).toBeGreaterThan(seq[center].distance);
  });
});

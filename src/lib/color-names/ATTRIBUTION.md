# Dataset provenance & licenses

## colornames-oklab.json — the bundled default list (ticket 21)

- **Source:** `colornames-oklab` npm package v0.6.0 (https://github.com/meodai/colornames-oklab), fetched from `https://registry.npmjs.org/colornames-oklab/-/colornames-oklab-0.6.0.tgz` (file `colornames-oklab.json`)
- **License:** MIT, Copyright (c) 2026 meodai — the full license text is vendored verbatim as `LICENSE-oklab` in this directory (from the package tarball's `LICENSE`); attribution in source via the comment in `names.ts`
- **Shape:** array of `{name, tier, hex, oklab}` rows (validated at fetch: 4,444 entries, no duplicate names, no duplicate hexes, all hexes `#[0-9a-fA-F]{6}` — 497 are uppercase, normalized to lowercase at load per chromadex's canonical `#rrggbb` form; `tier` ∈ srgb/p3/rec2020 is retained in the JSON but dropped at load — the engine consumes `{name, hex}`, tier filtering is explicitly out of scope)
- **Why:** 4,444 names blue-noise sampled over OKLab — perceptually evenly distributed, every name owns a distinct region of color space (fixes the wheel-feels-lacking clustering of the 32k list)
- **Fetched:** 2026-10-06, v0.6.0 as published on npm
- **Refresh procedure:** re-fetch the tarball URL above, re-run the shape validation, update this file's date. The loader is list-agnostic — the dataset is swappable config, not hardcoded logic.

## colornames.json — kept as swappable config (ticket 07)

- **Source:** `color-name-list` npm package (aggregated dataset from https://github.com/meodai/color-names), fetched from `https://unpkg.com/color-name-list/dist/colornames.min.json`
- **License:** MIT, Copyright (c) 2017 David Aerne — the full license text is vendored verbatim as `LICENSE` in this directory (fetched from https://github.com/meodai/color-names/blob/master/LICENSE); attribution in source via the comment in `names.ts`.
- **Shape:** object map `"rrggbb": "Name"` (keys are 6-digit hex without `#`, validated at fetch: 31,918 entries, no duplicate names, all keys `#?[0-9a-fA-F]{6}`)
- **Fetched:** 2026-09-20, `color-name-list` dist as published on unpkg
- **Refresh procedure:** re-fetch the URL above, re-run the shape validation, update this file's date. The loader is list-agnostic — the dataset is swappable config, not hardcoded logic.

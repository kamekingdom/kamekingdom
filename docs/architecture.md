# Contribution SVG generator

The generator turns a GitHub contribution calendar into a self-contained animated
SVG. There are no runtime npm packages, browser scripts, or remote assets inside
the generated image.

## Data flow

| Stage | Implementation | Responsibility |
| --- | --- | --- |
| Fetch and normalize | [`src/contributions.mjs`](../src/contributions.mjs) | Query GitHub GraphQL and map weeks to `grid[week][day] = { count, level }`. |
| Route and render | [`src/svg.mjs`](../src/svg.mjs) | Build a path through existing cells and emit shapes, theme styles, and SVG animation. |
| Command line | [`src/generate.mjs`](../src/generate.mjs) | Select demo or live input, render, and write the output file. |
| Validate | [`validate.yml`](../.github/workflows/validate.yml) | Run offline regression tests and demo generation for PRs. |
| Publish | [`pacman-contributions.yml`](../.github/workflows/pacman-contributions.yml) | Fetch live data and publish the image to `output`. |

The profile README loads the image from the `output` branch. Source changes and
generated artifacts therefore have separate publication paths.

## Calendar and route decisions

- A column represents a week, with up to seven day cells. Missing days in partial
  weeks stay missing rather than appearing as zero-contribution days.
- Contribution levels are relative to the largest count in the fetched calendar.
  They are this renderer's scale, not a copy of GitHub's own color thresholds.
- The route tries a randomized Hamiltonian path (each existing cell once), using
  a minimum-remaining-neighbors heuristic and then backbite moves for variety.
- If the bounded search finds no such path, a depth-first walk revisits cells as
  needed. This keeps each move adjacent and covers all cells. The animation may
  run longer; each cell fades on its first visit. Disconnected input is rejected.
- Empty input raises a descriptive `RangeError`. A single day remains renderable.
- Coordinates use two decimal places. Animation time fractions use six so that
  short fade intervals do not collapse on a full-year calendar.

## Reproducibility and checks

`demoCalendar()` supplies fixed demo counts, but routes vary by default.
`pathOrder(grid, { random })` and `buildSvg(grid, { random })` accept an injected
random source so tests can reproduce a route without changing the live behavior.

[`test/svg.test.mjs`](../test/svg.test.mjs) verifies coverage, adjacency, partial
weeks, boundary input, and timing. [`test/generate.test.mjs`](../test/generate.test.mjs)
exercises the CLI in temporary directories without credentials.

Offline tests do not verify GitHub's API, runner availability, publication to
`output`, or GitHub's image cache. Those need separate live checks. API resilience
is tracked in [#3](https://github.com/kamekingdom/kamekingdom/issues/3); execution
and publication verification is tracked in [#4](https://github.com/kamekingdom/kamekingdom/issues/4).

## Attribution

The original generator was adapted from `gregkozakiewicz/pacman-contribution-graph`.
The upstream commit and license notice are preserved in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

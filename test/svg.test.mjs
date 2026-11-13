import assert from "node:assert/strict";
import test from "node:test";
import { demoCalendar } from "../src/contributions.mjs";
import { buildSvg, pathOrder } from "../src/svg.mjs";

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function assertCompletePath(grid, order, { allowRevisits = false } = {}) {
  const cells = grid.flatMap((column, week) =>
    Array.from({ length: 7 }, (_, day) => column[day] ? `${week},${day}` : null)
      .filter((cell) => cell !== null),
  );
  if (allowRevisits) {
    assert.ok(order.length >= cells.length && order.length <= cells.length * 2 - 1);
  } else {
    assert.equal(order.length, cells.length);
  }
  assert.deepEqual(new Set(order.map((cell) => cell.join(","))), new Set(cells));
  for (let index = 1; index < order.length; index++) {
    const [week, day] = order[index];
    const [previousWeek, previousDay] = order[index - 1];
    assert.equal(Math.abs(week - previousWeek) + Math.abs(day - previousDay), 1,
      `path jumps at ${index}: ${order[index - 1]} -> ${order[index]}`);
  }
}

test("empty calendars have a clear rendering error and no path", () => {
  for (const grid of [[], [new Array(7)]]) {
    assert.deepEqual(pathOrder(grid), []);
    assert.throws(() => buildSvg(grid), {
      name: "RangeError",
      message: "Contribution grid must contain at least one day",
    });
  }
});

test("a single contribution day renders without invalid numbers", () => {
  const grid = [[{ count: 3, level: 1 }]];
  assert.deepEqual(pathOrder(grid), [[0, 0]]);
  const svg = buildSvg(grid);
  assert.match(svg, /^<svg /);
  assert.match(svg, /class="l1"/);
  assert.match(svg, /path="M20,20"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test("a seeded random source reproduces the same SVG", () => {
  const grid = demoCalendar();
  assert.equal(buildSvg(grid, { random: seededRandom(42) }),
    buildSvg(grid, { random: seededRandom(42) }));
});

test("annual routes cover all cells and only move to neighbors", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const grid = demoCalendar();
    assertCompletePath(grid, pathOrder(grid, { random: seededRandom(seed) }));
  }
});

test("partial first and last weeks retain valid routes", () => {
  for (let firstDay = 0; firstDay < 7; firstDay++) {
    for (let lastDay = 0; lastDay < 7; lastDay++) {
      const grid = demoCalendar();
      for (let day = 0; day < firstDay; day++) delete grid[0][day];
      grid[52] = Array.from({ length: 7 }, (_, day) =>
        day <= lastDay ? { count: 1, level: 1 } : undefined);
      assertCompletePath(grid, pathOrder(grid, {
        random: seededRandom(firstDay * 7 + lastDay + 1),
      }), { allowRevisits: true });
    }
  }
});

test("every annual fade has strictly increasing times within the animation loop", () => {
  const svg = buildSvg(demoCalendar(), { random: seededRandom(7) });
  const fades = [...svg.matchAll(/<animate attributeName="opacity"[^>]*dur="44\.16s"[^>]*>/g)];
  assert.equal(fades.length, 368);
  for (const [tag] of fades) {
    const times = tag.match(/keyTimes="([^"]+)"/)[1].split(";").map(Number);
    const values = tag.match(/values="([^"]+)"/)[1].split(";");
    assert.equal(times.length, values.length);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    for (let index = 1; index < times.length; index++) {
      assert.ok(times[index] > times[index - 1], tag);
    }
  }
});

test("zero-contribution days remain visible as pellets", () => {
  const svg = buildSvg([[{ count: 0, level: 0 }]]);
  assert.match(svg, /class="empty"/);
  assert.match(svg, /class="pellet"/);
  assert.doesNotMatch(svg, /class="l[1-4]"/);
});


test("a branching grid falls back to a connected walk and fades on first visit", () => {
  const day = { count: 1, level: 1 };
  const grid = [[undefined, day], [day, day, day]];
  const order = pathOrder(grid, { random: seededRandom(1) });
  assertCompletePath(grid, order, { allowRevisits: true });
  assert.ok(order.length > 4);
  const svg = buildSvg(grid, { random: seededRandom(1) });
  const firstSquare = svg.match(/<rect class="l1"[^>]*>(.*?)<\/rect>/)[1];
  assert.match(firstSquare, /keyTimes="0;/);
});

test("disconnected days fail with a useful error", () => {
  const day = { count: 1, level: 1 };
  assert.throws(() => buildSvg([[day, undefined, day]]), {
    name: "RangeError",
    message: "Contribution grid days must form a connected calendar",
  });
});

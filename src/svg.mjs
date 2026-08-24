// Animated SVG renderer adapted from gregkozakiewicz/pacman-contribution-graph.

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const MARGIN_X = 14;
const MARGIN_Y = 14;
const R = CELL * 0.85;
const SECONDS_PER_CELL = 0.12;
const CHOMP = 0.45;
const MOUTH_OPEN = 45;
const MOUTH_SHUT = 2;
const ROWS = 7;

const round = (number) => Math.round(number * 100) / 100;
const opposite = (row) => (row === 0 ? ROWS - 1 : 0);
const exists = (grid, week, day) => !!(grid[week] && grid[week][day]);

function neighbors(grid, week, day) {
  const result = [];
  if (exists(grid, week, day - 1)) result.push([week, day - 1]);
  if (exists(grid, week, day + 1)) result.push([week, day + 1]);
  if (exists(grid, week - 1, day)) result.push([week - 1, day]);
  if (exists(grid, week + 1, day)) result.push([week + 1, day]);
  return result;
}

function randomHamiltonian(grid, random, tries) {
  const cells = [];
  for (let week = 0; week < grid.length; week++) {
    for (let day = 0; day < ROWS; day++) {
      if (exists(grid, week, day)) cells.push([week, day]);
    }
  }
  const total = cells.length;
  const start = cells[0];

  for (let attempt = 0; attempt < tries; attempt++) {
    const seen = new Set([`${start[0]},${start[1]}`]);
    const path = [start];
    let current = start;
    for (;;) {
      const open = neighbors(grid, current[0], current[1]).filter(
        ([week, day]) => !seen.has(`${week},${day}`),
      );
      if (open.length === 0) break;

      let minimum = Infinity;
      let candidates = [];
      for (const neighbor of open) {
        const degree = neighbors(grid, neighbor[0], neighbor[1]).filter(
          ([week, day]) => !seen.has(`${week},${day}`),
        ).length;
        if (degree < minimum) {
          minimum = degree;
          candidates = [neighbor];
        } else if (degree === minimum) {
          candidates.push(neighbor);
        }
      }
      current = candidates[Math.floor(random() * candidates.length)];
      seen.add(`${current[0]},${current[1]}`);
      path.push(current);
    }
    if (path.length === total) return path;
  }
  return null;
}

function zonePath(grid, random) {
  const order = [];
  let column = 0;
  let startRow = 0;

  while (column < grid.length) {
    const width = 3 + Math.floor(random() * 6);
    const end = Math.min(column + width, grid.length);
    const actualWidth = end - column;
    const vertical = random() < 0.5;

    if (vertical) {
      let row = startRow;
      for (let current = column; current < end; current++) {
        if (row === 0) {
          for (let day = 0; day < ROWS; day++) order.push([current, day]);
        } else {
          for (let day = ROWS - 1; day >= 0; day--) order.push([current, day]);
        }
        row = opposite(row);
      }
      startRow = actualWidth % 2 === 1 ? opposite(startRow) : startRow;
    } else {
      const rows = startRow === 0 ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
      let direction = 1;
      for (const day of rows) {
        if (direction === 1) {
          for (let current = column; current < end; current++) order.push([current, day]);
        } else {
          for (let current = end - 1; current >= column; current--) order.push([current, day]);
        }
        direction = -direction;
      }
      startRow = opposite(startRow);
    }
    column = end;
  }
  return order.filter(([week, day]) => exists(grid, week, day));
}

function backbite(grid, path, random, moves) {
  const key = (cell) => `${cell[0]},${cell[1]}`;
  const positions = new Map(path.map((cell, index) => [key(cell), index]));
  const length = path.length;
  const swap = (left, right) => {
    const temporary = path[left];
    path[left] = path[right];
    path[right] = temporary;
    positions.set(key(path[left]), left);
    positions.set(key(path[right]), right);
  };

  for (let move = 0; move < moves; move++) {
    const tail = random() < 0.5;
    const end = tail ? path[length - 1] : path[0];
    const adjacent = neighbors(grid, end[0], end[1]);
    const index = positions.get(key(adjacent[Math.floor(random() * adjacent.length)]));
    if (tail) {
      if (index >= length - 2) continue;
      for (let left = index + 1, right = length - 1; left < right; left++, right--) {
        swap(left, right);
      }
    } else {
      if (index <= 1) continue;
      for (let left = 0, right = index - 1; left < right; left++, right--) {
        swap(left, right);
      }
    }
  }
  return path;
}

export function pathOrder(grid) {
  const random = Math.random;
  const seed = randomHamiltonian(grid, random, 500) || zonePath(grid, random);
  return backbite(grid, seed, random, seed.length * 14);
}

const centerX = (week) => MARGIN_X + week * PITCH + CELL / 2;
const centerY = (day) => MARGIN_Y + day * PITCH + CELL / 2;

function pacPath(angleDegrees) {
  const angle = (angleDegrees * Math.PI) / 180;
  const upperX = round(R * Math.cos(angle));
  const upperY = round(-R * Math.sin(angle));
  const lowerX = round(R * Math.cos(angle));
  const lowerY = round(R * Math.sin(angle));
  return `M0,0 L${upperX},${upperY} A${R},${R} 0 1,0 ${lowerX},${lowerY} Z`;
}

function eatAnimation(fraction, fadeWidth, duration) {
  const start = round(fraction);
  const end = round(Math.min(fraction + fadeWidth, 1));
  let keyTimes;
  let values;
  if (start <= 0) {
    keyTimes = `0;${end || 0.001};1`;
    values = "1;0;0";
  } else if (end >= 1) {
    keyTimes = `0;${start};1`;
    values = "1;1;0";
  } else {
    keyTimes = `0;${start};${end};1`;
    values = "1;1;0;0";
  }
  return `<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" values="${values}" keyTimes="${keyTimes}"/>`;
}

export function buildSvg(grid) {
  const order = pathOrder(grid);
  const count = order.length;
  const duration = round(count * SECONDS_PER_CELL);
  const fadeWidth = 0.28 / count;
  const width = MARGIN_X * 2 + grid.length * PITCH - GAP;
  const height = MARGIN_Y * 2 + ROWS * PITCH - GAP;

  const orderIndex = new Map();
  order.forEach(([week, day], index) => orderIndex.set(`${week},${day}`, index));

  const emptyCells = [];
  const squares = [];
  const pellets = [];
  for (let week = 0; week < grid.length; week++) {
    for (let day = 0; day < ROWS; day++) {
      const cell = grid[week][day];
      if (!cell) continue;
      const x = round(MARGIN_X + week * PITCH);
      const y = round(MARGIN_Y + day * PITCH);
      const index = orderIndex.get(`${week},${day}`);
      const fraction = count > 1 ? index / (count - 1) : 0;
      const eaten = eatAnimation(fraction, fadeWidth, duration);
      emptyCells.push(
        `<rect class="empty" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2"/>`,
      );
      if (cell.level > 0) {
        const pulse =
          cell.level === 4
            ? '<animate attributeName="opacity" dur="1s" repeatCount="indefinite" values="1;0.55;1" keyTimes="0;0.5;1"/>'
            : "";
        squares.push(
          `<rect class="l${cell.level}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2">${pulse}${eaten}</rect>`,
        );
      } else {
        pellets.push(
          `<circle class="pellet" cx="${round(x + CELL / 2)}" cy="${round(y + CELL / 2)}" r="1.6">${eaten}</circle>`,
        );
      }
    }
  }

  const motion =
    "M" + order.map(([week, day]) => `${round(centerX(week))},${round(centerY(day))}`).join(" L");

  const pacman = `
  <g class="pac">
    <path d="${pacPath(MOUTH_SHUT)}">
      <animate attributeName="d" dur="${CHOMP}s" repeatCount="indefinite"
        calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
        values="${pacPath(MOUTH_SHUT)};${pacPath(MOUTH_OPEN)};${pacPath(MOUTH_SHUT)}"/>
    </path>
    <animateMotion dur="${duration}s" repeatCount="indefinite" rotate="auto"
      path="${motion}" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">
  <style>
    :root {
      --empty:#ebedf0; --l1:#9be9a8; --l2:#40c463; --l3:#30a14e; --l4:#216e39;
      --pac:#ffd93b; --pellet:#e0a92e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --empty:#161b22; --l1:#0e4429; --l2:#006d32; --l3:#26a641; --l4:#39d353;
        --pac:#ffd93b; --pellet:#ffe08a;
      }
    }
    .empty { fill: var(--empty); }
    .l1 { fill: var(--l1); } .l2 { fill: var(--l2); }
    .l3 { fill: var(--l3); } .l4 { fill: var(--l4); }
    .pac { fill: var(--pac); }
    .pellet { fill: var(--pellet); }
  </style>
  <g>${emptyCells.join("")}</g>
  <g>${pellets.join("")}</g>
  <g>${squares.join("")}</g>
  ${pacman}
</svg>`;
}

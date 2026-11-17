// Velora Bay: the city itself. A seeded grid of roads and blocks, a beach and
// water along the south edge, and the named places the story sends you to.
// Everything is drawn with canvas shapes — no image assets anywhere.

import { mulberry32, pick, range, irange, clamp, circleHitsRect, pushCircleOutOfRect } from './util.js';

export const WORLD = 3200;
export const ROAD_W = 84;

const ROOF_COLORS = ['#e07856', '#5d8fa8', '#e8b34a', '#7d9b6a', '#b07a9e', '#4f7d7a', '#d98a5f', '#8a7fb8'];
const TREE_COLORS = ['#3f7d44', '#4c8a3f', '#5d9b4a'];

/**
 * Build the city from a seed. Roads run at fixed grid lines; blocks between
 * them hold buildings, parks or plazas; the south strip is sand then water.
 */
export function buildCity(seed) {
  const rng = mulberry32(seed);
  const lines = [];
  for (let i = 0; i < 8; i++) lines.push(200 + i * 400);

  const blocks = [];
  const buildings = [];
  const trees = [];
  const props = []; // lamps, hydrants, benches: {x, y, kind}

  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = lines[bx] + ROAD_W / 2 + 14;
      const y0 = lines[by] + ROAD_W / 2 + 14;
      const w = 400 - ROAD_W - 28;
      const h = 400 - ROAD_W - 28;
      const roll = rng();
      const block = { x: x0, y: y0, w, h, kind: 'city', buildings: [], trees: [] };
      if (by === 6) {
        block.kind = 'beachfront';
      } else if (roll < 0.14) {
        block.kind = 'park';
        const n = irange(rng, 6, 11);
        for (let i = 0; i < n; i++) {
          const t = { x: range(rng, x0 + 20, x0 + w - 20), y: range(rng, y0 + 20, y0 + h - 20), r: range(rng, 12, 20), color: pick(rng, TREE_COLORS) };
          block.trees.push(t);
          trees.push(t);
        }
      } else if (roll < 0.24) {
        block.kind = 'plaza';
        block.fountain = { x: x0 + w / 2, y: y0 + h / 2, r: 34 };
        for (let i = 0; i < 5; i++) {
          const t = { x: x0 + 24 + i * (w - 48) / 4, y: y0 + 26, r: 13, color: pick(rng, TREE_COLORS) };
          block.trees.push(t);
          trees.push(t);
        }
      } else {
        const n = irange(rng, 1, 3);
        for (let i = 0; i < n; i++) {
          const bw = range(rng, 70, Math.min(150, w - 20));
          const bh = range(rng, 60, Math.min(140, h - 20));
          const bx0 = range(rng, x0 + 8, x0 + w - 8 - bw);
          const by0 = range(rng, y0 + 8, y0 + h - 8 - bh);
          const b = { x: bx0, y: by0, w: bw, h: bh, color: pick(rng, ROOF_COLORS), hgt: irange(rng, 1, 3) };
          // Keep buildings from overlapping each other in the same block.
          if (block.buildings.some((o) => o.x < b.x + b.w + 16 && b.x < o.x + o.w + 16 && o.y < b.y + b.h + 16 && b.y < o.y + o.h + 16)) continue;
          block.buildings.push(b);
          buildings.push(b);
        }
        const nT = irange(rng, 0, 3);
        for (let i = 0; i < nT; i++) {
          const t = { x: range(rng, x0 + 16, x0 + w - 16), y: range(rng, y0 + 16, y0 + h - 16), r: range(rng, 10, 15), color: pick(rng, TREE_COLORS) };
          if (block.buildings.some((b) => circleHitsRect(t.x, t.y, t.r + 4, b))) continue;
          block.trees.push(t);
          trees.push(t);
        }
      }
      blocks.push(block);
    }
  }

  // Lamps along the roads, every other intersection corner.
  for (const lx of lines) {
    for (const ly of lines) {
      if ((lx + ly) % 800 === 0) props.push({ x: lx + ROAD_W / 2 + 6, y: ly + ROAD_W / 2 + 6, kind: 'lamp' });
    }
  }

  // Named places: road intersections the missions point at.
  const at = (ix, iy) => ({ x: lines[ix], y: lines[iy] });
  const places = {
    garage: at(1, 3),
    hospital: at(5, 1),
    policeStation: at(3, 3),
    bank: at(5, 4),
    docks: at(1, 6),
    plaza: at(3, 4),
    hideout: at(1, 1),
    marina: at(6, 6),
    stadium: at(6, 2),
  };

  return {
    seed, size: WORLD, lines, roadW: ROAD_W,
    blocks, buildings, trees, props,
    sandY: 2960, waterY: 3080,
    places,
  };
}

/** True when a circle of radius r at (x, y) is inside a building, the water or outside the map. */
export function blockedAt(city, x, y, r) {
  if (x < r || x > city.size - r || y < r || y > city.size - r) return true;
  if (y > city.waterY - r * 0.4) return true;
  for (const b of city.buildings) {
    if (circleHitsRect(x, y, r, b)) return true;
  }
  return false;
}

/** Slide a circle out of every building it overlaps. */
export function resolveBuildings(city, pos, r) {
  let hit = false;
  for (const b of city.buildings) {
    // Cheap reject before the precise test.
    if (pos.x < b.x - r || pos.x > b.x + b.w + r || pos.y < b.y - r || pos.y > b.y + b.h + r) continue;
    if (pushCircleOutOfRect(pos, r, b)) hit = true;
  }
  pos.x = clamp(pos.x, r, city.size - r);
  pos.y = clamp(pos.y, r, city.size - r);
  if (pos.y > city.waterY - r * 0.4) pos.y = city.waterY - r * 0.4;
  return hit;
}

/** The nearest point on any road centreline to (x, y). */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const lx of city.lines) {
    const d = Math.abs(x - lx);
    if (d < bestD) { bestD = d; best = { x: lx, y: clamp(y, 0, city.size), road: 'v', line: lx }; }
  }
  for (const ly of city.lines) {
    const d = Math.abs(y - ly);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, city.size), y: ly, road: 'h', line: ly }; }
  }
  return best;
}

/** A random point on a random road, away from a given point by at least minDist. */
export function randomRoadPoint(rng, city, awayFrom, minDist = 500) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rng() < 0.5;
    const line = pick(rng, city.lines);
    const along = range(rng, 120, city.size - 120);
    const p = vertical ? { x: line, y: along } : { x: along, y: line };
    if (!awayFrom) return p;
    const dx = p.x - awayFrom.x;
    const dy = p.y - awayFrom.y;
    if (dx * dx + dy * dy >= minDist * minDist) return p;
  }
  return { x: city.lines[4], y: city.lines[4] };
}

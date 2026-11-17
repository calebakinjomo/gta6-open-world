// Traffic cars that follow the roads and pedestrians who walk the sidewalks.
// All of them live in world.cars / traffic.peds; the player can steal any car.

import { pick, range, irange, clamp } from './util.js';
import { nearestRoadPoint, randomRoadPoint } from './city.js';

const CAR_KINDS = {
  sedan: { len: 46, wid: 22, maxSpeed: 300, accel: 380 },
  sport: { len: 46, wid: 22, maxSpeed: 385, accel: 500 },
  taxi: { len: 46, wid: 22, maxSpeed: 310, accel: 400 },
  van: { len: 56, wid: 24, maxSpeed: 250, accel: 300 },
  cop: { len: 48, wid: 23, maxSpeed: 345, accel: 470 },
  rival: { len: 47, wid: 22, maxSpeed: 360, accel: 480 },
};

const CAR_COLORS = ['#c0392b', '#2980b9', '#7f8c8d', '#e67e22', '#16a085', '#8e44ad', '#bdc3c7', '#2c3e50', '#d4ac0d'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#ecf0f1', '#fd79a8', '#00cec9'];

let nextCarId = 1;

/** Build a car object. kind picks its size and performance. */
export function makeCar(x, y, angle, kind, color) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0,
    len: spec.len, wid: spec.wid,
    maxSpeed: spec.maxSpeed, accel: spec.accel,
    kind, color: color || pick(Math.random, CAR_COLORS),
    driver: 'traffic',
    health: 100,
    road: null, line: 0, along: 0, dir: 1,
    targetSpeed: 0,
  };
}

export class Traffic {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.respawnTimer = 0;
  }

  spawnInitial(world, carCount, pedCount) {
    for (let i = 0; i < carCount; i++) this.spawnCar(world, true);
    for (let i = 0; i < pedCount; i++) this.spawnPed(world, true);
  }

  spawnCar(world, anywhere = false) {
    const p = randomRoadPoint(this.rng, this.city, anywhere ? null : world.player, anywhere ? 0 : 500);
    const road = nearestRoadPoint(this.city, p.x, p.y);
    const kind = pick(this.rng, ['sedan', 'sedan', 'sedan', 'sport', 'taxi', 'van']);
    const car = makeCar(road.x, road.y, 0, kind, kind === 'taxi' ? '#f1c40f' : pick(this.rng, CAR_COLORS));
    car.road = road.road;
    car.line = road.line;
    car.along = road.road === 'v' ? road.y : road.x;
    car.dir = this.rng() < 0.5 ? 1 : -1;
    car.angle = car.road === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.targetSpeed = range(this.rng, 95, 155);
    world.cars.push(car);
    return car;
  }

  spawnPed(world, anywhere = false) {
    const block = pick(this.rng, this.city.blocks);
    if (block.kind === 'beachfront') return;
    const edge = irange(this.rng, 0, 3);
    const ped = {
      x: block.x + 10, y: block.y + 10, angle: 0,
      speed: range(this.rng, 28, 52),
      block, edge, along: range(this.rng, 0, 1),
      state: 'walk', fleeFrom: null, fleeTimer: 0,
      color: pick(this.rng, PED_COLORS),
      phase: this.rng() * 10,
    };
    this.placePedOnEdge(ped);
    this.peds.push(ped);
    return ped;
  }

  /** Put a pedestrian on its block's sidewalk ring at its edge/along. */
  placePedOnEdge(ped) {
    const b = ped.block;
    const m = 12; // sidewalk offset outside the block
    const x0 = b.x - m, y0 = b.y - m, x1 = b.x + b.w + m, y1 = b.y + b.h + m;
    const a = ped.along;
    if (ped.edge === 0) { ped.x = x0 + a * (x1 - x0); ped.y = y0; ped.angle = 0; }
    else if (ped.edge === 1) { ped.x = x1; ped.y = y0 + a * (y1 - y0); ped.angle = Math.PI / 2; }
    else if (ped.edge === 2) { ped.x = x1 - a * (x1 - x0); ped.y = y1; ped.angle = Math.PI; }
    else { ped.x = x0; ped.y = y1 - a * (y1 - y0); ped.angle = -Math.PI / 2; }
  }

  nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.worldCars || []) {
      if (car.driver !== 'traffic' && car.driver !== 'none') continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** The driver of a stolen car bails out and runs away. */
  ejectDriver(car, world) {
    const ped = {
      x: car.x + 30, y: car.y + 30, angle: 0, speed: 120,
      block: null, edge: 0, along: 0,
      state: 'flee', fleeFrom: { x: world.player.x, y: world.player.y }, fleeTimer: 4,
      color: pick(this.rng, PED_COLORS), phase: 0,
    };
    this.peds.push(ped);
  }

  update(dt, world) {
    this.worldCars = world.cars;
    this.updateCars(dt, world);
    this.updatePeds(dt, world);
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 2;
      const trafficCount = world.cars.filter((c) => c.driver === 'traffic').length;
      if (trafficCount < 14) this.spawnCar(world);
      if (this.peds.length < 22) this.spawnPed(world);
    }
  }

  updateCars(dt, world) {
    const player = world.player;
    for (const car of world.cars) {
      if (car.driver !== 'traffic') continue;
      // Keep the city alive near the player: recycle cars that wandered off.
      const dp = Math.hypot(car.x - player.x, car.y - player.y);
      if (dp > 1800) {
        const p = randomRoadPoint(this.rng, this.city, player, 500);
        const road = nearestRoadPoint(this.city, p.x, p.y);
        car.road = road.road; car.line = road.line;
        car.along = road.road === 'v' ? road.y : road.x;
        car.dir = this.rng() < 0.5 ? 1 : -1;
        car.x = road.x; car.y = road.y;
        car.speed = car.targetSpeed;
        continue;
      }
      // Slow for the car ahead on the same road and lane.
      let ahead = null;
      let aheadD = 95;
      for (const other of world.cars) {
        if (other === car || other.road !== car.road || other.line !== car.line || other.dir !== car.dir) continue;
        const gap = (other.along - car.along) * car.dir;
        if (gap > 0 && gap < aheadD) { aheadD = gap; ahead = other; }
      }
      let want = car.targetSpeed;
      if (ahead) want = Math.min(want, Math.max(0, ahead.speed * 0.9));
      // Brake for the player's car if it is right ahead.
      if (player.car && player.car.road == null) {
        const d = Math.hypot(player.car.x - car.x, player.car.y - car.y);
        if (d < 70) want = Math.min(want, 40);
      }
      car.speed += clamp(want - car.speed, -260 * dt, 200 * dt);
      car.along += car.dir * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const cross = this.city.lines.find((l) => Math.abs(car.along - l) < 26);
      if (cross !== undefined && this.rng() < 0.012) {
        const newRoad = car.road === 'v' ? 'h' : 'v';
        car.road = newRoad;
        car.line = cross;
        car.along = car.road === 'v' ? car.y : car.x;
        car.dir = this.rng() < 0.5 ? 1 : -1;
      }
      // Wrap around the map edges so traffic never piles up at the ends.
      if (car.along < 60) car.along = this.city.size - 60;
      if (car.along > this.city.size - 60) car.along = 60;
      const lane = car.dir > 0 ? 20 : -20;
      if (car.road === 'v') {
        car.x = car.line + lane;
        car.y = car.along;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.x = car.along;
        car.y = car.line + (car.dir > 0 ? -20 : 20);
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
    }
  }

  updatePeds(dt, world) {
    const player = world.player;
    for (const ped of this.peds) {
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.x - ped.fleeFrom.x;
        const dy = ped.y - ped.fleeFrom.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.x += (dx / d) * ped.speed * 2.2 * dt;
        ped.y += (dy / d) * ped.speed * 2.2 * dt;
        ped.angle = Math.atan2(dy, dx);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
        continue;
      }
      if (!ped.block) { ped.state = 'flee'; ped.fleeTimer = 1; continue; }
      const b = ped.block;
      const perim = 2 * (b.w + 24) + 2 * (b.h + 24);
      ped.along += (ped.speed * dt) / perim;
      if (ped.along >= 1) { ped.along = 0; ped.edge = (ped.edge + 1) % 4; }
      this.placePedOnEdge(ped);
      // A nearby gunshot or speeding car scares pedestrians off.
      const dp = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (player.muzzle > 0 && dp < 260) {
        ped.state = 'flee';
        ped.fleeFrom = { x: player.x, y: player.y };
        ped.fleeTimer = 3;
      }
    }
    // Cull pedestrians that fled far away; the respawner replaces them.
    this.peds = this.peds.filter((p) => Math.hypot(p.x - player.x, p.y - player.y) < 2000);
  }
}

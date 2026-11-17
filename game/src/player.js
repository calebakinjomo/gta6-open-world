// Danny Cole, the player: on foot and behind the wheel. Movement, stealing
// cars, shooting, health and money. Rendering lives in render.js.

import { clamp, angleDelta } from './util.js';
import { resolveBuildings as cityResolve } from './city.js';

const FOOT_SPEED = 175;
const FOOT_SPRINT = 265;
const FIRE_RATE = 0.18;
const SHOT_RANGE = 540;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.speed = 0;
    this.onFoot = true;
    this.car = null;
    this.health = 100;
    this.money = 250;
    this.fireCooldown = 0;
    this.hurtTimer = 0;
    this.muzzle = 0;
    this.aimAngle = 0;
  }

  get pos() {
    return { x: this.x, y: this.y };
  }

  update(dt, world) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    // Slow health regen while the heat is off.
    if (world.police.stars === 0 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + 2.5 * dt);
    }
    if (this.onFoot) this.updateOnFoot(dt, world);
    else this.updateDriving(dt, world);
  }

  updateOnFoot(dt, world) {
    const ax = world.input.axes();
    const sprint = world.input.down('ShiftLeft') || world.input.down('ShiftRight');
    const sp = sprint ? FOOT_SPRINT : FOOT_SPEED;
    let mx = ax.x;
    let my = ax.y;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      this.x += mx * sp * dt;
      this.y += my * sp * dt;
      this.angle = Math.atan2(my, mx);
    }
    cityResolve(world.city, this, 14);
    // Aim follows the mouse.
    const cam = world.camera;
    const wx = cam.x + (world.input.mouse.x - world.view.w / 2) / cam.zoom;
    const wy = cam.y + (world.input.mouse.y - world.view.h / 2) / cam.zoom;
    this.aimAngle = Math.atan2(wy - this.y, wx - this.x);
    if (world.input.clicked()) this.shoot(world);
    if (world.input.pressed('KeyE')) this.tryEnterCar(world);
  }

  updateDriving(dt, world) {
    const car = this.car;
    if (!car) { this.onFoot = true; return; }
    // Shot scenes drive themselves; a human drives with the keys.
    const ax = world.autoDrive || world.input.axes();
    const handbrake = world.input.down('Space');
    const maxSpeed = car.maxSpeed;
    if (ax.y < 0) car.speed += car.accel * dt;
    else if (ax.y > 0) car.speed -= car.accel * 0.9 * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
    car.speed = clamp(car.speed, -130, maxSpeed);
    const steer = ax.x * (car.speed >= 0 ? 1 : -1);
    const grip = handbrake ? 0.45 : 1;
    car.angle += steer * 2.4 * grip * dt * clamp(Math.abs(car.speed) / 120, 0, 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = nx;
    car.y = ny;
    if (cityResolve(world.city, car, 16)) {
      // A wall hit: lose speed, spark and shake.
      if (Math.abs(car.speed) > 120) {
        world.addParticles(car.x, car.y, 8, '#ffb347');
        world.shake = Math.min(10, Math.abs(car.speed) / 40);
        world.sound.crash();
        this.takeDamage(Math.abs(car.speed) / 60, world);
      }
      car.speed *= 0.45;
    }
    this.x = car.x;
    this.y = car.y;
    this.angle = car.angle;
    this.speed = car.speed;
    world.sound.engine(clamp(Math.abs(car.speed) / maxSpeed, 0, 1));
    if (world.input.pressed('KeyE')) this.exitCar(world);
  }

  /** Step into the nearest car. Stealing a stranger's car is a crime. */
  tryEnterCar(world) {
    const car = world.traffic.nearestCar(this.x, this.y, 78);
    if (!car) return;
    if (car.driver === 'traffic') {
      world.traffic.ejectDriver(car, world);
      world.police.addHeat(25, world);
      world.addBanner('Car stolen!', '#ffb347');
    }
    car.driver = 'player';
    this.car = car;
    this.onFoot = false;
    this.x = car.x;
    this.y = car.y;
    world.sound.click();
  }

  exitCar(world) {
    const car = this.car;
    if (!car) return;
    car.driver = 'none';
    car.speed = 0;
    this.car = null;
    this.onFoot = true;
    this.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    this.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    cityResolve(world.city, this, 14);
    world.sound.stopEngine();
    world.sound.click();
  }

  shoot(world) {
    if (this.fireCooldown > 0 || !this.onFoot) return;
    this.fireCooldown = FIRE_RATE;
    this.muzzle = 0.06;
    world.sound.shot();
    world.shake = Math.max(world.shake, 2);
    const muzzleX = this.x + Math.cos(this.aimAngle) * 18;
    const muzzleY = this.y + Math.sin(this.aimAngle) * 18;
    world.addParticles(muzzleX, muzzleY, 3, '#ffd76a');
    // Hitscan: the nearest living target near the aim line takes the hit.
    let best = null;
    let bestD = SHOT_RANGE;
    const consider = (tx, ty, obj) => {
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > SHOT_RANGE || d < 4) return;
      const ad = Math.abs(angleDelta(this.aimAngle, Math.atan2(dy, dx)));
      if (ad > 0.1 + 26 / d) return;
      if (d < bestD) { bestD = d; best = obj; }
    };
    for (const cop of world.police.footCops) consider(cop.x, cop.y, { kind: 'cop', ref: cop });
    for (const ped of world.traffic.peds) consider(ped.x, ped.y, { kind: 'ped', ref: ped });
    for (const car of world.cars) {
      if (car.driver === 'police' || car.driver === 'rival') consider(car.x, car.y, { kind: 'car', ref: car });
    }
    if (!best) return;
    world.addParticles(this.x + Math.cos(this.aimAngle) * bestD, this.y + Math.sin(this.aimAngle) * bestD, 6, '#ff5a4a');
    if (best.kind === 'cop') {
      best.ref.health -= 34;
      world.police.addHeat(30, world);
      if (best.ref.health <= 0) world.police.dropFootCop(best.ref, world);
    } else if (best.kind === 'ped') {
      best.ref.state = 'flee';
      best.ref.fleeFrom = { x: this.x, y: this.y };
      world.police.addHeat(40, world);
    } else {
      best.ref.health = (best.ref.health ?? 100) - 25;
      best.ref.speed *= 0.6;
      world.police.addHeat(20, world);
    }
  }

  takeDamage(n, world) {
    if (this.health <= 0) return;
    this.health -= n;
    this.hurtTimer = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      world.gameOver('wasted');
    }
  }

  addMoney(n) {
    this.money += n;
  }
}

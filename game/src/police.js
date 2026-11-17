// The wanted system: heat from crimes, stars, police cars that chase and ram,
// foot cops that shoot and arrest. Busted or wasted ends the run — for now.

import { clamp, turnToward, dist } from './util.js';
import { randomRoadPoint } from './city.js';
import { makeCar } from './traffic.js';

const STAR_HEAT = [0, 15, 35, 55, 75, 90];

export class Police {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.heat = 0;
    this.stars = 0;
    this.lastCrime = -100;
    this.spawnTimer = 0;
    this.footCops = [];
  }

  addHeat(n, world) {
    this.heat = clamp(this.heat + n, 0, 100);
    this.lastCrime = world.time;
    const next = this.starsFor(this.heat);
    if (next > this.stars) {
      world.addBanner(next >= 3 ? 'WANTED — level ' + next : 'The police are onto you', '#ff5a4a');
      world.sound.siren(true);
    }
    this.stars = next;
  }

  starsFor(heat) {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (heat >= STAR_HEAT[i]) s = i;
    return s;
  }

  setStars(n, world) {
    this.heat = n === 0 ? 0 : STAR_HEAT[n];
    this.stars = n;
    this.lastCrime = world.time;
    if (n > 0) world.sound.siren(true);
  }

  update(dt, world) {
    const player = world.player;
    // Heat cools off when the player lies low.
    if (world.time - this.lastCrime > 8 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - 2.4 * dt);
      const next = this.starsFor(this.heat);
      if (next < this.stars) {
        this.stars = next;
        if (next === 0) {
          world.sound.siren(false);
          world.addBanner('You lost them.', '#7ddb8a');
        }
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      this.maintainForce(world);
    }
    this.updateCopCars(dt, world);
    this.updateFootCops(dt, world);
    world.sound.siren(this.stars > 0);
  }

  maintainForce(world) {
    const player = world.player;
    const wantCars = this.stars >= 4 ? 4 : this.stars >= 2 ? 3 : this.stars;
    const copCars = world.cars.filter((c) => c.driver === 'police');
    if (this.stars > 0 && copCars.length < wantCars) {
      const p = randomRoadPoint(this.rng, this.city, player, 620);
      const car = makeCar(p.x, p.y, 0, 'cop', '#1f2a44');
      car.driver = 'police';
      car.health = 120;
      world.cars.push(car);
      world.addParticles(p.x, p.y, 6, '#5a7dff');
    }
    // Foot cops join the chase when the player is on foot.
    const wantFoot = player.onFoot ? Math.min(this.stars, 3) : 0;
    while (this.footCops.length < wantFoot) {
      const p = randomRoadPoint(this.rng, this.city, player, 420);
      this.footCops.push({ x: p.x, y: p.y, angle: 0, health: 100, speed: 185, shootTimer: 0.6, bustTimer: 0 });
    }
    while (this.footCops.length > wantFoot) this.footCops.pop();
    // When the heat is gone, the force stands down.
    if (this.stars === 0) {
      for (const car of copCars) {
        const i = world.cars.indexOf(car);
        if (i >= 0) world.cars.splice(i, 1);
      }
      this.footCops.length = 0;
    }
  }

  updateCopCars(dt, world) {
    const player = world.player;
    for (const car of [...world.cars]) {
      if (car.driver !== 'police') continue;
      const tx = player.x;
      const ty = player.y;
      const wantAngle = Math.atan2(ty - car.y, tx - car.x);
      car.angle = turnToward(car.angle, wantAngle, 2.6 * dt);
      const d = dist(car.x, car.y, tx, ty);
      const wantSpeed = d > 60 ? car.maxSpeed : car.maxSpeed * 0.4;
      car.speed += clamp(wantSpeed - car.speed, -500 * dt, 420 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Cop cars plough through traffic, not buildings.
      const hitWall = this.city.buildings.some((b) => {
        const nx = Math.max(b.x, Math.min(car.x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(car.y, b.y + b.h));
        return (car.x - nx) ** 2 + (car.y - ny) ** 2 < 15 * 15;
      });
      if (hitWall) {
        car.speed *= 0.3;
        car.angle += 0.6;
      }
      // Ramming the player's car hurts them both.
      const target = player.car || null;
      if (target) {
        const cd = Math.hypot(car.x - target.x, car.y - target.y);
        if (cd < 34 && Math.abs(car.speed) > 60) {
          target.speed *= 0.55;
          car.speed *= 0.6;
          player.takeDamage(4, world);
          world.addParticles(target.x, target.y, 6, '#ffb347');
          world.shake = Math.max(world.shake, 4);
          world.sound.crash();
        }
      } else if (d < 40) {
        player.takeDamage(6 * dt, world);
      }
      if (car.health <= 0) {
        world.addParticles(car.x, car.y, 18, '#ff8a3d');
        world.addParticles(car.x, car.y, 10, '#5a5a5a');
        world.sound.crash();
        this.addHeat(15, world);
        const i = world.cars.indexOf(car);
        if (i >= 0) world.cars.splice(i, 1);
      }
    }
  }

  updateFootCops(dt, world) {
    const player = world.player;
    for (const cop of [...this.footCops]) {
      const d = dist(cop.x, cop.y, player.x, player.y);
      const want = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle = turnToward(cop.angle, want, 5 * dt);
      if (d > 30) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      // Arrest: close and the player is barely moving.
      const playerSpeed = player.onFoot ? 0 : Math.abs(player.speed);
      const slow = player.onFoot || playerSpeed < 30;
      if (d < 36 && slow) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 1.2) {
          world.gameOver('busted');
          return;
        }
      } else {
        cop.bustTimer = 0;
      }
      // Cops shoot from a distance.
      cop.shootTimer -= dt;
      if (d < 430 && d > 60 && cop.shootTimer <= 0) {
        cop.shootTimer = 0.9;
        player.takeDamage(5, world);
        world.addParticles(cop.x + Math.cos(cop.angle) * 18, cop.y + Math.sin(cop.angle) * 18, 2, '#ffd76a');
        world.sound.shot();
      }
      if (cop.health <= 0) this.dropFootCop(cop, world);
    }
  }

  dropFootCop(cop, world) {
    const i = this.footCops.indexOf(cop);
    if (i >= 0) this.footCops.splice(i, 1);
    world.addParticles(cop.x, cop.y, 10, '#ff5a4a');
    this.addHeat(15, world);
  }
}

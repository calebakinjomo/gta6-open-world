// Missions and the story of Velora Bay: Danny Cole, a driver for hire, gets
// pulled into Marisol Vega's crew, crosses the Kestrels, and works toward the
// big score. Plus repeatable side jobs once the crew trusts him.

import { randomRoadPoint } from './city.js';
import { money } from './util.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Marisol Vega',
    brief: 'Marisol needs a driver she can trust. Steal any car and bring it to her garage.',
    reward: 300,
    steps: [
      { type: 'steal', label: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', place: 'garage', label: 'Drive to Marisol\u2019s garage' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Marisol Vega',
    brief: 'A package is waiting at the docks. Collect it and bring it back — quietly.',
    reward: 500,
    steps: [
      { type: 'goto', place: 'docks', label: 'Drive to the docks' },
      { type: 'interact', place: 'docks', label: 'Pick up the package (press E)' },
      { type: 'goto', place: 'garage', label: 'Bring the package to the garage' },
    ],
  },
  {
    id: 'hot-cargo',
    title: 'Hot Cargo',
    giver: 'Marisol Vega',
    brief: 'The package is marked. The police are already looking — get it to the marina in 90 seconds.',
    reward: 800,
    heat: 2,
    steps: [
      { type: 'timed', place: 'marina', seconds: 90, label: 'Reach the marina before the timer runs out' },
    ],
  },
  {
    id: 'kestrel-trouble',
    title: 'Kestrel Trouble',
    giver: 'Marisol Vega',
    brief: 'The Kestrels jumped the crew at the plaza. Get there, ride out the heat for 45 seconds, then vanish to the hideout.',
    reward: 1200,
    heat: 3,
    steps: [
      { type: 'goto', place: 'plaza', label: 'Get to the plaza' },
      { type: 'survive', seconds: 45, label: 'Survive the Kestrels — 45 seconds' },
      { type: 'goto', place: 'hideout', label: 'Lose them and reach the hideout' },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Marisol Vega',
    brief: 'One job and we are all rich: the bank on Coral Row. Grab the loot and get to the hideout with every cop in Velora Bay behind you.',
    reward: 2500,
    heat: 0,
    steps: [
      { type: 'goto', place: 'bank', label: 'Drive to the bank' },
      { type: 'interact', place: 'bank', label: 'Grab the loot (press E)' },
      { type: 'escape', place: 'hideout', label: 'Escape to the hideout — wanted level 4!' },
    ],
  },
];

export class MissionManager {
  constructor(rng) {
    this.rng = rng;
    this.index = 0;
    this.active = null; // {mission, step, timer}
    this.sideJob = null;
    this.sideMarker = null;
    this.idleTimer = 0;
    this.storyDone = false;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  start(index, world) {
    const mission = MISSIONS[index];
    if (!mission) return;
    this.objectiveOverride = null;
    this.active = { mission, step: 0, timer: 0 };
    this.sideJob = null;
    this.sideMarker = null;
    if (mission.heat) world.police.setStars(mission.heat, world);
    world.addBanner(mission.title + ' — ' + mission.giver, '#ffd76a');
    world.addBanner(mission.brief, '#ffffff');
    world.sound.sting();
    this.updateMarker(world);
  }

  updateMarker(world) {
    if (!this.active) { world.marker = this.sideMarker; return; }
    const step = this.active.mission.steps[this.active.step];
    if (!step) { world.marker = null; return; }
    if (step.place) {
      const p = world.city.places[step.place];
      world.marker = { x: p.x, y: p.y, label: step.label };
    } else if (step.type === 'steal') {
      world.marker = null;
    } else {
      world.marker = null;
    }
  }

  objectiveText() {
    if (this.objectiveOverride) return this.objectiveOverride;
    if (this.active) {
      const step = this.active.mission.steps[this.active.step];
      if (!step) return '';
      let t = step.label;
      if (step.type === 'timed' || step.type === 'survive') {
        t += ' — ' + Math.ceil(this.active.timer) + 's';
      }
      return this.active.mission.title + ': ' + t;
    }
    if (this.sideJob) return 'Side job: ' + this.sideJob.label;
    if (this.storyDone) return 'Story complete — free roam. Side jobs pay the bills.';
    return 'Find Marisol\u2019s garage to start the next job.';
  }

  update(dt, world) {
    const player = world.player;
    if (this.active) {
      const m = this.active;
      const step = m.mission.steps[m.step];
      if (!step) { this.finish(world); return; }
      if (step.type === 'steal') {
        if (!player.onFoot) this.nextStep(world);
      } else if (step.type === 'goto' || step.type === 'escape') {
        const p = world.city.places[step.place];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 70) this.nextStep(world);
      } else if (step.type === 'interact') {
        const p = world.city.places[step.place];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 70 && world.input.pressed('KeyE')) {
          world.sound.pickup();
          this.nextStep(world);
        }
      } else if (step.type === 'timed') {
        if (m.timer <= 0) m.timer = step.seconds;
        m.timer -= dt;
        const p = world.city.places[step.place];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 70) this.nextStep(world);
        else if (m.timer <= 0) this.fail(world, 'Too slow — the cargo moved on.');
      } else if (step.type === 'survive') {
        if (m.timer <= 0) {
          m.timer = step.seconds;
          this.spawnRivals(world, 2);
        }
        m.timer -= dt;
        if (m.timer <= 0) this.nextStep(world);
      }
      return;
    }
    // Free roam: side jobs appear as a marker after a quiet spell.
    this.idleTimer += dt;
    if (this.index > 0 && !this.sideJob && this.idleTimer > 14) {
      this.offerSideJob(world);
    }
    if (this.sideJob) {
      const p = this.sideJob.target;
      if (Math.hypot(player.x - p.x, player.y - p.y) < 70) {
        player.addMoney(this.sideJob.reward);
        world.addBanner('Side job done — +' + money(this.sideJob.reward), '#7ddb8a');
        world.sound.sting();
        world.stats.sideJobsDone++;
        this.sideJob = null;
        this.sideMarker = null;
        world.marker = null;
        this.idleTimer = 0;
      }
    }
  }

  nextStep(world) {
    const m = this.active;
    m.step++;
    m.timer = 0;
    world.sound.pickup();
    if (m.step >= m.mission.steps.length) this.finish(world);
    else this.updateMarker(world);
  }

  finish(world) {
    const m = this.active;
    const reward = m.mission.reward;
    world.player.addMoney(reward);
    world.addBanner('Mission complete — +' + money(reward), '#7ddb8a');
    world.sound.sting();
    world.stats.missionsDone++;
    if (m.mission.id === 'the-big-score') {
      world.police.setStars(0, world);
      this.storyDone = true;
      world.addBanner('THE BIG SCORE — Velora Bay is yours, Danny.', '#ffd76a');
    }
    if (m.mission.id === 'kestrel-trouble') world.police.setStars(0, world);
    this.active = null;
    this.index++;
    this.idleTimer = 0;
    world.marker = null;
    world.saveProgress();
    if (this.current) {
      setTimeout(() => this.start(this.index, world), 2500);
    }
  }

  fail(world, why) {
    world.addBanner('Mission failed — ' + why, '#ff5a4a');
    world.sound.bust();
    this.active = null;
    this.index = Math.max(0, this.index);
    this.idleTimer = 0;
    world.marker = null;
    setTimeout(() => this.start(this.index, world), 3000);
  }

  spawnRivals(world, n) {
    for (let i = 0; i < n; i++) {
      const p = randomRoadPoint(this.rng, world.city, world.player, 500);
      const car = { x: p.x, y: p.y, angle: 0, speed: 0, len: 47, wid: 22, maxSpeed: 360, accel: 480, kind: 'rival', color: '#2d1a2e', driver: 'rival', health: 120, id: 9000 + i };
      world.cars.push(car);
    }
  }

  offerSideJob(world) {
    const taxi = this.rng() < 0.5;
    const target = randomRoadPoint(this.rng, world.city, world.player, 600);
    if (taxi) {
      this.sideJob = { kind: 'taxi', target, reward: 150, label: 'Drop the fare at the marker (+$150)' };
    } else {
      this.sideJob = { kind: 'courier', target, reward: 200, label: 'Deliver the parcel to the marker (+$200)' };
    }
    this.sideMarker = { x: target.x, y: target.y, label: this.sideJob.label };
    world.marker = this.sideMarker;
    world.addBanner('Side job available — follow the marker', '#ffd76a');
    this.idleTimer = 0;
  }
}

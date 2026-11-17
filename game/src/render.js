// Velora Bay's renderer: the city, the cars, the people, the HUD with its
// minimap, and every screen (title, pause, busted, wasted). All canvas 2D.

import { clamp, money } from './util.js';

const SKY = '#0e1420';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(world) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, w, h);
    if (world.state === 'title') {
      this.drawTitleBackdrop(world);
      this.drawTitle(world);
      return;
    }
    if (world.state === 'howto') {
      this.drawTitleBackdrop(world);
      this.drawHowto(world);
      return;
    }
    const cam = world.camera;
    const shx = world.shake > 0.3 ? (Math.random() - 0.5) * world.shake : 0;
    const shy = world.shake > 0.3 ? (Math.random() - 0.5) * world.shake : 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + shx, -cam.y + shy);
    const vw = w / cam.zoom;
    const vh = h / cam.zoom;
    const vis = { x: cam.x - vw / 2 - 60, y: cam.y - vh / 2 - 60, w: vw + 120, h: vh + 120 };
    this.drawGround(ctx, world, vis);
    this.drawMarker(ctx, world);
    this.drawCars(ctx, world, vis);
    this.drawPeds(ctx, world, vis);
    this.drawPlayer(ctx, world);
    this.drawParticles(ctx, world, vis);
    ctx.restore();
    this.drawHUD(ctx, world);
    if (world.state === 'paused') this.drawPause(world);
    else if (world.state === 'busted') this.drawEndScreen(world, 'BUSTED', 'The VPD hauled you in. You lost some cash.', '#5a7dff');
    else if (world.state === 'wasted') this.drawEndScreen(world, 'WASTED', 'You woke up at St. Marina Hospital, lighter in the pocket.', '#ff5a4a');
  }

  // ------------------------------------------------------------ world

  drawGround(ctx, world, vis) {
    const city = world.city;
    // Grass base.
    ctx.fillStyle = '#79a85e';
    ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    // Beach and water along the south edge.
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(vis.x, city.sandY, vis.w, city.waterY - city.sandY);
    ctx.fillStyle = '#2e9fc8';
    ctx.fillRect(vis.x, city.waterY, vis.w, city.size - city.waterY + 200);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wy = city.waterY + 18 + i * 22 + Math.sin(world.time * 1.2 + i * 2) * 4;
      ctx.beginPath();
      ctx.moveTo(vis.x, wy);
      ctx.lineTo(vis.x + vis.w, wy);
      ctx.stroke();
    }
    // Roads.
    ctx.fillStyle = '#3a3f4a';
    for (const lx of city.lines) ctx.fillRect(lx - city.roadW / 2, 0, city.roadW, city.size);
    for (const ly of city.lines) ctx.fillRect(0, ly - city.roadW / 2, city.size, city.roadW);
    // Centre dashes.
    ctx.fillStyle = '#e8c33a';
    for (const lx of city.lines) {
      for (let y = 0; y < city.size; y += 56) {
        if (y % 400 < 120) continue; // keep intersections clear
        ctx.fillRect(lx - 2, y, 4, 26);
      }
    }
    for (const ly of city.lines) {
      for (let x = 0; x < city.size; x += 56) {
        if (x % 400 < 120) continue;
        ctx.fillRect(x, ly - 2, 26, 4);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const lx of city.lines) {
      for (const ly of city.lines) {
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(lx - 34 + i * 14, ly - city.roadW / 2 + 4, 7, 12);
          ctx.fillRect(lx - 34 + i * 14, ly + city.roadW / 2 - 16, 7, 12);
        }
      }
    }
    // Blocks: sidewalks, buildings, parks, plazas.
    for (const b of city.blocks) {
      if (b.x + b.w < vis.x || b.x > vis.x + vis.w || b.y + b.h < vis.y || b.y > vis.y + vis.h) continue;
      ctx.fillStyle = b.kind === 'park' ? '#6fae5f' : b.kind === 'plaza' ? '#c9bda6' : '#b8b0a0';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.kind === 'plaza' && b.fountain) {
        ctx.fillStyle = '#7ec8e8';
        ctx.beginPath();
        ctx.arc(b.fountain.x, b.fountain.y, b.fountain.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.arc(b.fountain.x, b.fountain.y, b.fountain.r - 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ec8e8';
        ctx.beginPath();
        ctx.arc(b.fountain.x, b.fountain.y, b.fountain.r - 16, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const t of b.trees) this.drawTree(ctx, t);
      for (const bd of b.buildings) this.drawBuilding(ctx, bd, world);
    }
    // Lamps.
    ctx.fillStyle = '#2c2c34';
    for (const p of city.props) {
      if (p.x < vis.x || p.x > vis.x + vis.w || p.y < vis.y || p.y > vis.y + vis.h) continue;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.fillStyle = 'rgba(255, 240, 170, 0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c2c34';
    }
  }

  drawTree(ctx, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBuilding(ctx, b, world) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Rooftop windows in a grid.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 9 + i * 26, b.y + 9 + j * 26, 12, 10);
      }
    }
    // A rooftop unit for taller buildings.
    if (b.hgt >= 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + b.w / 2 - 10, b.y + b.h / 2 - 8, 20, 16);
    }
  }

  drawMarker(ctx, world) {
    const m = world.marker;
    if (!m) return;
    const pulse = 1 + Math.sin(world.time * 4) * 0.12;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // A light pillar so the marker reads from far away.
    ctx.fillStyle = 'rgba(255, 215, 106, 0.10)';
    ctx.fillRect(-14, -320, 28, 320);
    ctx.restore();
  }

  drawCars(ctx, world, vis) {
    for (const car of world.cars) {
      if (car.x < vis.x - 60 || car.x > vis.x + vis.w + 60 || car.y < vis.y - 60 || car.y > vis.y + vis.h + 60) continue;
      this.drawCar(ctx, car, world);
    }
  }

  drawCar(ctx, car, world) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
    // Wheels.
    ctx.fillStyle = '#141414';
    const wl = car.len * 0.28;
    ctx.fillRect(-wl, -car.wid / 2 - 3, 12, 6);
    ctx.fillRect(-wl, car.wid / 2 - 3, 12, 6);
    ctx.fillRect(wl - 4, -car.wid / 2 - 3, 12, 6);
    ctx.fillRect(wl - 4, car.wid / 2 - 3, 12, 6);
    // Body.
    ctx.fillStyle = car.color;
    this.roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 7);
    ctx.fill();
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20, 30, 45, 0.85)';
    ctx.fillRect(car.len * 0.12, -car.wid / 2 + 3, 10, car.wid - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-car.len * 0.28, -car.wid / 2 + 4, car.len * 0.34, car.wid - 8);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 2, 3, 5);
    ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 7, 3, 5);
    // Police light bar.
    if (car.driver === 'police') {
      const flash = Math.sin(world.time * 12) > 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      ctx.fillRect(-4, -car.wid / 2 + 2, 8, 5);
      ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      ctx.fillRect(-4, car.wid / 2 - 7, 8, 5);
      ctx.fillStyle = '#e8e8e8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VPD', 0, 3);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#141414';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    ctx.restore();
    // Wreck smoke.
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(car.x + Math.sin(world.time * 3 + car.id) * 6, car.y - 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPeds(ctx, world, vis) {
    for (const p of world.traffic.peds) {
      if (p.x < vis.x || p.x > vis.x + vis.w || p.y < vis.y || p.y > vis.y + vis.h) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(2, 3, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c89a';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 2, Math.sin(p.angle) * 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Foot cops, in navy with a cap.
    for (const cop of world.police.footCops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(2, 3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2a44';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer(ctx, world) {
    const p = world.player;
    if (!p.onFoot) return; // the car is drawn with the traffic
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(3, 4, 11, 0, Math.PI * 2);
    ctx.fill();
    // Danny: teal jacket, dark jeans, facing his walk direction.
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89a';
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Pistol when aiming.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(20, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(ctx, world, vis) {
    for (const pt of world.particles) {
      if (pt.x < vis.x || pt.x > vis.x + vis.w || pt.y < vis.y || pt.y > vis.y + vis.h) continue;
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD

  drawHUD(ctx, world) {
    const { w, h } = world.view;
    const p = world.player;
    // Money + health, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
    this.roundRect(ctx, 14, 12, 218, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#7ddb8a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(money(p.money), 26, 40);
    ctx.fillStyle = '#222';
    ctx.fillRect(26, 52, 180, 12);
    ctx.fillStyle = p.health > 40 ? '#4ade80' : '#ef4444';
    ctx.fillRect(26, 52, 180 * clamp(p.health / 100, 0, 1), 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 52, 180, 12);
    // Wanted stars, top centre.
    const stars = world.police.stars;
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < stars ? (stars >= 3 ? '#ff5a4a' : '#ffd76a') : 'rgba(255,255,255,0.25)';
      ctx.fillText('\u2605', w / 2 - 60 + i * 30, 44);
    }
    if (stars > 0) {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('WANTED', w / 2, 64);
    }
    // Minimap, top right.
    this.drawMinimap(ctx, world, w - 196, 12, 184);
    // Objective, bottom left.
    const obj = world.missions.objectiveText();
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    const ow = ctx.measureText(obj).width + 28;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
    this.roundRect(ctx, 14, h - 58, Math.min(ow, w - 28), 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('\u25B6 ' + obj, 28, h - 31);
    // Speed + controls, bottom right.
    if (!p.onFoot && p.car) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.24) + ' mph', w - 24, h - 24);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD drive  •  SPACE brake  •  E exit', w - 24, h - 64);
    } else {
      ctx.textAlign = 'right';
      ctx.font = '13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD move  •  SHIFT run  •  E enter car  •  Click to shoot', w - 24, h - 24);
    }
    // Crosshair on foot.
    if (p.onFoot) {
      const m = world.input.mouse;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
    }
    // Hurt vignette.
    if (p.hurtTimer > 0) {
      ctx.strokeStyle = 'rgba(255, 40, 40,' + (p.hurtTimer * 1.6) + ')';
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, w, h);
    }
    this.drawBanners(ctx, world);
  }

  drawMinimap(ctx, world, x, y, size) {
    const city = world.city;
    const s = size / city.size;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
    this.roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#2e9fc8';
    ctx.fillRect(x, y + city.waterY * s, size, size - city.waterY * s);
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(x, y + city.sandY * s, size, (city.waterY - city.sandY) * s);
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 3;
    for (const lx of city.lines) {
      ctx.beginPath();
      ctx.moveTo(x + lx * s, y);
      ctx.lineTo(x + lx * s, y + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + lx * s);
      ctx.lineTo(x + size, y + lx * s);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    for (const car of world.cars) {
      if (car.driver === 'traffic') ctx.fillRect(x + car.x * s - 1, y + car.y * s - 1, 2, 2);
    }
    for (const cop of world.police.footCops) {
      ctx.fillStyle = '#ff2d2d';
      ctx.fillRect(x + cop.x * s - 2, y + cop.y * s - 2, 4, 4);
    }
    for (const car of world.cars) {
      if (car.driver === 'police' || car.driver === 'rival') {
        ctx.fillStyle = car.driver === 'police' ? '#ff2d2d' : '#c026d3';
        ctx.beginPath();
        ctx.arc(x + car.x * s, y + car.y * s, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const m = world.marker;
    if (m) {
      const pulse = 4 + Math.sin(world.time * 5) * 2;
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(x + m.x * s, y + m.y * s, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, a white arrow.
    const p = world.player;
    ctx.save();
    ctx.translate(x + p.x * s, y + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 10);
    ctx.stroke();
  }

  drawBanners(ctx, world) {
    const { w } = world.view;
    let y = 92;
    ctx.textAlign = 'center';
    for (const b of world.banners) {
      const a = clamp(b.life / 0.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 19px sans-serif';
      const tw = ctx.measureText(b.text).width + 36;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
      this.roundRect(ctx, w / 2 - tw / 2, y, tw, 34, 9);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, w / 2, y + 23);
      y += 42;
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ screens

  drawTitleBackdrop(world) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    const cam = world.camera;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    const vis = { x: cam.x - w / 2 - 60, y: cam.y - h / 2 - 60, w: w + 120, h: h + 120 };
    this.drawGround(ctx, world, vis);
    ctx.restore();
    ctx.fillStyle = 'rgba(8, 10, 18, 0.55)';
    ctx.fillRect(0, 0, w, h);
  }

  drawTitle(world) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('VELORA BAY', w / 2, h * 0.26);
    ctx.fillStyle = '#fff';
    ctx.font = '22px sans-serif';
    ctx.fillText('An open-world crime story — steal it, drive it, survive it.', w / 2, h * 0.26 + 38);
    const items = [
      { id: 'new', label: 'NEW GAME', sub: 'Start Danny Cole\u2019s story from the beginning' },
      { id: 'continue', label: 'CONTINUE', sub: world.save ? 'Mission ' + (world.save.missionIndex + 1) + '  •  ' + money(world.save.money) : 'No save yet — start a new game' },
      { id: 'howto', label: 'HOW TO PLAY', sub: 'Controls, wanted levels and the rules of the bay' },
    ];
    world.menuButtons = [];
    let y = h * 0.44;
    for (const item of items) {
      const bw = 420;
      const bh = 62;
      const bx = w / 2 - bw / 2;
      const hover = world.input.mouse.x >= bx && world.input.mouse.x <= bx + bw && world.input.mouse.y >= y && world.input.mouse.y <= y + bh;
      ctx.fillStyle = hover ? 'rgba(255, 215, 106, 0.9)' : 'rgba(10, 14, 22, 0.75)';
      this.roundRect(ctx, bx, y, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = hover ? '#141414' : '#ffd76a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(item.label, w / 2, y + 27);
      ctx.fillStyle = hover ? '#333' : 'rgba(255,255,255,0.75)';
      ctx.font = '13px sans-serif';
      ctx.fillText(item.sub, w / 2, y + 47);
      world.menuButtons.push({ id: item.id, x: bx, y, w: bw, h: bh });
      y += 76;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px sans-serif';
    ctx.fillText('WASD move & drive  •  E enter / exit car  •  Mouse aim, click to shoot  •  P pause  •  M mute', w / 2, h - 28);
    ctx.fillText('A fan-made original. Not affiliated with Rockstar Games.', w / 2, h - 10);
  }

  drawHowto(world) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('HOW TO PLAY', w / 2, h * 0.2);
    const lines = [
      'You are Danny Cole, a driver for hire in Velora Bay.',
      'Work for Marisol Vega: steal cars, run cargo, survive the Kestrels,',
      'and pull off the big score — then the city is yours to roam.',
      '',
      'WASD / arrows — move and drive      SHIFT — sprint',
      'E — enter or exit a car, pick things up      SPACE — handbrake',
      'Mouse — aim      Click — shoot      P — pause      M — mute',
      '',
      'Crimes raise your wanted level: the VPD sends cars and foot cops.',
      'Lay low and the heat cools off. Getting busted or wasted costs',
      'you 20% of your cash — but the story goes on.',
      '',
      'Your progress saves automatically. Press ESC to go back.',
    ];
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#fff';
    let y = h * 0.2 + 44;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += 26;
    }
  }

  drawPause(world) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.65)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('PAUSED', w / 2, h * 0.3);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('P or Esc — resume', w / 2, h * 0.3 + 34);
    ctx.fillText('M — ' + (world.sound.muted ? 'unmute' : 'mute') + ' sound', w / 2, h * 0.3 + 60);
    ctx.fillText('R — restart the current mission', w / 2, h * 0.3 + 86);
    ctx.fillText('Q — quit to the title screen', w / 2, h * 0.3 + 112);
    ctx.fillStyle = '#ffd76a';
    ctx.font = '15px sans-serif';
    ctx.fillText(world.missions.objectiveText(), w / 2, h * 0.3 + 152);
  }

  drawEndScreen(world, title, sub, color) {
    const ctx = this.ctx;
    const { w, h } = world.view;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(title, w / 2, h * 0.38);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(sub, w / 2, h * 0.38 + 40);
    ctx.fillStyle = '#ffd76a';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press ENTER to get back on your feet', w / 2, h * 0.38 + 84);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

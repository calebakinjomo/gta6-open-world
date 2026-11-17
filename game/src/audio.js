// All sound is synthesized with WebAudio — no audio files anywhere.
// Everything is guarded: with no user gesture yet (or in a screenshot run)
// the context simply never starts and every call is a no-op.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
  }

  /** Create the context after a user gesture. Safe to call any time. */
  ensure() {
    if (this.ctx || this.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopEngine();
  }

  /** A short tone burst: the building block for every effect. */
  blip(freq, dur, type = 'sine', vol = 0.12, slideTo = null) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* sound is decoration, never fatal */ }
  }

  click() { this.blip(660, 0.06, 'square', 0.05); }
  pickup() { this.blip(880, 0.09, 'sine', 0.12); this.blip(1320, 0.12, 'sine', 0.1); }
  shot() { this.blip(220, 0.1, 'square', 0.16, 60); }
  crash() { this.blip(90, 0.25, 'sawtooth', 0.2, 40); }
  bust() { this.blip(440, 0.3, 'sawtooth', 0.12, 220); this.blip(330, 0.4, 'sawtooth', 0.12, 180); }
  sting() {
    // Mission complete: a little rising arpeggio.
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.16, 'triangle', 0.12), i * 90);
    });
  }

  /** A continuous engine hum whose pitch follows speed (0..1). */
  engine(speed01) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') { this.stopEngine(); return; }
    try {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
      }
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.05, t, 0.1);
    } catch { /* ignore */ }
  }

  stopEngine() {
    try {
      if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc.disconnect(); }
    } catch { /* ignore */ }
    this.engineOsc = null;
    this.engineGain = null;
  }

  /** The two-tone police siren, on or off. */
  siren(on) {
    if (!this.ctx || this.muted) { this.stopSiren(); return; }
    if (!on) { this.stopSiren(); return; }
    try {
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0.03;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.ctx.destination);
        this.sirenOsc.start();
        let high = true;
        this.sirenTimer = setInterval(() => {
          if (!this.sirenOsc) return;
          high = !high;
          this.sirenOsc.frequency.setValueAtTime(high ? 950 : 700, this.ctx.currentTime);
        }, 420);
      }
    } catch { /* ignore */ }
  }

  stopSiren() {
    try {
      if (this.sirenTimer) clearInterval(this.sirenTimer);
      if (this.sirenOsc) { this.sirenOsc.stop(); this.sirenOsc.disconnect(); }
    } catch { /* ignore */ }
    this.sirenTimer = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }
}

// Neon Bay — synthesized sound: no audio files, everything is built
// with the Web Audio API so the game stays fully offline and tiny.
// Music is a slow dusk-time chord loop; sirens, engine hum, gunshots and
// pickups are small oscillator/noise recipes. Audio only starts after a
// user gesture (the start button), which browsers require.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this._musicTimer = null;
    this._chordIndex = 0;
    this._started = false;
  }

  // Call from the start button / first keypress. Safe to call twice.
  unlock() {
    if (this._started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this._started = true;
      this._startEngineHum();
      this._startMusic();
    } catch {
      this.ctx = null;
    }
  }

  get ready() {
    return !!this.ctx;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
    return this.musicOn;
  }

  // A low two-oscillator hum whose pitch follows the car's speed.
  _startEngineHum() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 320;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(low);
    low.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speedNorm, inCar) {
    if (!this.engineGain || !this.engineOsc) return;
    const target = inCar ? 0.05 + 0.09 * speedNorm : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + 130 * speedNorm, this.ctx.currentTime, 0.1);
  }

  // The music loop: four warm chords, one bar each, played with soft
  // triangle waves. Original progression, written for this game.
  _startMusic() {
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
      [164.81, 207.65, 246.94],
    ];
    const playChord = () => {
      if (!this.ctx) return;
      const notes = chords[this._chordIndex % chords.length];
      this._chordIndex += 1;
      const t0 = this.ctx.currentTime + 0.05;
      for (const freq of notes) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.5, t0 + 0.4);
        g.gain.linearRampToValueAtTime(0, t0 + 3.6);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t0);
        osc.stop(t0 + 3.8);
      }
      // A soft bass root under each chord.
      const bass = this.ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = notes[0] / 2;
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0, t0);
      bg.gain.linearRampToValueAtTime(0.6, t0 + 0.3);
      bg.gain.linearRampToValueAtTime(0, t0 + 3.6);
      bass.connect(bg);
      bg.connect(this.musicGain);
      bass.start(t0);
      bass.stop(t0 + 3.8);
    };
    playChord();
    this._musicTimer = window.setInterval(playChord, 3800);
  }

  // Two-tone police siren that follows the wanted level.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const c = this.ctx;
      this.sirenOsc = c.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = c.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      lfo.start();
      this._sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      try { this._sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  _blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  gunshot() { this._noise(0.14, 0.7, 2400); this._blip(160, 0.1, 'square', 0.25); }
  horn() { this._blip(370, 0.25, 'square', 0.2); this._blip(466, 0.25, 'square', 0.18); }
  // Quiet everything when the tab hides or the game pauses.
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
  pickup() { this._blip(880, 0.12, 'sine', 0.4); window.setTimeout(() => this._blip(1320, 0.18, 'sine', 0.35), 90); }
  cash() { this._blip(1046, 0.1, 'triangle', 0.4); window.setTimeout(() => this._blip(1568, 0.22, 'triangle', 0.35), 100); }
  crash() { this._noise(0.3, 0.6, 900); }
  missionStart() { this._blip(523, 0.15, 'triangle', 0.4); window.setTimeout(() => this._blip(784, 0.3, 'triangle', 0.4), 140); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => this._blip(f, 0.25, 'triangle', 0.4), i * 130));
  }
  busted() { this._blip(220, 0.5, 'sawtooth', 0.3); window.setTimeout(() => this._blip(174, 0.7, 'sawtooth', 0.3), 300); }
  denied() { this._blip(140, 0.2, 'square', 0.3); }
}

// Synthesized sound with WebAudio — no audio files at all. The engine
// hum, police siren, gunshots, pickups, UI blips and a synth-wave music
// loop are all generated live. Audio starts on the first user gesture,
// because browsers block sound before one.

const MASTER_VOLUME = 0.5;
const ENGINE_FILTER_HZ = 420;
const SIREN_LOW_HZ = 660;
const SIREN_HIGH_HZ = 880;
const MUSIC_STEP_MS = 240;

// A minor-key bassline (A A C G A A D E) with a sparkle arpeggio on top.
const BASS_LINE = [110, 110, 130.81, 98, 110, 110, 146.83, 164.81];
const ARP_LINE = [440, 523.25, 659.25, 880, 659.25, 523.25];
const WIN_ARPEGGIO = [523, 659, 784, 1047];
const LOSE_ARPEGGIO = [392, 330, 262];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  /** Create (or resume) the audio context. Safe to call every frame. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return; // very old browser: the game stays silent
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
    this.engineOsc = this.buildEngineLoop();
    this.sirenOsc = this.buildSirenLoop();
    this.startMusic();
  }

  /** Engine: a low sawtooth through a low-pass filter, pitch follows speed. */
  buildEngineLoop() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = ENGINE_FILTER_HZ;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    osc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    osc.start();
    return osc;
  }

  /** Siren: a triangle wave alternating between two tones. */
  buildSirenLoop() {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = SIREN_LOW_HZ;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    osc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    osc.start();
    return osc;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  /** `speed` is 0..1 (0 = parked). Call every frame while driving. */
  setEngine(speed, driving) {
    if (!this.ctx) return;
    const targetGain = driving ? 0.05 + speed * 0.11 : 0;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speed * 170, now, 0.08);
  }

  /** `on` = the player has any wanted stars. Call every frame. */
  setSiren(on, dt) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!on) {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }
    this.sirenTimer += dt;
    const high = Math.floor(this.sirenTimer * 2.4) % 2 === 0;
    const freq = high ? SIREN_LOW_HZ : SIREN_HIGH_HZ;
    this.sirenOsc.frequency.setTargetAtTime(freq, now, 0.05);
    this.sirenGain.gain.setTargetAtTime(0.045, now, 0.1);
  }

  /** One short oscillator tone that decays to silence. */
  blip(freq, dur, type = 'sine', vol = 0.15) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise (gunshots, punches). Fades out over `dur`. */
  noiseBurst(dur, vol, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** Play a short arpeggio, one note every `gapMs`. */
  arpeggio(notes, gapMs, dur, type, vol) {
    notes.forEach((freq, i) => {
      setTimeout(() => this.blip(freq, dur, type, vol), i * gapMs);
    });
  }

  gunshot() {
    this.noiseBurst(0.16, 0.5, 2600);
    this.blip(140, 0.1, 'square', 0.12);
  }

  punch() {
    this.noiseBurst(0.09, 0.3, 500);
  }

  pickup() {
    this.blip(880, 0.12);
    setTimeout(() => this.blip(1320, 0.18), 90);
  }

  missionDone() {
    this.arpeggio(WIN_ARPEGGIO, 110, 0.22, 'triangle', 0.18);
  }

  busted() {
    this.arpeggio(LOSE_ARPEGGIO, 160, 0.3, 'sawtooth', 0.12);
  }

  denied() {
    this.blip(160, 0.2, 'square', 0.12);
  }

  click() {
    this.blip(660, 0.05, 'square', 0.08);
  }

  // Tiny synth-wave loop: the bassline plus a sparkle arp, scheduled with
  // a plain setInterval (good enough for background music).
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.musicOn = true;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const step = this.musicStep++;
      this.blip(BASS_LINE[step % BASS_LINE.length], 0.32, 'triangle', 0.07);
      if (step % 2 === 0) {
        const arpIndex = (step / 2) % ARP_LINE.length | 0;
        this.blip(ARP_LINE[arpIndex], 0.14, 'sine', 0.035);
      }
    }, MUSIC_STEP_MS);
  }
}

type SfxKind =
  | "shoot"
  | "explosion"
  | "pickup"
  | "combo"
  | "bridge"
  | "gameover"
  | "hurt"
  | "shield"
  | "warning";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicNodes: OscillatorNode[] = [];
  private musicPlaying = false;
  private musicVolume = 0.35;
  private sfxVolume = 0.5;
  private sfxEnabled = true;
  private lastWarning = 0;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
  }

  private ensureCtx() {
    if (!this.ctx) this.init();
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.musicGain && this.musicPlaying) this.musicGain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.1);
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!enabled) this.stopMusic();
    else if (!this.musicPlaying) this.startMusic();
  }

  startMusic() {
    this.ensureCtx();
    if (this.musicPlaying || !this.ctx || !this.musicGain) return;
    this.musicPlaying = true;
    this.musicNodes = [];

    const now = this.ctx.currentTime;

    const bass = this.ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.value = 55;
    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.08, now + 2);
    bass.connect(bassGain);
    bassGain.connect(this.musicGain);
    bass.start();
    this.musicNodes.push(bass);

    const pad = this.ctx.createOscillator();
    pad.type = "triangle";
    pad.frequency.value = 110;
    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.04, now + 3);
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 400;
    padFilter.Q.value = 2;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.musicGain);
    pad.start();
    this.musicNodes.push(pad);

    const arp = this.ctx.createOscillator();
    arp.type = "sine";
    arp.frequency.value = 220;
    const arpGain = this.ctx.createGain();
    arpGain.gain.value = 0;
    const arpFilter = this.ctx.createBiquadFilter();
    arpFilter.type = "bandpass";
    arpFilter.frequency.value = 1200;
    arpFilter.Q.value = 6;
    arp.connect(arpFilter);
    arpFilter.connect(arpGain);
    arpGain.connect(this.musicGain);
    arp.start();
    this.musicNodes.push(arp);

    this.scheduleBass(bass, bassGain, now);
    this.schedulePad(pad, padGain, padFilter, now);
    this.scheduleArp(arp, arpGain, now);

    this.musicGain.gain.setTargetAtTime(this.musicVolume, now, 0.5);
  }

  private scheduleBass(osc: OscillatorNode, gain: GainNode, t0: number) {
    const notes = [55, 55, 65.41, 55, 55, 55, 65.41, 55];
    const beat = 0.5;
    for (let i = 0; i < 64; i++) {
      const note = notes[i % notes.length];
      const t = t0 + i * beat;
      osc.frequency.setValueAtTime(note, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.linearRampToValueAtTime(0, t + beat * 0.8);
    }
    const loopEnd = t0 + 64 * beat;
    setTimeout(() => {
      if (this.musicPlaying) this.scheduleBass(osc, gain, loopEnd);
    }, (loopEnd - t0) * 1000 - 100);
  }

  private schedulePad(osc: OscillatorNode, gain: GainNode, filter: BiquadFilterNode, t0: number) {
    const chords = [110, 130.81, 164.81, 130.81];
    const beat = 2;
    for (let i = 0; i < 32; i++) {
      const note = chords[i % chords.length];
      const t = t0 + i * beat;
      osc.frequency.setValueAtTime(note, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.5);
      gain.gain.linearRampToValueAtTime(0, t + beat * 0.9);
      filter.frequency.setValueAtTime(300 + (i % 4) * 150, t);
    }
    const loopEnd = t0 + 32 * beat;
    setTimeout(() => {
      if (this.musicPlaying) this.schedulePad(osc, gain, filter, loopEnd);
    }, (loopEnd - t0) * 1000 - 100);
  }

  private scheduleArp(osc: OscillatorNode, gain: GainNode, t0: number) {
    const notes = [329.63, 391.99, 440, 493.88, 440, 391.99, 329.63, 261.63];
    const beat = 0.25;
    for (let i = 0; i < 128; i++) {
      const note = notes[i % notes.length];
      const t = t0 + i * beat;
      osc.frequency.setValueAtTime(note, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.linearRampToValueAtTime(0, t + beat * 0.6);
    }
    const loopEnd = t0 + 128 * beat;
    setTimeout(() => {
      if (this.musicPlaying) this.scheduleArp(osc, gain, loopEnd);
    }, (loopEnd - t0) * 1000 - 100);
  }

  stopMusic() {
    this.musicPlaying = false;
    for (const node of this.musicNodes) {
      try { node.stop(); } catch { }
    }
    this.musicNodes = [];
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.1);
  }

  playSfx(kind: SfxKind) {
    if (!this.sfxEnabled || !this.ctx) return;
    this.ensureCtx();
    const now = this.ctx.currentTime;

    switch (kind) {
      case "shoot": {
        const osc = this.ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.master!);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
      case "explosion": {
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        noise.start(now);
        noise.stop(now + 0.4);
        break;
      }
      case "pickup": {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.master!);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
      case "combo": {
        const base = 523.25;
        for (let i = 0; i < 4; i++) {
          const osc = this.ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = base * Math.pow(1.25, i);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(this.sfxVolume * 0.15, now + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.08);
          osc.connect(g);
          g.connect(this.master!);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.12);
        }
        break;
      }
      case "bridge": {
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 300;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        osc.start(now);
        osc.stop(now + 0.7);

        const noise = this.ctx.createOscillator();
        noise.type = "sawtooth";
        noise.frequency.value = 80;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noise.connect(ng);
        ng.connect(this.master!);
        noise.start(now);
        noise.stop(now + 0.5);
        break;
      }
      case "hurt": {
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.master!);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case "shield": {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1500;
        filter.Q.value = 10;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case "warning": {
        const t = now;
        if (t - this.lastWarning < 0.8) return;
        this.lastWarning = t;
        const osc = this.ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 440;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(this.master!);
        osc.start(t);
        osc.stop(t + 0.15);
        break;
      }
      case "gameover": {
        for (let i = 0; i < 5; i++) {
          const osc = this.ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(400 - i * 70, now + i * 0.15);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(this.sfxVolume * 0.25, now + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.2);
          osc.connect(gain);
          gain.connect(this.master!);
          osc.start(now + i * 0.15);
          osc.stop(now + i * 0.15 + 0.25);
        }
        break;
      }
    }
  }

  destroy() {
    this.stopMusic();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();

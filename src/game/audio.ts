export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private stepCooldown = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.02, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public tick(dt: number): void {
    if (this.stepCooldown > 0) this.stepCooldown -= dt;
  }

  public playFootstep(onStone: boolean): void {
    if (this.stepCooldown > 0) return;
    this.stepCooldown = 0.24;
    const jitter = 0.92 + Math.random() * 0.16;
    if (onStone) {
      this.playTone(210 * jitter, 95 * jitter, 0.06, 'triangle', 0.045);
    } else {
      this.playTone(145 * jitter, 65 * jitter, 0.075, 'sine', 0.038);
    }
  }

  public playJump(): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.playTone(230 * jitter, 520 * jitter, 0.16, 'triangle', 0.09);
  }

  public playLand(): void {
    this.playTone(135, 52, 0.12, 'sine', 0.11);
  }

  public playGlideOpen(): void {
    this.playTone(280, 440, 0.18, 'sine', 0.065);
  }

  public playDash(): void {
    this.playTone(420, 140, 0.14, 'sawtooth', 0.06);
  }

  public playSwing(): void {
    const jitter = 0.92 + Math.random() * 0.16;
    this.playTone(540 * jitter, 170 * jitter, 0.13, 'triangle', 0.085);
  }

  public playHit(heavy = false): void {
    const jitter = 0.92 + Math.random() * 0.16;
    this.playTone(heavy ? 180 : 280 * jitter, 65, heavy ? 0.22 : 0.14, 'square', heavy ? 0.12 : 0.08);
    this.playTone(620 * jitter, 240, 0.09, 'triangle', 0.07);
  }

  public playTelegraph(): void {
    this.playTone(340, 560, 0.22, 'sine', 0.055);
  }

  public playOrbPickup(): void {
    this.playTone(587.33, 880, 0.14, 'sine', 0.085, 0);
    this.playTone(880, 1174.66, 0.2, 'triangle', 0.075, 0.07);
  }

  public playShrineRestore(): void {
    const notes = [293.66, 369.99, 440, 587.33, 739.99];
    notes.forEach((freq, idx) => {
      this.playTone(freq, freq * 1.01, 0.55, 'triangle', 0.09, idx * 0.08);
    });
  }

  public playHurt(): void {
    this.playTone(190, 68, 0.24, 'sawtooth', 0.14);
  }

  public playVictory(): void {
    const chord = [392.0, 493.88, 587.33, 783.99];
    chord.forEach((f, i) => {
      this.playTone(f, f * 1.01, 0.7, 'triangle', 0.1, i * 0.11);
    });
  }

  public playDefeat(): void {
    this.playTone(293.66, 196.0, 0.35, 'sawtooth', 0.11, 0);
    this.playTone(196.0, 110.0, 0.55, 'triangle', 0.11, 0.22);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

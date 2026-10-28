export type GameNotice = 'matched' | 'started';

/** One audio context for the game. No downloads, audio loop, or work on the match's critical path. */
export class NotificationSound {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private nextAt = 0;
  private volume = 1;

  /** Browsers require creation/resume inside a click, tap or keyboard gesture. */
  unlock() {
    if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false) return;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0.35 * this.volume;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio support is optional; a match must always keep working. */ }
  }

  play(kind: GameNotice) {
    const context = this.context, output = this.output;
    if (!context || !output || context.state !== 'running') return;
    try {
      const notes = kind === 'matched' ? [659.25, 880] : [523.25, 659.25, 783.99];
      const at = Math.max(context.currentTime + 0.01, this.nextAt);
      output.gain.setValueAtTime(0.35 * this.volume, context.currentTime);
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = at + index * 0.13, end = start + 0.25;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain); gain.connect(output);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(end);
      });
      this.nextAt = at + notes.length * 0.13 + 0.25;
    } catch { /* A suspended/closed audio device must not interrupt matchmaking. */ }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.output?.gain.setValueAtTime(0.35 * this.volume, this.context?.currentTime ?? 0);
  }

  mute() { this.output?.gain.setValueAtTime(0, this.context?.currentTime ?? 0); }
  close() { if (this.context) void this.context.close().catch(() => {}); this.context = null; this.output = null; }
}

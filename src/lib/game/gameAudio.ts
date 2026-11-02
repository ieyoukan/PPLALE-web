// ゲームのBGMと効果音。1つのAudioContextで鳴らし、音量（BGM・効果音）はこの端末に保存する。
// ブラウザは操作のあとでないと音を出せないため、最初のタップ・キー入力で始める。BGMは1つの<audio>で曲を
// 切り替える（iOSは一度操作で鳴らした要素なら、あとから曲を替えても鳴らせる）。通知音は GameNotifications。

export type BgmScene = 'home' | 'match';
export type SoundEffect = 'land' | 'hit' | 'draw';
export type AudioChannel = 'bgm' | 'se';

const TRACKS: Record<BgmScene, string> = {
  /** ホーム・ルーム・メニュー：いのせんとるーむ */
  home: '/audio/bgm/innocent-room',
  /** 対戦中：なぞ？なぞ！ぷぷりえ☆大解決！（からおけ☆ばーじょん） */
  match: '/audio/bgm/nazonazo-daikaiketsu',
};
/**
 * The music files: Opus in WebM (40 kbps), or HE-AAC (48 kbps) where Opus cannot be played (older Safari).
 * Made from the original MP3 (128 kbps) with ffmpeg; the commands are in docs/game-design.md.
 */
let format: '.webm' | '.m4a' | null = null;
export function bgmUrl(scene: BgmScene) {
  format ??= new Audio().canPlayType('audio/webm; codecs="opus"') ? '.webm' : '.m4a';
  return TRACKS[scene] + format;
}
const KEYS: Record<AudioChannel, string> = { bgm: 'pplale-bgm-volume-v1', se: 'pplale-se-volume-v1' };
export const DEFAULT_VOLUMES: Record<AudioChannel, number> = { bgm: 0.3, se: 0.7 };
/** The loudest the music and the effects get at 100% (the tracks are mastered loud; effects are short). */
const BGM_LEVEL = 0.55, SE_LEVEL = 0.5;
const FADE_OUT = 0.5, FADE_IN = 0.9;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function stored(channel: AudioChannel) {
  try {
    const value = localStorage.getItem(KEYS[channel]);
    return value !== null && Number.isFinite(Number(value)) ? clamp(Number(value)) : DEFAULT_VOLUMES[channel];
  } catch { return DEFAULT_VOLUMES[channel]; }
}

class GameAudio {
  private context: AudioContext | null = null;
  private music: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private effects: GainNode | null = null;
  private playing: BgmScene | null = null;
  private scene: BgmScene = 'home';
  private positions: Partial<Record<BgmScene, number>> = {};
  private switching = 0;
  private volumes: Record<AudioChannel, number> | null = null;
  private listeners = new Set<() => void>();

  volume(channel: AudioChannel) {
    this.volumes ??= { bgm: stored('bgm'), se: stored('se') };
    return this.volumes[channel];
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  setVolume(channel: AudioChannel, value: number) {
    this.volume(channel);
    this.volumes![channel] = clamp(value);
    try { localStorage.setItem(KEYS[channel], String(this.volumes![channel])); } catch { /* This visit only. */ }
    const now = this.context?.currentTime ?? 0;
    if (channel === 'bgm') {
      this.musicGain?.gain.setTargetAtTime(this.volumes!.bgm * BGM_LEVEL, now, 0.05);
      // Silent music is not downloaded or played; turned up again, it starts.
      if (this.volumes!.bgm === 0) this.stopMusic(); else void this.apply();
    } else this.effects?.gain.setTargetAtTime(this.volumes!.se * SE_LEVEL, now, 0.02);
    this.listeners.forEach(listener => listener());
  }

  /** In a tap or key press: create or resume the audio, then play the scene's music. */
  unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        const context = new AudioContext();
        this.context = context;
        this.musicGain = context.createGain();
        this.musicGain.gain.value = this.volume('bgm') * BGM_LEVEL;
        this.musicGain.connect(context.destination);
        this.effects = context.createGain();
        this.effects.gain.value = this.volume('se') * SE_LEVEL;
        this.effects.connect(context.destination);
        const music = new Audio();
        music.loop = true; music.preload = 'none';
        context.createMediaElementSource(music).connect(this.musicGain);
        this.music = music;
      }
      if (this.context.state === 'suspended' && !document.hidden) void this.context.resume().catch(() => {});
      void this.apply();
    } catch { /* Sound is optional: the game always works without it. */ }
  }

  /** Which music the screen wants (a match board, or anything else). */
  setScene(scene: BgmScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    void this.apply();
  }

  /** The tab hidden: everything pauses; shown again, it goes on. */
  setVisible(visible: boolean) {
    if (!this.context) return;
    if (visible) { void this.context.resume().catch(() => {}); void this.apply(); }
    else void this.context.suspend().catch(() => {});
  }

  play(effect: SoundEffect) {
    const context = this.context, output = this.effects;
    if (!context || !output || context.state !== 'running' || this.volume('se') === 0) return;
    try { synth[effect](context, output, context.currentTime + 0.005); } catch { /* A missed sound never stops the game. */ }
  }

  private stopMusic() {
    const music = this.music;
    if (!music || !this.playing) return;
    this.positions[this.playing] = music.currentTime;
    music.pause();
    this.playing = null;
  }

  /** Fade the playing track out, then the wanted one in (the home music goes on where it was; a match starts its music from the top). */
  private async apply() {
    const context = this.context, music = this.music, gain = this.musicGain;
    if (!context || !music || !gain || context.state === 'closed' || document.hidden || this.volume('bgm') === 0) return;
    const scene = this.scene;
    if (this.playing === scene && !music.paused) return;
    const turn = ++this.switching;
    const level = this.volume('bgm') * BGM_LEVEL;
    if (this.playing && this.playing !== scene && !music.paused) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_OUT);
      await new Promise(resolve => setTimeout(resolve, FADE_OUT * 1000));
      if (turn !== this.switching) return;
      this.positions[this.playing] = music.currentTime;
    }
    if (this.playing !== scene || !music.src.endsWith(bgmUrl(scene))) {
      music.src = bgmUrl(scene);
      const from = scene === 'home' ? this.positions.home ?? 0 : 0;
      if (from) music.addEventListener('loadedmetadata', () => { music.currentTime = from; }, { once: true });
    }
    this.playing = scene;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(level, context.currentTime + FADE_IN);
    await music.play().catch(() => { if (turn === this.switching) this.playing = null; });
  }
}

/** Short synthesized effects, soft enough to repeat through a match. */
const synth: Record<SoundEffect, (context: AudioContext, output: AudioNode, at: number) => void> = {
  // A card lands: a light bell, two notes up.
  land: (context, output, at) => {
    for (const [frequency, start, length] of [[783.99, 0, 0.22], [1174.66, 0.06, 0.32]] as const) {
      const tone = context.createOscillator(), gain = context.createGain();
      tone.type = 'triangle'; tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at + start);
      gain.gain.linearRampToValueAtTime(0.35, at + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + start + length);
      tone.connect(gain).connect(output);
      tone.start(at + start); tone.stop(at + start + length + 0.02);
    }
  },
  // A hit: a soft thump.
  hit: (context, output, at) => {
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(190, at);
    tone.frequency.exponentialRampToValueAtTime(70, at + 0.16);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.9, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    tone.connect(gain).connect(output);
    tone.start(at); tone.stop(at + 0.24);
  },
  // A card drawn: a short paper swish.
  draw: (context, output, at) => {
    const length = 0.14, buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const noise = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass'; filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(1800, at);
    filter.frequency.exponentialRampToValueAtTime(4200, at + length);
    gain.gain.setValueAtTime(0.28, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    noise.connect(filter).connect(gain).connect(output);
    noise.start(at); noise.stop(at + length);
  },
};

/** One for the page, made when the game first needs it (never on the server). */
let instance: GameAudio | null = null;
export const gameAudio = () => instance ??= new GameAudio();

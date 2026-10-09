// 運営画面の通知音。新着メッセージ・新しい案件・緊急フラグの発生を、画面を見ていなくても気づけるようにする（未決事項 2.20）。
//
// - 音は Web Audio API で合成する（音声ファイルを持たない）。
// - ブラウザの制限で、ページを開いたあと一度も操作していない間は音を出せない。
//   「通知音 ON」のボタンを押す、または画面のどこかを一度クリックすると、以降は鳴る（soundLocked で案内を出す）。
// - ON/OFF はこのブラウザだけに保存する（localStorage。相談員ごと・端末ごとの設定。サーバーには送らない）。
// - Realtime の合図（useCaseRealtime）と、ダッシュボードの取り直し（pages/ops/index.vue）から呼ばれる。
//   ここに渡るのは「種類」だけで、相談内容は扱わない。
export type SoundKind = "message" | "case" | "urgent";

const STORAGE_KEY = "dial-ops-notify-sound";

export const soundEnabled = ref(false);
// 通知音を ON にしているのに、ブラウザの制限でまだ音を出せない状態
export const soundLocked = ref(false);

let ctx: AudioContext | null = null;
let initialized = false;
const lastPlayed: Record<string, number> = {};

function audioContext(): AudioContext | null {
  if (!import.meta.client) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor() as AudioContext;
    ctx.addEventListener("statechange", () => {
      soundLocked.value = soundEnabled.value && ctx?.state !== "running";
    });
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// 1音を鳴らす（短い立ち上がりと減衰をつけて、プツッという雑音を避ける）
function tone(c: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

// 種類ごとに音を変える：新着メッセージ＝短い2音、新しい案件＝上がる3音、緊急＝強い警告音（3回）
const PATTERNS: Record<SoundKind, (c: AudioContext) => void> = {
  message: (c) => {
    tone(c, 880, 0, 0.18, 0.25);
    tone(c, 1175, 0.16, 0.28, 0.25);
  },
  case: (c) => {
    tone(c, 660, 0, 0.16, 0.28);
    tone(c, 880, 0.15, 0.16, 0.28);
    tone(c, 1320, 0.3, 0.34, 0.28);
  },
  urgent: (c) => {
    for (let i = 0; i < 3; i++) {
      tone(c, 988, i * 0.55, 0.22, 0.45, "square");
      tone(c, 740, i * 0.55 + 0.25, 0.22, 0.45, "square");
    }
  },
};

// 同じ種類の音は、短時間に続けて鳴らさない（Realtime の通知は続けて届くことがある）。緊急だけは間隔を短くする
const MIN_GAP_MS: Record<SoundKind, number> = { message: 1500, case: 1500, urgent: 800 };

export function playNotifySound(kind: SoundKind, options: { force?: boolean } = {}) {
  if (!options.force && !soundEnabled.value) return;
  const now = Date.now();
  if (!options.force && now - (lastPlayed[kind] ?? 0) < MIN_GAP_MS[kind]) return;
  const c = audioContext();
  if (!c) return;
  if (c.state !== "running") {
    // まだ操作されておらず鳴らせない。以降の操作で解除される
    soundLocked.value = soundEnabled.value;
    return;
  }
  lastPlayed[kind] = now;
  PATTERNS[kind](c);
}

export function setSoundEnabled(on: boolean) {
  soundEnabled.value = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // 保存できなくても、このページの間は使える
  }
  if (on) {
    // ボタンを押した操作の中で音を出すと、ブラウザの制限が解除される。確認を兼ねて鳴らす
    const c = audioContext();
    soundLocked.value = c?.state !== "running";
    playNotifySound("message", { force: true });
  } else {
    soundLocked.value = false;
  }
}

// 画面ごとに1回だけ呼ぶ。保存済みの設定を読み、最初の操作でブラウザの制限を解除する
export function initNotifySound() {
  if (!import.meta.client || initialized) return;
  initialized = true;
  try {
    soundEnabled.value = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    soundEnabled.value = false;
  }
  if (soundEnabled.value) {
    // ページを開き直した直後は、操作があるまで鳴らせない
    soundLocked.value = true;
    const unlock = () => {
      const c = audioContext();
      soundLocked.value = soundEnabled.value && c?.state !== "running";
      if (c?.state === "running") {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
}

// 緊急フラグが「立っていなかった → 立った」に変わった瞬間だけを見つける。
// 案件ごとに最後に分かっている状態を覚え、初めて見る案件は覚えるだけで、変化とは見なさない
// （案件の更新はメッセージの送信のたびにも起きるため、すでに緊急の案件で鳴らし続けないようにする）。
const lastUrgent = new Map<string, boolean>();
export function noteUrgent(caseId: string, urgent: boolean): boolean {
  const before = lastUrgent.get(caseId);
  lastUrgent.set(caseId, urgent);
  return before === false && urgent;
}

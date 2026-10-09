// 運営画面の通知音。新着メッセージ・新しい案件・緊急フラグの発生を、画面を見ていなくても気づけるようにする（未決事項 2.20）。
//
// - 音は、いまは Web Audio API で合成した暫定音。音声ファイルに差し替えるときは、public/sounds/ に置いて SOUND_FILES に書く（書かない・読めないときは暫定音）。
// - ブラウザの制限で、ページを開いたあと一度も操作していない間は音を出せない。
//   「通知音 ON」のボタンを押す、または画面のどこかを一度クリックすると、以降は鳴る（soundLocked で案内を出す）。
// - 鳴らすか・どの種類を鳴らすかは、相談員・運営管理者ごとに本人が決める（本人のアカウントに保存。別のPC・ブラウザでも同じ。
//   staff_notify_prefs、API は /api/ops/notify-prefs）。ブラウザには保存しない（共用のPCで他の人の設定が残らないように）。
//   設定を読み込めるまで、また読み込めなかったときは鳴らさない。
// - Realtime の合図（useCaseRealtime）と、ダッシュボードの取り直し（pages/ops/index.vue）から呼ばれる。
//   ここに渡るのは「種類」だけで、相談内容は扱わない。
export type SoundKind = "message" | "case" | "urgent";

// 音声ファイルに差し替えるときの置き場所（public/sounds/ のファイルを "/sounds/名前.mp3" の形で書く）。null の間は暫定音
export const SOUND_FILES: Record<SoundKind, string | null> = { message: null, case: null, urgent: null };

export const soundEnabled = ref(false);
// 種類ごとに鳴らすか（soundEnabled が ON のときだけ意味がある）
export const soundKinds = reactive<Record<SoundKind, boolean>>({ message: true, case: true, urgent: true });
// 設定の読み込み・保存の状態
export const prefsState = ref<"loading" | "ready" | "error">("loading");
export const prefsSaveError = ref(false);
// 通知音を ON にしているのに、ブラウザの制限でまだ音を出せない状態
export const soundLocked = ref(false);

let ctx: AudioContext | null = null;
const buffers = new Map<SoundKind, AudioBuffer>();
let loadedFor: string | null = null;
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
    preloadFiles(ctx);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// 音声ファイルを先に読み込んでおく。読めなかった種類は、暫定音のまま
function preloadFiles(c: AudioContext) {
  for (const kind of Object.keys(SOUND_FILES) as SoundKind[]) {
    const url = SOUND_FILES[kind];
    if (!url) continue;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("not_found"))))
      .then((data) => c.decodeAudioData(data))
      .then((buf) => buffers.set(kind, buf))
      .catch(() => {});
  }
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
  if (!options.force && (!soundEnabled.value || !soundKinds[kind])) return;
  const now = Date.now();
  if (!options.force && now - (lastPlayed[kind] ?? 0) < MIN_GAP_MS[kind]) return;
  const c = audioContext();
  if (!c) return;
  const play = () => {
    lastPlayed[kind] = Date.now();
    const file = buffers.get(kind);
    if (file) {
      const src = c.createBufferSource();
      src.buffer = file;
      src.connect(c.destination);
      src.start();
    } else {
      PATTERNS[kind](c);
    }
  };
  if (c.state === "running") return play();
  // 作ったばかりの音の仕組みは、動き出すまで一瞬かかる。少し待って動いたら鳴らす。
  // 操作がなくブラウザに止められているときは動かないので、鳴らさず案内を出す（あとから遅れて鳴らさないよう、待つのは1秒まで）
  const asked = Date.now();
  c.resume().then(
    () => {
      if (c.state === "running" && Date.now() - asked < 1000) play();
      else soundLocked.value = soundEnabled.value;
    },
    () => (soundLocked.value = soundEnabled.value),
  );
}

// ブラウザの制限を解除する（ボタンを押す・画面をクリックする）。解除できるまで案内を出す
function watchUnlock() {
  const c = audioContext();
  soundLocked.value = soundEnabled.value && c?.state !== "running";
  if (!soundLocked.value) return;
  const unlock = () => {
    const c2 = audioContext();
    soundLocked.value = soundEnabled.value && c2?.state !== "running";
    if (!soundLocked.value) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function savePrefs() {
  if (saveTimer) clearTimeout(saveTimer);
  // 続けて切り替えたときは、最後の状態だけを保存する
  saveTimer = setTimeout(async () => {
    try {
      await $fetch("/api/ops/notify-prefs", {
        method: "PUT",
        body: { soundEnabled: soundEnabled.value, message: soundKinds.message, case: soundKinds.case, urgent: soundKinds.urgent },
      });
      prefsSaveError.value = false;
    } catch {
      prefsSaveError.value = true;
    }
  }, 400);
}

// 「通知音を鳴らす」全体の ON/OFF。ON にしても音は鳴らさない（確認は種類ごとの「試す」ボタンで行う）。
// 押した操作の中で音の仕組みを動かしておくと、ブラウザの制限が解除される
export function setSoundEnabled(on: boolean) {
  soundEnabled.value = on;
  if (on) {
    const c = audioContext();
    soundLocked.value = c?.state !== "running";
  } else {
    soundLocked.value = false;
  }
  savePrefs();
}

// 種類ごとの ON/OFF
export function setKindEnabled(kind: SoundKind, on: boolean) {
  soundKinds[kind] = on;
  savePrefs();
}

// 画面ごとに呼ぶ（ヘッダーから）。ログイン中の本人が変わったときだけ、本人の設定を読み込み直す
export async function initNotifySound(userId: string) {
  if (!import.meta.client || loadedFor === userId) return;
  loadedFor = userId;
  prefsState.value = "loading";
  try {
    const p = await $fetch<{ soundEnabled: boolean; message: boolean; case: boolean; urgent: boolean }>("/api/ops/notify-prefs");
    if (loadedFor !== userId) return; // 読み込み中に別の人に替わった
    soundEnabled.value = p.soundEnabled;
    soundKinds.message = p.message;
    soundKinds.case = p.case;
    soundKinds.urgent = p.urgent;
    prefsState.value = "ready";
    // ページを開き直した直後は、操作があるまで鳴らせない
    watchUnlock();
  } catch {
    // 読み込めなければ鳴らさない（設定が分からないまま鳴らして、他の人の邪魔をしない）
    soundEnabled.value = false;
    prefsState.value = "error";
  }
}

// ログアウト・別の人への切り替えのとき、前の人の設定を残さない
export function resetNotifySound() {
  loadedFor = null;
  soundEnabled.value = false;
  soundLocked.value = false;
  soundKinds.message = soundKinds.case = soundKinds.urgent = true;
  prefsState.value = "loading";
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

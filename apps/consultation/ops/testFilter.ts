// テストの表示・非表示（運営画面の一覧で共通）。
//   all  … すべて（テストも含める）／ hide … 実運用のみ／ only … テストのみ
// 選んだ状態は、このブラウザに覚えておく（本人の表示の好みだけ。共有しない。読み書きできないときは「すべて」）。
export type TestMode = "all" | "hide" | "only";

export const TEST_MODE_OPTIONS: { value: TestMode; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "hide", label: "実運用のみ（テストを隠す）" },
  { value: "only", label: "テストのみ" },
];

const KEY = "ops.testFilter";

function isMode(v: unknown): v is TestMode {
  return v === "all" || v === "hide" || v === "only";
}

// 画面をまたいで同じ選択を使う。変えたら保存する
export function useTestFilter(): Ref<TestMode> {
  const mode = useState<TestMode>("ops-test-filter", () => {
    try {
      const saved = import.meta.client ? window.localStorage.getItem(KEY) : null;
      if (isMode(saved)) return saved;
    } catch {
      /* 保存領域が使えないときは既定のまま */
    }
    return "all";
  });
  watch(mode, (v) => {
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  });
  return mode;
}

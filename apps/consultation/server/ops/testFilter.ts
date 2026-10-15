// テストの表示・非表示（2026-10-15 ダイヤルさんの指示）。運営画面の一覧・集計・出力で共通に使う。
//   test = all  … すべて（テストも含める）
//          hide … 実運用のみ（テストを除く）
//          only … テストのみ
// 値が不正・未指定のときは、呼び出し側が渡す既定値にする。
import type { H3Event } from "h3";

export type TestMode = "all" | "hide" | "only";

export function parseTestMode(event: H3Event, fallback: TestMode = "all"): TestMode {
  const v = getQuery(event).test;
  return v === "all" || v === "hide" || v === "only" ? v : fallback;
}

// 監査ログの記録用の言い方
export function testLabel(mode: TestMode): string {
  return mode === "hide" ? "除く" : mode === "only" ? "のみ" : "含む";
}

// is_test 列を持つテーブル／ビューへの問い合わせに、絞り込みを足す
// （問い合わせの型をそのまま返す。型の推論が深くなりすぎないよう、中では緩い型で扱う）
export function applyTestMode<T>(request: T, mode: TestMode): T {
  if (mode === "all") return request;
  return (request as unknown as { eq: (c: string, v: unknown) => unknown }).eq("is_test", mode === "only") as T;
}

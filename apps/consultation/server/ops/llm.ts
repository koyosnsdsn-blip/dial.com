// LLM 連携の受け皿（技術基盤設計書 8章・要件 3.9・9.5）。実際の接続はまだ行わない。
//
// 環境変数 LLM_API_ENDPOINT / LLM_API_KEY / LLM_MODEL がそろっていなければ「未設定」とし、
// 呼び出し側は、人が元のやり取りを読む画面（経緯の一覧）で動く。
// 接続するときに守ること（要件 9.5.3）：
//   - 方式（国内リージョンでの処理／越境移転の同意）が決まってから実装する（未決事項 No.15）
//   - 送信したデータが学習に使われないこと、事業者側に保持されないことを確認する
//   - 送信ログ（いつ・どの案件を送ったか）を監査ログに残す。送信内容そのものはログに残さない
//   - 機能1（Q&A）の投稿は、サマリの入力に含めない（3.9.1）
import type { H3Event } from "h3";

export type LlmStatus = { configured: boolean; model: string | null };

export function llmStatus(_event: H3Event): LlmStatus {
  const endpoint = process.env.LLM_API_ENDPOINT;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  return { configured: Boolean(endpoint && key && model), model: model || null };
}

export type HistorySummaryInput = { caseId: string; openedAt: string; messages: { sender: "user" | "counselor"; body: string; sentAt: string }[] }[];
export type HistorySummary = {
  doNotMention: string[];      // 言及を望まないと申し出のあった事項（最上位に表示する：3.9.4）
  timeline: string[];          // 相談の経緯
  themes: string[];            // 繰り返し現れているテーマ
  guided: string[];            // これまでに案内した内容
  open: string[];              // 未解決のまま残っている論点
};

// 経緯サマリの生成。未設定・未実装の間は null を返す（呼び出し側は、経緯の一覧を表示する）
export async function summarizeHistory(event: H3Event, _input: HistorySummaryInput): Promise<HistorySummary | null> {
  if (!llmStatus(event).configured) return null;
  // 方式が決まるまで接続しない。設定だけが入っていても、相談内容を外部へ送らない
  return null;
}

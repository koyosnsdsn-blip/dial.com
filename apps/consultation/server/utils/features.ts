// 利用できる機能の判定（要件 2.4・3.10.7・4.3）。
//   - 個人利用者（無料会員・月額会員）：機能1・機能3は会員区分の範囲で利用できる
//   - 企業会員：所属クライアントの設定（機能1・機能3の有効／無効）に従う。クライアントが有効でなければ使えない
// 無効な機能は「使えない」と表示するのではなく、画面と導線そのものを出さない（3.10.7）。API は 404 を返す
import type { H3Event } from "h3";
import type { AccountContext } from "./auth";

export type Features = {
  qa: boolean;        // Q&A を閲覧できる
  qaFull: boolean;    // 回答の全文を無条件に読める（月額会員・企業会員）
  qaPost: boolean;    // 質問を投稿できる（月額会員のみ）
  video: boolean;     // 動画の一覧を開ける
};

export async function featuresOf(event: H3Event, account: AccountContext | null): Promise<Features> {
  if (!account) return { qa: true, qaFull: false, qaPost: false, video: false };
  if (account.tier === "member" && account.clientId) {
    const { data, error } = await serviceDb(event)
      .from("clients")
      .select("status, feature_qa, feature_video")
      .eq("client_id", account.clientId)
      .maybeSingle();
    if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    const active = data?.status === "active";
    return { qa: active && Boolean(data?.feature_qa), qaFull: active && Boolean(data?.feature_qa), qaPost: false, video: active && Boolean(data?.feature_video) };
  }
  const paid = account.tier === "paid";
  return { qa: true, qaFull: paid, qaPost: paid, video: true };
}

// ログインしていれば利用者を返し、していなければ null を返す（公開ページ用）。
// 運営側のアカウントなど、相談者側を使えないアカウントは「未ログイン」と同じ扱いにする
export async function optionalAccount(event: H3Event): Promise<AccountContext | null> {
  try {
    return await requireAccount(event);
  } catch (e: any) {
    if (e?.statusCode === 401 || e?.statusCode === 403) return null;
    throw e;
  }
}

// サービス全体設定（要件 7.18）。system_settings に値がなければ既定値を使う。
// ここにある値は、いずれも未決事項に関わる【仮の値】。確定したら設定画面（/settings）から変更する。
import type { H3Event } from "h3";

export type SettingDef = { key: string; label: string; unit: string; def: number; min: number; max: number; note: string };

export const SETTING_DEFS: SettingDef[] = [
  { key: "idle_close_days", label: "無操作による自動終了までの日数", unit: "日", def: 14, min: 1, max: 365, note: "企業枠の相談が対象。返信待ちの相談は終了しない（要件 3.2.6、未決事項 No.61）" },
  { key: "deletion_grace_days", label: "削除から完全な消去までの猶予", unit: "日", def: 30, min: 0, max: 365, note: "利用者が相談を削除してから、物理削除するまでの日数（要件 9.3、未決事項 No.9）。変更は、変更後の削除から適用" },
  { key: "quick_restart_days", label: "「短期間での再開」とみなす日数", unit: "日", def: 7, min: 1, max: 90, note: "前回の終了からこの日数以内の再開にフラグを付ける（要件 3.4.2、未決事項 No.70）" },
  { key: "frequent_days", label: "「利用が頻繁」の判定期間", unit: "日", def: 30, min: 1, max: 365, note: "この期間内の相談件数で判定する（要件 3.2.3、未決事項 No.19）" },
  { key: "frequent_cases", label: "「利用が頻繁」とする相談件数", unit: "件", def: 5, min: 2, max: 100, note: "判定期間内にこの件数以上でフラグを付ける。利用は止めない" },
  { key: "repeated_adjustments", label: "往復回数の調整の繰り返しとする回数", unit: "回", def: 3, min: 2, max: 50, note: "1件の相談でこの回数以上の調整があるとフラグを付ける（未決事項 No.69）" },
  { key: "busy_threshold", label: "稼働逼迫アラートを出す未返信件数", unit: "件", def: 20, min: 1, max: 10000, note: "未返信の相談がこの件数以上になると、ダッシュボードに警告を出す（要件 7.1、未決事項 No.20）" },
  { key: "report_min_total", label: "四半期レポートで内訳を出す最小の相談件数", unit: "件", def: 10, min: 10, max: 1000, note: "企業契約型が対象。総件数がこれ未満の四半期は、件数だけを出し、内訳は出さない（要件 7.6.3）。10件より小さくはできない。変更は、次に作成するレポートから適用" },
  { key: "report_min_genre", label: "四半期レポートでジャンルを個別に出す最小の件数", unit: "件", def: 5, min: 5, max: 1000, note: "企業契約型が対象。これ未満のジャンルは「その他」に合算する（要件 7.6.3）。5件より小さくはできない" },
  { key: "small_client_members", label: "相談に関する数値を出さない従業員数の上限", unit: "人未満", def: 30, min: 1, max: 100000, note: "契約上の従業員数がこの人数未満の企業契約型クライアントには、四半期レポートで相談に関する数値を出さない（要件 7.6.4、【仮】30人）" },
  { key: "personal_rally_max", label: "招待コードなしの相談の、相談員からの返信の回数", unit: "回", def: 5, min: 1, max: 10, note: "ニックネームで登録した利用者が、招待コードなしで始める相談に適用（個人の標準は5回：要件 3.2.5）。変更は、変更後に始めた相談から適用" },
  { key: "qa_discard_suspend", label: "投稿機能を止めるまでの破棄の回数", unit: "回", def: 3, min: 2, max: 50, note: "Q&A の投稿が破棄された回数がこの回数に達すると、その利用者の投稿機能を自動で止める。閲覧と相談は止めない（要件 6.4.6、未決事項 No.32）" },
  { key: "qa_return_max", label: "却下による投稿枠の返却（月あたり）", unit: "回", def: 2, min: 0, max: 2, note: "却下された投稿の枠を返す回数の上限（要件 6.4.6、未決事項 No.34）。2回より多くはできない" },
  { key: "qa_resubmit_max", label: "同じ投稿の書き直しの上限", unit: "回", def: 2, min: 0, max: 10, note: "却下（区分E）された投稿を書き直して再投稿できる回数（要件 6.4.3、未決事項 No.31）" },
  { key: "qa_report_auto_hide", label: "通報による自動の一時非公開", unit: "件", def: 5, min: 2, max: 1000, note: "未対応の通報がこの件数に達した記事を、自動で一時非公開にする（要件 2.8、未決事項 No.52）" },
  { key: "reuse_expire_days", label: "二次利用同意の依頼の期限", unit: "日", def: 30, min: 1, max: 365, note: "この日数のあいだ応答がない依頼は失効し、記事化の対象にしない（要件 7.13.3、未決事項 No.50）。変更は、変更後の依頼から適用" },
  { key: "disclosure_due_days", label: "開示請求の回答期限", unit: "日", def: 14, min: 1, max: 90, note: "受付からこの日数を回答期限として表示する（要件 7.13.2、未決事項 No.51）" },
];

export type Settings = Record<string, number>;

export async function getSettings(event: H3Event): Promise<Settings> {
  const { data, error } = await serviceDb(event).from("system_settings").select("setting_key, setting_value");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const stored = new Map((data ?? []).map((r: any) => [r.setting_key as string, r.setting_value as string]));
  const out: Settings = {};
  for (const d of SETTING_DEFS) {
    const raw = stored.get(d.key);
    const n = raw !== undefined && /^\d{1,6}$/.test(raw) ? Number(raw) : d.def;
    out[d.key] = Math.min(d.max, Math.max(d.min, n));
  }
  return out;
}

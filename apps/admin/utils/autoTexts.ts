// 画面・メッセージ内の自動文面（要件 7.14.3）の既定値。
// 管理側の「自動文面」画面で上書きできる（全体の既定／クライアント別）。上書きがないときは、ここの文面を使う。
// 相談者側（apps/consultation/utils/autoTexts.ts）と同じ定義。変えるときは両方を直すこと。
// 【仮】文案は暫定（未決事項 No.74）。緊急時の案内・開示範囲の説明は、ここでは扱わない（上書きを認めない固定の文面）
export const AUTO_TEXT_DEFAULTS: Record<string, string> = {
  accepted: "メッセージを受け付けました。お返事までの目安は {返信までの時間} です。",
  start_empty: "ご相談の準備ができました。下の欄から、お話しになりたいことをお送りください。うまくまとまっていなくても大丈夫です。",
  continuity_same: "前回と同じ担当がお受けします。",
  continuity_changed: "今回は、前回と別の担当がお受けします。",
  closed_rally: "今回のご相談のやり取りは、ここで一区切りとなりました。",
  closed_manual: "担当が、今回のご相談への対応を一区切りとしました。",
  closed_idle: "しばらくやり取りがなかったため、このご相談は終了しました。",
  closed_expiry: "有効期間が満了したため、このご相談は終了しました。",
  restart_guide: "お話ししたいことが残っている場合は、新しいご相談としてお受けします。費用のご負担はありません。",
  idle_notice: "しばらくやり取りがないため、{終了予定日} ごろに、このご相談は自動的に終了します。続きがある場合は、メッセージをお送りください。終了したあとも、新しいご相談はいつでも始められます。",
};

export function fillText(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{([^{}]+)\}/g, (all, name) => (name in vars ? vars[name] : all));
}

// 管理画面での表示名と、差し込める項目
export const AUTO_TEXT_LABELS: Record<string, { label: string; vars: string[] }> = {
  accepted: { label: "受付の自動応答（最初の送信の直後）", vars: ["返信までの時間"] },
  start_empty: { label: "相談を始めた直後の案内", vars: [] },
  continuity_same: { label: "担当が前回と同じとき", vars: [] },
  continuity_changed: { label: "担当が前回と違うとき", vars: [] },
  closed_rally: { label: "終了：やり取りの上限に達したとき", vars: [] },
  closed_manual: { label: "終了：相談員が対応を完了したとき", vars: [] },
  closed_idle: { label: "終了：しばらくやり取りがなかったとき", vars: [] },
  closed_expiry: { label: "終了：有効期間が満了したとき", vars: [] },
  restart_guide: { label: "終了後の、再開の案内", vars: [] },
  idle_notice: { label: "自動終了の予告", vars: ["終了予定日"] },
};

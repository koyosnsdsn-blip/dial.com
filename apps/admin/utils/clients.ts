// 契約クライアントの表示用ラベル
export const contractTypeLabel: Record<string, string> = { corp: "企業契約型", muni: "自治体委託型" };
export const clientStatusLabel: Record<string, string> = { prep: "準備中", active: "有効", closed: "終了" };

export function planLabel(c: { featureQa: boolean; featureConsult: boolean; featureVideo: boolean }): string {
  if (c.featureQa && c.featureConsult && c.featureVideo) return "フル";
  if (!c.featureQa && c.featureConsult && !c.featureVideo) return "相談のみ";
  if (!c.featureQa && !c.featureConsult && c.featureVideo) return "動画のみ";
  return "個別設定";
}

// 契約期間の満了が近いか（60日以内）。一覧での強調表示用（要件 7.10.1）
// 【仮】「近い」の日数は暫定
export function endsSoon(contractEnd: string | null, status: string, now = Date.now()): boolean {
  if (!contractEnd || status !== "active") return false;
  const days = (new Date(`${contractEnd}T23:59:59+09:00`).getTime() - now) / 86400000;
  return days <= 60;
}

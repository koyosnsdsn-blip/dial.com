// サイト全体の拒否リスト（未決事項一覧 2.18）。危険と名指しされた接続元からの、画面・APIへのアクセスを拒否する。
// 静的ファイル（/_nuxt/… の JavaScript・画像など）は CDN から直接返るため、ここを通らない（中身は公開情報）。
// 拒否した事実は、利用者に理由を細かく伝えない（攻撃者に判定の手がかりを与えない）。
export default defineEventHandler(async (event) => {
  if (await ipBlocked(event)) {
    setResponseStatus(event, 403);
    setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
    setResponseHeader(event, "Cache-Control", "no-store");
    return "Forbidden";
  }
});

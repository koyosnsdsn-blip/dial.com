// API の応答をブラウザや共有キャッシュに残さない（要件 10.4：共有端末で、ログアウト後に「戻る」で相談内容が見えないようにする）。
// 個別のAPIが自分で Cache-Control を指定する場合は、そちらが優先される（ハンドラーの実行はここより後）。
export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname.startsWith("/api/")) {
    setResponseHeader(event, "Cache-Control", "no-store");
  }
});

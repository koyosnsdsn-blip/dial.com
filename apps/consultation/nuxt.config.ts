// ダイヤル.com のアプリ（相談者側・運営画面・クライアント管理サイト）
// 2026-10-02 に、管理側アプリ（apps/admin）をこのアプリにまとめた。脆弱性診断の費用が対象のFQDNごとにかかるため、ホストを1つにする（ダイヤルさんの判断）。
//   相談者側           … /…
//   運営画面           … /ops/…（相談員・運営管理者。MFA必須）
//   クライアント管理サイト … /client-admin/…（MFA必須）
// 技術基盤設計書 1.2 の「アプリを分けて被害範囲を分離する」方針は、これにより変更になる（docs/未決事項一覧_統合版.md を参照）。
// ===== セキュリティヘッダー（点検 2026-10-15 の対応。docs/実装残り・穴の点検_2026-10-15.md 2-2） =====
// CSP は、まず Report-Only（違反を報告するだけで、止めない）で配信する。
// Nuxt が出力する埋め込みスクリプトのため script-src に 'unsafe-inline' を許している。違反の報告（/api/csp-report）を一通り確かめてから、
// 「Content-Security-Policy-Report-Only」を「Content-Security-Policy」に変えて強制に切り替える。
// frame-src は動画の埋め込み（server/utils/videos.ts が許可するホスト）に合わせている。
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src https://player.vimeo.com https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");
const SECURITY_HEADERS = {
  "Content-Security-Policy-Report-Only": CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
};
// ログイン後の画面は、ブラウザの「戻る」で相談内容の画面が再表示されないように、キャッシュさせない（要件 10.4）
const NO_STORE = { "Cache-Control": "no-store" };

export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  devtools: { enabled: true },

  modules: ["@nuxtjs/supabase"],

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    // モジュールは既定で SUPABASE_SERVICE_ROLE_KEY を拾ってビルド成果物に埋め込むため、明示的に空にする。
    // service role のクライアントは server/utils/db.ts で実行時に環境変数から作る
    secretKey: "",
    // 自動リダイレクトは使わず、middleware/auth.global.ts で制御する
    redirect: false,
    types: false,
    cookieOptions: {
      // 【仮】12時間でセッションCookieを失効させる。運営側（/ops・/client-admin）は別に8時間で打ち切る（ops/session.ts）。「ログイン状態を保持する」の選択肢は設けない（＝常に無効。要件 10.4）。
      // 無操作による自動ログアウトの時間は未決（未決事項 No.54）。確定後に見直す
      maxAge: 60 * 60 * 12,
      sameSite: "lax",
      secure: true,
    },
  },

  // ログイン後の画面はサーバー側でHTMLを生成しない。
  // 相談内容がサーバー生成のHTMLやそのキャッシュに混入する経路をなくすため（運営画面と同じ考え方）。
  // 公開ページ（トップ・緊急時の案内）だけサーバー側で生成する。緊急時の案内はJavaScriptが動かなくても読める
  routeRules: {
    "/**": { headers: SECURITY_HEADERS },
    "/start/**": { ssr: false },
    "/login": { ssr: false },
    "/signup": { ssr: false },
    "/confirm": { ssr: false },
    "/forgot": { ssr: false },
    "/update-password": { ssr: false },
    "/invite": { ssr: false },
    "/contact": { ssr: false },
    "/consult/**": { ssr: false, headers: NO_STORE },
    "/consult": { ssr: false, headers: NO_STORE },
    "/mypage/**": { ssr: false, headers: NO_STORE },
    "/mypage": { ssr: false, headers: NO_STORE },
    // 【仮】Q&A は公開ページだが、いまはブラウザ側で表示している。検索エンジン向けにサーバー側で生成するかは、公開時に見直す
    "/qa/**": { ssr: false },
    "/qa": { ssr: false },
    "/videos/**": { ssr: false },
    "/videos": { ssr: false },
    "/c/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    // 運営画面・クライアント管理サイトは、全画面ログイン必須・検索エンジン対象外。サーバー側でHTMLを生成しない
    // （利用者の情報がサーバー生成のHTMLに混入する経路をなくし、認証の判定もブラウザ側の1か所に集約する）
    "/ops": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow", ...NO_STORE } },
    "/ops/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow", ...NO_STORE } },
    "/client-admin": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow", ...NO_STORE } },
    "/client-admin/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow", ...NO_STORE } },
  },

  runtimeConfig: {
    // サーバー側のみで参照可能（server/api/ 内）
    // 値はビルド時に埋め込まず、実行時に環境変数 SUPABASE_SERVICE_ROLE_KEY から読む（server/utils/db.ts）。
    // ビルド成果物に秘密鍵を残さないため。Production 環境にのみ設定する（CLAUDE.md 制約#4）
    supabaseServiceRoleKey: "",
    public: {
      // クライアント側にも公開される値。anonキーはRLS前提のため公開可
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      // ニックネーム登録で使う内部用の識別子のドメイン（apps/consultation/utils/nickname.ts を参照）。
      // 一度決めたら変えないこと
      nicknameDomain: process.env.NICKNAME_DOMAIN || "dialcom-op-dev.vercel.app",
    },
  },

  nitro: {
    // Node.jsサーバーレスランタイム（既定）を維持する。
    // 技術基盤設計書 1.3：Edge Runtimeはリージョン固定が効かないため、
    // データを扱うサーバールートでは絶対に指定しないこと。
  },

  typescript: {
    strict: true,
  },
});

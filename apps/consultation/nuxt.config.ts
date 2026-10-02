// ダイヤル.com のアプリ（相談者側・運営画面・クライアント管理サイト）
// 2026-10-02 に、管理側アプリ（apps/admin）をこのアプリにまとめた。脆弱性診断の費用が対象のFQDNごとにかかるため、ホストを1つにする（ダイヤルさんの判断）。
//   相談者側           … /…
//   運営画面           … /ops/…（相談員・運営管理者。MFA必須）
//   クライアント管理サイト … /client-admin/…（MFA必須）
// 技術基盤設計書 1.2 の「アプリを分けて被害範囲を分離する」方針は、これにより変更になる（docs/未決事項一覧_統合版.md を参照）。
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
    "/start/**": { ssr: false },
    "/login": { ssr: false },
    "/signup": { ssr: false },
    "/confirm": { ssr: false },
    "/forgot": { ssr: false },
    "/update-password": { ssr: false },
    "/invite": { ssr: false },
    "/contact": { ssr: false },
    "/consult/**": { ssr: false },
    "/consult": { ssr: false },
    "/mypage/**": { ssr: false },
    "/mypage": { ssr: false },
    // 【仮】Q&A は公開ページだが、いまはブラウザ側で表示している。検索エンジン向けにサーバー側で生成するかは、公開時に見直す
    "/qa/**": { ssr: false },
    "/qa": { ssr: false },
    "/videos/**": { ssr: false },
    "/videos": { ssr: false },
    "/c/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    // 運営画面・クライアント管理サイトは、全画面ログイン必須・検索エンジン対象外。サーバー側でHTMLを生成しない
    // （利用者の情報がサーバー生成のHTMLに混入する経路をなくし、認証の判定もブラウザ側の1か所に集約する）
    "/ops": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    "/ops/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    "/client-admin": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    "/client-admin/**": { ssr: false, headers: { "X-Robots-Tag": "noindex, nofollow" } },
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

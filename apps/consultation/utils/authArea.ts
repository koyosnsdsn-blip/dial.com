// 認証Cookieを、画面の領域（相談者側・運営画面・クライアント管理サイト）ごとに分ける（2026-10-07 ダイヤルさんの指示）。
//
// 1つのホストにまとめた（未決事項一覧 2.13）あと、ログイン情報のCookieが1つだけだったため、
// 同じブラウザで相談者と運営画面に同時にログインできなかった。領域ごとに別のCookieを使い、互いに影響しないようにする。
//
//   user   相談者側（/…）                      … Cookie 名はモジュールの既定（これまでと同じ。相談者の再ログインは不要）
//   ops    運営画面（/ops/…、/api/ops/…）       … sb-ops-auth-token
//   client クライアント管理サイト（/client-admin/…、/api/client-admin/…） … sb-client-auth-token
//
// ブラウザ側は ops/authClient.ts で領域ごとのクライアントを使い分け、サーバー側は server/ops/session.ts で
// リクエストのパスから読む Cookie を選ぶ。どの領域のAPIも、自分の領域のCookieしか読まない。
export type AuthArea = "user" | "ops" | "client";

export const AUTH_COOKIE_NAME: Record<"ops" | "client", string> = {
  ops: "sb-ops-auth-token",
  client: "sb-client-auth-token",
};

// 画面のパス、またはAPIのパスから、領域を決める
export function areaOfPath(path: string): AuthArea {
  const p = path.split("?")[0].split("#")[0];
  if (p === "/ops" || p.startsWith("/ops/") || p === "/api/ops" || p.startsWith("/api/ops/")) return "ops";
  if (p === "/client-admin" || p.startsWith("/client-admin/") || p === "/api/client-admin" || p.startsWith("/api/client-admin/")) return "client";
  return "user";
}

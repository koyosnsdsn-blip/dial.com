// 領域ごとのブラウザ用 Supabase クライアント（認証Cookieを領域ごとに分ける。utils/authArea.ts を参照）。
//   user   … @nuxtjs/supabase が作るクライアント（useSupabaseClient）。Cookie 名は従来どおり
//   ops / client … ここで作る。Cookie 名が別で、運営側の8時間の上限に合わせた有効期限にする
// @supabase/ssr の createBrowserClient は、ブラウザでは既定で1つのインスタンスを使い回す（isSingleton）。
// 領域ごとに別のインスタンスが必要なので、isSingleton: false にして、ここで領域ごとに1つだけ保持する。
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_NAME, areaOfPath, type AuthArea } from "../utils/authArea";

const clients = new Map<"ops" | "client", SupabaseClient>();

export function authClient(area: AuthArea): SupabaseClient {
  if (area === "user") return useSupabaseClient() as unknown as SupabaseClient;
  const existing = clients.get(area);
  if (existing) return existing;
  const cfg = useRuntimeConfig().public.supabase as any;
  const client = createBrowserClient(cfg.url, cfg.key, {
    ...cfg.clientOptions,
    auth: {
      ...(cfg.clientOptions?.auth ?? {}),
      // 招待リンクのハッシュは accept-invite 画面が自分で読む。複数のクライアントが同じ URL を読んで競合しないようにする
      detectSessionInUrl: false,
    },
    // Cookie 自体の有効期限は @supabase/ssr が固定で長く設定する。運営側の8時間の上限は、トークンの認証時刻から ops/guard.ts と server/ops/auth.ts が判定する
    cookieOptions: { ...cfg.cookieOptions, name: AUTH_COOKIE_NAME[area] },
    isSingleton: false,
  }) as unknown as SupabaseClient;
  clients.set(area, client);
  return client;
}

// いま開いている画面の領域のクライアント
export function authClientForRoute(path?: string): SupabaseClient {
  return authClient(areaOfPath(path ?? useRoute().path));
}

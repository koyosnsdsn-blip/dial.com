// 運営画面・クライアント管理サイトのサーバーAPIが、領域ごとの認証Cookieを読むための処理（utils/authArea.ts を参照）。
// @nuxtjs/supabase の serverSupabaseClient / serverSupabaseUser は Cookie 名が1つに固定なので、
// 運営側は、この処理で Cookie 名を指定して同じ作りのクライアントを作る。
//   /api/ops/…           → sb-ops-auth-token
//   /api/client-admin/…  → sb-client-auth-token
// どちらの領域のAPIも、相談者側の Cookie は読まない。
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { H3Event } from "h3";
import { appendResponseHeader, createError, getHeader, setResponseHeader } from "h3";
import { AUTH_COOKIE_NAME, areaOfPath } from "../../utils/authArea";

// このリクエストの領域（運営画面かクライアント管理サイトか）。どちらでもないパスで呼ばれたら、設計の誤りなので拒否する
export function staffAreaOf(event: H3Event): "ops" | "client" {
  const area = areaOfPath(event.path);
  if (area === "user") throw createError({ statusCode: 500, statusMessage: "invalid_area" });
  return area;
}

export function areaSupabaseClient(event: H3Event, area: "ops" | "client" = staffAreaOf(event)): SupabaseClient {
  const key = `_supabaseClient_${area}`;
  const ctx = event.context as Record<string, any>;
  if (!ctx[key]) {
    const cfg = useRuntimeConfig(event).public.supabase as any;
    ctx[key] = createServerClient(cfg.url, cfg.key, {
      auth: cfg.clientOptions?.auth ?? {},
      cookies: {
        getAll: () => parseCookieHeader(getHeader(event, "Cookie") ?? ""),
        // トークンを更新したときに、新しい値を Cookie に書き戻す
        setAll: (cookies, headers) => {
          for (const { name, value, options } of cookies) {
            appendResponseHeader(event, "set-cookie", serializeCookieHeader(name, value, options));
          }
          for (const [k, v] of Object.entries(headers ?? {})) setResponseHeader(event, k, v as string);
        },
      },
      cookieOptions: { ...cfg.cookieOptions, name: AUTH_COOKIE_NAME[area] },
    });
  }
  return ctx[key] as SupabaseClient;
}

// セッションの中身（JWT のクレーム）。署名の検証は Supabase 側の鍵で行う（getClaims）。セッションがなければ null
export async function areaClaims(event: H3Event, area: "ops" | "client" = staffAreaOf(event)): Promise<Record<string, any> | null> {
  const { data, error } = await areaSupabaseClient(event, area).auth.getClaims();
  if (error) throw createError({ statusMessage: error.message });
  return (data?.claims as Record<string, any> | undefined) ?? null;
}

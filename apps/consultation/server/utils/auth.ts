// 相談者側サーバーAPIの本人確認。ログインが必要なAPIは必ず冒頭で requireAccount() を呼ぶこと。
//
// - Supabase Auth のセッション（Cookie）があること。メールアドレスの確認が済んでいない利用者にはセッションが発行されない
// - 初回の呼び出しで accounts の行を作る（氏名は持たない：要件 3.10.5）
// - 利用者の多要素認証は任意（要件 8.8.4）のため、aal は検査しない
//
// accounts の読み取りは本人の権限（RLS：本人の行のみ）で行い、行の作成だけ service role を使う。
import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";
import { isNicknameEmail, roleOfLoginEmail } from "../../utils/nickname";

export type AccountContext = {
  userId: string;
  email: string | null;
  // ニックネームで登録した利用者のニックネーム（メールアドレスで登録した利用者は null）
  nickname: string | null;
  tier: "free" | "paid" | "member";
  clientId: string | null;
};

export async function requireAccount(event: H3Event): Promise<AccountContext> {
  let claims: Record<string, any> | null = null;
  try {
    claims = (await serverSupabaseUser(event)) as Record<string, any> | null;
  } catch {
    claims = null;
  }
  if (!claims?.sub) {
    throw createError({ statusCode: 401, statusMessage: "signed_out" });
  }
  const userId = claims.sub as string;

  // ログインIDの接頭辞が相談員（s-）・クライアント管理者（c-）のアカウントは、相談者側を利用できない
  // （役割ごとにアカウントを分けているため。相談者側に accounts の行が作られることも防ぐ）
  const loginRole = roleOfLoginEmail(claims.email, useRuntimeConfig(event).public.nicknameDomain as string);
  if (loginRole === "staff" || loginRole === "client_admin") {
    throw createError({ statusCode: 403, statusMessage: "staff_account" });
  }

  // 運営側（相談員・運営管理者）のアカウントでは、相談者側を利用できないようにする。
  // 運営側のアカウントは、多要素認証を通過したセッションでしか相談内容を読めない（DBの制約）。
  // 相談者側のログインは多要素認証を求めないため、そのまま使うと自分の送ったメッセージも表示されない状態になる。
  // 【仮】利用者としての相談が必要な場合は、別のメールアドレスで登録してもらう
  const { data: staffRow, error: staffError } = await serviceDb(event)
    .from("counselors")
    .select("counselor_id")
    .eq("counselor_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (staffError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (staffRow) throw createError({ statusCode: 403, statusMessage: "staff_account" });

  const db = await userDb(event);

  const read = () =>
    db.from("accounts").select("account_id, email, tier, client_id, deleted_at").eq("account_id", userId).maybeSingle();

  let { data, error } = await read();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  if (!data) {
    const email = typeof claims.email === "string" ? claims.email : null;
    const { error: insertError } = await serviceDb(event)
      .from("accounts")
      .upsert({ account_id: userId, email }, { onConflict: "account_id", ignoreDuplicates: true });
    if (insertError) {
      console.error("[account] failed to create account row", insertError.code);
      throw createError({ statusCode: 500, statusMessage: "account_create_failed" });
    }
    ({ data, error } = await read());
    if (error || !data) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  // メールアドレスを変更した場合（要件 10.3.2）、確認が済むと Supabase Auth 側のアドレスが変わる。accounts にも反映する
  const authEmail = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  if (authEmail && !data.deleted_at && (data.email ?? "").toLowerCase() !== authEmail) {
    const { error: syncError } = await serviceDb(event).from("accounts").update({ email: authEmail }).eq("account_id", userId);
    if (syncError) console.error("[account] failed to sync email", syncError.code);
    else data.email = authEmail;
  }

  if (data.deleted_at) {
    throw createError({ statusCode: 403, statusMessage: "account_deleted" });
  }
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const nickname = typeof meta.nickname === "string" ? meta.nickname : null;
  return { userId, email: data.email, nickname, tier: data.tier, clientId: data.client_id };
}

export type Membership = {
  // 相談を開始できる状態か（有効な契約クライアントに所属し、そのクライアントで相談機能が有効）
  canConsult: boolean;
  // 招待コードなしで相談できる利用者か（ニックネームで登録した、所属のない利用者。費用はかからない）
  personalFree: boolean;
  contractType: "corp" | "muni" | null;
  rallyMax: number;
  slaHours: number;
};

// 所属クライアントの契約状態。clients はブラウザに権限を与えていないため service role で読む。
// クライアントの名称・ロゴは返さない（ログイン後の画面には表示しない：要件 8.6.2）
export async function membership(event: H3Event, account: AccountContext): Promise<Membership> {
  const none: Membership = { canConsult: false, personalFree: false, contractType: null, rallyMax: 0, slaHours: 0 };
  if (!account.clientId) {
    // 【仮】ニックネームで登録した利用者は、招待コードなしで相談を始められる（2026-10-01 入江さんの指示）。
    // 判定は、登録時にサーバーが作った内部用の識別子（メールアドレスの形）で行う。利用者が自分で書き換えられる
    // ニックネームの表示名（user_metadata）では判定しない。
    // メールアドレスで登録した利用者は、これまでどおり招待コード（または今後の決済）が必要
    if (!isNicknameEmail(account.email, useRuntimeConfig(event).public.nicknameDomain as string)) return none;
    const { data: s } = await serviceDb(event).from("system_settings").select("setting_value").eq("setting_key", "personal_rally_max").maybeSingle();
    const n = s && /^\d{1,2}$/.test(s.setting_value ?? "") ? Number(s.setting_value) : 5;
    return { canConsult: true, personalFree: true, contractType: null, rallyMax: Math.min(10, Math.max(1, n)), slaHours: 24 };
  }
  if (account.tier !== "member") return none;
  const { data, error } = await serviceDb(event)
    .from("clients")
    .select("status, contract_type, feature_consult, rally_max, sla_hours")
    .eq("client_id", account.clientId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data || data.status !== "active" || !data.feature_consult) return none;
  return { canConsult: true, personalFree: false, contractType: data.contract_type, rallyMax: data.rally_max, slaHours: data.sla_hours };
}

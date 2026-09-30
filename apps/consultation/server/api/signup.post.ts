// 新規登録（ニックネームとパスワードのみ）
//
// 【2026-09-30 入江さんの指示による仕様変更】要件 8.4 は「メールアドレス・パスワードで登録し、メール認証を行う」だが、
// 相談を始めるまでの手数を減らすため、メールアドレスを求めない方式に変更した。
// メールアドレスを使わないことによる制約（パスワードを忘れると再設定できない、返信の通知を送れない）は
// docs/未決事項一覧_統合版.md 2.12 に記載。
//
// 仕組み：ニックネームから内部用の識別子を作り（utils/nickname.ts）、Supabase Auth の管理APIでユーザーを作る。
// メールの確認は行えないため、確認済みとして作成する。登録後は、ブラウザ側で通常のログインを行う。
// プロジェクト全体の「メールアドレスの確認」の設定は変えない（運営側の招待などには引き続き適用される）。
import { createHash } from "node:crypto";
import { nicknameProblem, nicknameToEmail, normalizeNickname } from "../../utils/nickname";

// 【仮】自動登録（ボット）対策：同じ接続元からの登録は1時間に5件まで
const MAX_SIGNUPS_PER_HOUR = 5;

export default defineEventHandler(async (event) => {
  const body = await readBody<{ nickname?: unknown; password?: unknown }>(event);
  const nickname = typeof body?.nickname === "string" ? body.nickname : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const problem = nicknameProblem(nickname);
  if (problem) throw createError({ statusCode: 400, statusMessage: `nickname_${problem}` });
  if (password.length < 8 || password.length > 72) throw createError({ statusCode: 400, statusMessage: "password_length" });

  const db = serviceDb(event);

  // 接続元ごとの回数制限。IPアドレスそのものは保存せず、日付を混ぜたハッシュの一部だけを記録する（日をまたぐと照合できない）
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const source = `src:${createHash("sha256").update(`${ip}|${day}`).digest("hex").slice(0, 16)}`;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("audit_logs")
    .select("log_id", { count: "exact", head: true })
    .eq("actor_type", "system")
    .eq("action", "account.signup")
    .eq("reason", source)
    .gte("acted_at", since);
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) >= MAX_SIGNUPS_PER_HOUR) throw createError({ statusCode: 429, statusMessage: "too_many_signups" });

  const email = await nicknameToEmail(nickname, useRuntimeConfig(event).public.nicknameDomain as string);
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: normalizeNickname(nickname) },
  });
  if (error || !data.user) {
    const code = (error as any)?.code as string | undefined;
    if (code === "email_exists" || code === "user_already_exists" || /already (been )?registered/i.test(error?.message ?? "")) {
      throw createError({ statusCode: 409, statusMessage: "nickname_taken" });
    }
    if (code === "weak_password") throw createError({ statusCode: 400, statusMessage: "weak_password" });
    // email_address_invalid は、内部用の識別子のドメイン（NICKNAME_DOMAIN）を Supabase が受け付けなかった場合に出る
    console.error("[signup] createUser failed", code, error?.status);
    throw createError({ statusCode: 500, statusMessage: "signup_failed" });
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_type: "system",
    actor_id: data.user.id,
    action: "account.signup",
    target_type: "accounts",
    target_id: data.user.id,
    reason: source,
  });
  if (auditError) console.error("[signup] failed to write audit log", auditError.code);

  return { ok: true };
});

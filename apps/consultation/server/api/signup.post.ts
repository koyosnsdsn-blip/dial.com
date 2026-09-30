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
// 【仮】招待コードの総当たり対策：同じ接続元からの、招待コード誤りによる登録失敗は1時間に10件まで
const MAX_CODE_FAILURES_PER_HOUR = 10;

export default defineEventHandler(async (event) => {
  const body = await readBody<{ nickname?: unknown; password?: unknown; inviteCode?: unknown }>(event);
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";
  if (inviteCode.length > 200) throw createError({ statusCode: 400, statusMessage: "invalid_code" });
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

  // 招待コードが入力されている場合は、アカウントを作る前に確かめる（コードが誤っているのに登録だけ済んでしまうのを防ぐ）
  if (inviteCode) {
    const { count: failures, error: failError } = await db
      .from("audit_logs")
      .select("log_id", { count: "exact", head: true })
      .eq("actor_type", "system")
      .eq("action", "account.signup.code_failed")
      .eq("reason", source)
      .gte("acted_at", since);
    if (failError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    if ((failures ?? 0) >= MAX_CODE_FAILURES_PER_HOUR) throw createError({ statusCode: 429, statusMessage: "too_many_attempts" });

    const { data: client, error: clientError } = await db
      .from("clients")
      .select("client_id")
      .eq("invite_code", inviteCode)
      .eq("status", "active")
      .maybeSingle();
    if (clientError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    if (!client) {
      // 入力されたコードそのものは記録しない
      await db.from("audit_logs").insert({ actor_type: "system", action: "account.signup.code_failed", target_type: "accounts", reason: source });
      throw createError({ statusCode: 400, statusMessage: "invalid_code" });
    }
  }

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

  // 招待コードによる所属の登録（アカウントの行を作ってから紐付ける）。
  // ここで失敗しても登録自体は完了しているので、ログイン後の画面から入力し直せる
  let linked = false;
  if (inviteCode) {
    const { error: accountError } = await db
      .from("accounts")
      .upsert({ account_id: data.user.id, email }, { onConflict: "account_id", ignoreDuplicates: true });
    if (!accountError) {
      const { error: linkError } = await db.rpc("user_link_client", { p_account_id: data.user.id, p_code: inviteCode });
      if (!linkError) {
        linked = true;
        await db.from("audit_logs").insert({
          actor_type: "account",
          actor_id: data.user.id,
          action: "client.link",
          target_type: "accounts",
          target_id: data.user.id,
        });
      } else {
        console.error("[signup] link failed", linkError.code);
      }
    }
  }

  return { ok: true, linked };
});

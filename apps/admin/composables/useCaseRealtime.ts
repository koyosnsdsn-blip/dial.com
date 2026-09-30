// 案件の変更（緊急フラグの設定・解除、案件の追加・状態変化、メッセージの新着）を Supabase Realtime で受け取る。
// CLAUDE.md 制約#5：緊急フラグの通知はポーリングにせず Realtime で即時配信する。
//
// 受け取った変更の中身（行データ）はそのまま画面に使わず、「変わった」という合図としてだけ扱い、
// 表示内容はサーバーAPI（/api/cases 等）から取り直す。サーバーAPI側で監査ログを残すため。
//
// 配信範囲は RLS に従う：相談員は担当案件のみ、運営管理者は全案件。MFA未通過のセッションには配信されない。
import type { RealtimeChannel } from "@supabase/supabase-js";

export type RealtimeStatus = "connecting" | "live" | "error";

export function useCaseRealtime(onChange: (kind: "case" | "message", caseId: string | null) => void) {
  const supabase = useSupabaseClient();
  const status = ref<RealtimeStatus>("connecting");
  let channel: RealtimeChannel | null = null;

  onMounted(async () => {
    // Realtime の接続に、MFA 通過後（aal2）のアクセストークンを明示的に渡す
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await supabase.realtime.setAuth(data.session.access_token);
    }

    channel = supabase
      .channel("staff-cases")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, (payload: any) => {
        onChange("case", (payload.new?.case_id ?? payload.old?.case_id ?? null) as string | null);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        onChange("message", (payload.new?.case_id ?? null) as string | null);
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") status.value = "live";
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") status.value = "error";
      });
  });

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel);
  });

  return { status };
}

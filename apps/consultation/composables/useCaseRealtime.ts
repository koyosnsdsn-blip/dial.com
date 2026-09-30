// 相談員からの返信・相談の終了を Supabase Realtime で受け取る。
// 受け取った行データはそのまま画面に使わず、「変わった」という合図としてだけ扱い、
// 表示内容はサーバーAPI（/api/cases/...）から取り直す。サーバーAPI側で監査ログを残すため（CLAUDE.md 制約#1）。
// 配信範囲は RLS に従う：本人の案件とそのメッセージのみ。
import type { RealtimeChannel } from "@supabase/supabase-js";

export function useCaseRealtime(onChange: () => void) {
  const supabase = useSupabaseClient();
  let channel: RealtimeChannel | null = null;

  onMounted(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await supabase.realtime.setAuth(data.session.access_token);
    }
    channel = supabase
      .channel("my-case")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cases" }, () => onChange())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => onChange())
      .subscribe();
  });

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel);
  });
}

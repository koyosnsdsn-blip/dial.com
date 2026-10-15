// 案件の変更（緊急フラグの設定・解除、案件の追加・状態変化、メッセージの新着）を Supabase Realtime で受け取る。
// CLAUDE.md 制約#5：緊急フラグの通知はポーリングにせず Realtime で即時配信する。
//
// 受け取った変更の中身（行データ）はそのまま画面に使わず、「変わった」という合図としてだけ扱い、
// 表示内容はサーバーAPI（/api/cases 等）から取り直す。サーバーAPI側で監査ログを残すため。
//
// 配信範囲は RLS に従う：相談員は担当案件のみ、運営管理者は全案件。MFA未通過のセッションには配信されない。
import type { RealtimeChannel } from "@supabase/supabase-js";
import { authClient } from "./authClient";
import { noteUrgent, playNotifySound } from "./notifySound";
import { useTestFilter } from "./testFilter";

export type RealtimeStatus = "connecting" | "live" | "error";

export function useCaseRealtime(onChange: (kind: "case" | "message", caseId: string | null) => void) {
  // 運営画面の認証Cookie（sb-ops-auth-token）のセッションで購読する
  const supabase = authClient("ops");
  const status = ref<RealtimeStatus>("connecting");
  const testMode = useTestFilter();
  // テスト案件の案件ID。テストの案件では通知音を鳴らさない（事前に知らされていない相談員が、テストの音に反応しないように）。
  // ただし「テストのみ」を表示している間は、テストを確かめている最中なので鳴らす
  const testCases = new Set<string>();
  const muted = (caseId: string | null | undefined) => Boolean(caseId) && testCases.has(caseId as string) && testMode.value !== "only";
  let channel: RealtimeChannel | null = null;

  onMounted(async () => {
    // 先にテスト案件のIDを読み込む。読めなかったときは、テストの区別なく従来どおり鳴らす
    try {
      for (const id of await $fetch<string[]>("/api/ops/test-case-ids")) testCases.add(id);
    } catch {
      /* 通知音の判定だけに使うため、失敗しても続ける */
    }
    // Realtime の接続に、MFA 通過後（aal2）のアクセストークンを明示的に渡す
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await supabase.realtime.setAuth(data.session.access_token);
    }

    channel = supabase
      .channel("staff-cases")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, (payload: any) => {
        // 通知音（運営画面の「通知音」が ON のときだけ鳴る）。行データは音の種類を決めるためだけに使い、画面には出さない
        // 案件のテスト区分を控える（新しい案件・区分が変わった案件）
        if (payload.new?.case_id) {
          if (payload.new.is_test) testCases.add(payload.new.case_id);
          else testCases.delete(payload.new.case_id);
        }
        const silent = muted(payload.new?.case_id);
        if (payload.eventType === "INSERT") {
          if (!silent) playNotifySound("case");
        } else if (payload.eventType === "UPDATE" && payload.new?.case_id && payload.new.status === "open") {
          if (noteUrgent(payload.new.case_id, Boolean(payload.new.urgent_flag)) && !silent) playNotifySound("urgent");
        }
        onChange("case", (payload.new?.case_id ?? payload.old?.case_id ?? null) as string | null);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        // 利用者からのメッセージだけ鳴らす（相談員自身の送信では鳴らさない）
        if (payload.new?.sender === "user" && !muted(payload.new?.case_id)) playNotifySound("message");
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

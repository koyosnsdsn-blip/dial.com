// 自動文面（要件 7.14.3）。管理側で上書きされた文面があればそれを、なければ既定の文面を返す。
// 取得に失敗しても、既定の文面で表示を続ける
export const useAutoTextOverrides = () => useState<Record<string, string> | null>("auto-texts", () => null);

export async function loadAutoTexts(): Promise<void> {
  const state = useAutoTextOverrides();
  if (state.value) return;
  try {
    state.value = await $fetch<Record<string, string>>("/api/texts");
  } catch {
    state.value = {};
  }
}

export function autoText(key: string, vars: Record<string, string> = {}): string {
  const overrides = useAutoTextOverrides().value ?? {};
  return fillText(overrides[key] ?? AUTO_TEXT_DEFAULTS[key] ?? "", vars);
}

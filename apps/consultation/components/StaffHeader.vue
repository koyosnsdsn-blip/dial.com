<script setup lang="ts">
import { signOut, useStaff } from "../ops/useStaff";
import { initNotifySound, playNotifySound, prefsSaveError, prefsState, setKindEnabled, setSoundEnabled, soundEnabled, soundKinds, soundLocked, type SoundKind } from "../ops/notifySound";
const staff = useStaff();
const isAdmin = computed(() => staff.value?.role === "admin");
const roleLabel = computed(() => (isAdmin.value ? "運営管理者" : "相談員"));
// 通知音：鳴らすか・どの種類を鳴らすかは、本人が決める（本人のアカウントに保存。別の相談員の設定には影響しない）
watch(() => staff.value?.userId, (id) => id && initNotifySound(id), { immediate: true });
const KINDS: { kind: SoundKind; label: string }[] = [
  { kind: "message", label: "利用者からの新着メッセージ" },
  { kind: "case", label: "新しい案件" },
  { kind: "urgent", label: "緊急案件" },
];
</script>

<template>
  <header class="staff-header">
    <nav class="nav">
      <NuxtLink to="/ops" class="brand">ダイヤル.com 管理</NuxtLink>
      <NuxtLink to="/ops">ダッシュボード</NuxtLink>
      <NuxtLink to="/ops/qa">Q&amp;A</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/clients">契約クライアント</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/staff">相談員の管理</NuxtLink>
      <NuxtLink to="/ops/menu">運営メニュー</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/audit">監査ログ</NuxtLink>
    </nav>
    <div class="who">
      <span v-if="soundEnabled && soundLocked" class="sound-hint" role="status">音を出すには、画面を一度クリックしてください</span>
      <details class="notify">
        <summary :aria-label="soundEnabled ? '通知音の設定（ON）' : '通知音の設定（OFF）'">{{ soundEnabled ? "🔔 通知音 ON" : "🔕 通知音 OFF" }}</summary>
        <div class="notify-panel">
          <p v-if="prefsState === 'error'" class="error-text" role="alert">設定を読み込めませんでした。ページを再読み込みしてください（それまで音は鳴りません）</p>
          <label class="check">
            <input type="checkbox" :checked="soundEnabled" :disabled="prefsState !== 'ready'" @change="setSoundEnabled(($event.target as HTMLInputElement).checked)" />
            通知音を鳴らす
          </label>
          <p class="hint">鳴らすものを選べます。「▶ 試す」で音を確認できます（いまは仮の音です）。この設定はあなたのアカウントだけに保存され、他の相談員には影響しません。</p>
          <div v-for="k in KINDS" :key="k.kind" class="kind">
            <label class="check">
              <input type="checkbox" :checked="soundKinds[k.kind]" :disabled="!soundEnabled || prefsState !== 'ready'" @change="setKindEnabled(k.kind, ($event.target as HTMLInputElement).checked)" />
              {{ k.label }}
            </label>
            <button type="button" class="secondary small" :aria-label="`${k.label}の音を試す`" @click="playNotifySound(k.kind, { force: true })">▶ 試す</button>
          </div>
          <p v-if="prefsSaveError" class="error-text" role="alert">設定を保存できませんでした。もう一度お試しください</p>
        </div>
      </details>
      <span v-if="staff">{{ staff.name }}（{{ roleLabel }}）</span>
      <button class="secondary small" type="button" @click="signOut">ログアウト</button>
    </div>
  </header>
</template>

<style scoped>
.staff-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.nav { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 14px; }
.nav a { color: var(--muted); text-decoration: none; }
.nav a.router-link-exact-active { color: var(--fg); font-weight: 600; }
.nav a.router-link-active:not([href="/ops"]) { color: var(--fg); font-weight: 600; }
.nav .brand { font-weight: 700; color: var(--fg); margin-right: 8px; }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.notify { position: relative; }
.notify summary { cursor: pointer; font-size: 13px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; list-style: none; user-select: none; }
.notify-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 10; width: 300px; padding: 12px; background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); }
.notify-panel label.check { display: flex; flex: 1; align-items: center; gap: 8px; font-size: 14px; margin: 4px 0; font-weight: 400; }
.notify-panel input[type="checkbox"] { width: auto; flex: none; margin: 0; }
.notify-panel button { width: auto; margin: 0; white-space: nowrap; }
.notify-panel .hint { margin: 6px 0 8px; font-size: 12px; color: var(--muted); }
.notify-panel .kind { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.error-text { color: var(--danger); font-size: 12px; margin: 4px 0; }
.sound-hint { color: var(--danger); font-size: 12px; }
button.small { margin: 0; width: auto; padding: 6px 12px; font-size: 13px; }
</style>

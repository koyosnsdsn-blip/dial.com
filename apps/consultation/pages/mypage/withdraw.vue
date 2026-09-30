<script setup lang="ts">
// 退会（要件 10.3.3）。消える情報と残る情報を明示し、確認の文言の入力を求める。
const me = useMe();
const confirmText = ref("");
const busy = ref(false);
const errorMessage = ref("");
const done = ref(false);

onMounted(async () => {
  try {
    await loadMe();
  } catch {
    /* 表示用のため、取得できなくても続行する */
  }
});

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/withdraw", { method: "POST", body: { confirm: confirmText.value } });
    done.value = true;
    // ログイン情報を消す（サーバー側ではすでに無効になっている）
    await useSupabaseClient().auth.signOut({ scope: "local" });
    useMe().value = null;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader v-if="!done" />
    <main class="page narrow">
      <h1>退会</h1>
      <div v-if="done" class="card stack">
        <p><strong>退会の手続きが完了しました。</strong></p>
        <p class="note">ご利用ありがとうございました。また必要になったときは、いつでも新しく登録してご利用いただけます。</p>
        <a class="button secondary" href="/">トップへ</a>
      </div>
      <form v-else class="card" @submit.prevent="submit">
        <p v-if="me?.openCaseId" class="notice warn"><strong>対応中のご相談があります。</strong>退会すると、このご相談は終了し、相談員からのお返事は受け取れなくなります。</p>
        <h2>退会すると消えるもの</h2>
        <ul>
          <li>これまでのご相談のやり取り（すぐに見えなくなり、一定期間ののちに完全に消去されます）</li>
          <li>ニックネーム・メールアドレス・パスワードなどの登録情報</li>
          <li>はじめにお答えいただいた内容（年代など）</li>
        </ul>
        <h2>残るもの</h2>
        <ul>
          <li>いつ・どの操作が行われたかの記録（お名前やニックネームは含みません）</li>
        </ul>
        <p class="note">記録を手元に残したい場合は、先にマイページの「データをファイルに保存する」をご利用ください。退会は取り消せません。</p>
        <label class="field" for="confirm">確認のため「退会する」と入力してください</label>
        <input id="confirm" v-model="confirmText" type="text" autocomplete="off" />
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" class="danger" :disabled="busy || confirmText !== '退会する'" style="margin-top: 16px">{{ busy ? "手続きしています…" : "退会する" }}</button>
        <NuxtLink class="button secondary" to="/mypage" style="margin-top: 10px">やめる</NuxtLink>
      </form>
    </main>
  </div>
</template>

<style scoped>
ul { margin: 0 0 12px; padding-left: 1.2em; }
button.danger { background: var(--danger); border-color: var(--danger); }
</style>

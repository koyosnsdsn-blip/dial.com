<script setup lang="ts">
// メールアドレスの変更（要件 10.3.2）
// 新しいアドレスへ確認メールを送り、リンクを開いた時点で変更が確定する。相談の記録はそのまま引き継がれる。
// 変更前のアドレスへの通知は、Supabase Auth の「Secure email change」（変更前後の両方で確認）の設定による。
const supabase = useSupabaseClient();
const me = useMe();
const email = ref("");
const busy = ref(false);
const sent = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  if (!me.value) {
    try {
      await loadMe();
    } catch {
      /* 表示用のため、取得できなくても続行する */
    }
  }
});

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const { error } = await supabase.auth.updateUser({ email: email.value.trim() }, { emailRedirectTo: `${window.location.origin}/confirm` });
  busy.value = false;
  if (error) {
    if (error.status === 429) errorMessage.value = "ただいま確認メールを送信できません。しばらく時間をおいてから、もう一度お試しください。";
    else if (error.code === "email_exists") errorMessage.value = "このメールアドレスは使用できません。別のアドレスをお試しください。";
    else errorMessage.value = "変更の手続きを開始できませんでした。入力内容をお確かめください。";
    return;
  }
  sent.value = true;
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page narrow">
      <h1>メールアドレスの変更</h1>
      <div v-if="sent" class="card">
        <p><strong>確認メールをお送りしました。</strong></p>
        <p>メールに記載のリンクを開くと、変更が完了します。それまでは、今のメールアドレスでログインしてください。</p>
        <NuxtLink class="button secondary" to="/mypage">マイページへ戻る</NuxtLink>
      </div>
      <form v-else class="card" @submit.prevent="submit">
        <p class="note">現在のメールアドレス：{{ me?.email ?? "—" }}</p>
        <p class="notice">
          ご自身だけが見られる<strong>個人のメールアドレス</strong>をおすすめします。勤務先のアドレスは、退職・異動のあとに使えなくなります。<br />
          変更しても、これまでのご相談の記録はそのまま残ります。
        </p>
        <label class="field" for="email">新しいメールアドレス</label>
        <input id="email" v-model="email" type="email" autocomplete="email" required />
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "送信中…" : "確認メールを送る" }}</button>
      </form>
      <p class="note"><NuxtLink to="/mypage">マイページへ戻る</NuxtLink></p>
    </main>
  </div>
</template>

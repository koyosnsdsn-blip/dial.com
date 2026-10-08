<script setup lang="ts">
// 通知用のメールアドレス（未決事項一覧 2.17）。ニックネームで登録した方が、任意で登録する。
// ログインの方法（ニックネーム）は変わらない。新しいお返事の通知と、パスワードを忘れたときの再設定の届け先になる。
// 【仮】いまは保存と表示だけ。確認メールの送信・通知・再設定は、メール配信の仕組み（No.59）ができてから始まる。
// 確認前のアドレスには、何も送らない。
type State = { applicable: boolean; email: string | null; verified: boolean };
const me = useMe();
const state = ref<State | null>(null);
const email = ref("");
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const saved = ref(false);

async function load() {
  try {
    const [, s] = await Promise.all([me.value ? Promise.resolve() : loadMe(), $fetch<State>("/api/notify-email")]);
    state.value = s;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function save() {
  busy.value = true;
  errorMessage.value = "";
  saved.value = false;
  try {
    const res = await $fetch<{ email: string; verified: boolean }>("/api/notify-email", { method: "PUT", body: { email: email.value } });
    state.value = { applicable: true, email: res.email, verified: res.verified };
    email.value = "";
    saved.value = true;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  busy.value = true;
  errorMessage.value = "";
  saved.value = false;
  try {
    await $fetch<unknown>("/api/notify-email", { method: "DELETE" });
    state.value = { applicable: true, email: null, verified: false };
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page narrow">
      <p><NuxtLink to="/mypage">← マイページへ</NuxtLink></p>
      <h1>通知用のメールアドレス</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage && !state" class="error" role="alert">{{ errorMessage }}</p>
      <div v-else-if="state && !state.applicable" class="card">
        <p>メールアドレスで登録されている方は、ログインに使っているメールアドレスにお知らせが届きます。</p>
        <NuxtLink class="button secondary" to="/mypage/email">メールアドレスを変更する</NuxtLink>
      </div>
      <div v-else-if="state" class="card">
        <p class="notice">
          ニックネームで登録されているため、いまはメールが届きません。通知用のメールアドレスを登録すると、<strong>新しいお返事のお知らせ</strong>と、
          <strong>パスワードを忘れたときの再設定</strong>をメールで受け取れます。<br />
          <strong>登録しないと、パスワードを忘れたときに、これまでのご相談を開けなくなります。</strong>
        </p>
        <p class="note">
          ログインの方法（ニックネームとパスワード）は変わりません。メールにご相談の内容は書かれません。<br />
          ご自身だけが見られる個人のメールアドレスをおすすめします。勤務先のアドレスは、退職・異動のあとに使えなくなります。
        </p>

        <template v-if="state.email">
          <p>登録済み：<strong>{{ state.email }}</strong></p>
          <p v-if="!state.verified" class="note">
            <strong>確認前</strong>です。メールの送信の準備ができしだい、確認のメールをお送りします。確認が済むまでは、このアドレスには何も送りません。
          </p>
          <p v-else class="note">確認済みです。</p>
        </template>

        <form @submit.prevent="save">
          <label class="field" for="notify-email">{{ state.email ? "別のメールアドレスに変更する" : "メールアドレス" }}</label>
          <input id="notify-email" v-model="email" type="email" autocomplete="email" required />
          <p v-if="saved" class="notice" role="status" style="margin-top: 12px">登録しました。確認前の状態です。</p>
          <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
          <button type="submit" :disabled="busy" style="margin-top: 16px">{{ busy ? "保存しています…" : state.email ? "変更する" : "登録する" }}</button>
        </form>
        <button v-if="state.email" type="button" class="secondary" :disabled="busy" style="margin-top: 12px" @click="remove">登録を削除する</button>
      </div>
    </main>
  </div>
</template>

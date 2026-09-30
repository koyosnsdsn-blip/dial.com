<script setup lang="ts">
// 招待コードの入力（要件 8.5）。勤務先などから案内されたコードで、所属を紐付ける。
const code = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  try {
    await $fetch("/api/invite", { method: "POST", body: { code: code.value } });
    await loadMe();
    await navigateTo("/consult");
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
      <h1>招待コードの入力</h1>
      <form class="card" @submit.prevent="submit">
        <p>勤務先などから案内された招待コードを入力してください。</p>
        <label class="field" for="code">招待コード</label>
        <input id="code" v-model="code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required />
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "確認中…" : "登録する" }}</button>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
// 入口の共通フォーム。3種類の入口（pages/start/*）で使い分ける。
//   invite   … 招待コードあり：ニックネーム＋パスワード＋招待コード（勤務先などから案内された方）
//   nickname … ニックネームのみ：ニックネーム＋パスワード（メールアドレス不要）
//   email    … メールアドレスあり：メールアドレス＋パスワード（確認メールあり。パスワードの再設定ができる）
// どの入口も「はじめての方」と「登録済みの方」を同じページで切り替える。
// 「ログイン状態を保持する」の選択肢は設けない（＝常に無効。要件 10.4）
const props = defineProps<{ mode: "invite" | "nickname" | "email"; initial?: "signup" | "login" }>();

const supabase = useSupabaseClient();
const route = useRoute();
const tab = ref<"signup" | "login">(route.query.tab === "login" ? "login" : route.query.tab === "signup" ? "signup" : props.initial ?? "signup");

const id = ref(""); // ニックネーム または メールアドレス
const password = ref("");
const password2 = ref("");
const inviteCode = ref("");
const busy = ref(false);
const sent = ref(false);
const errorMessage = ref("");

const useEmail = computed(() => props.mode === "email");

// ログインが必要な画面から来たときの案内（middleware/auth.global.ts が reason を付ける）
const REASONS: Record<string, string> = {
  required: "このページを見るには、ログインが必要です。",
  expired: "ログインの有効期限が切れました。もう一度ログインしてください。",
  staff: "いまは運営側のアカウントでログインしています。相談者としてログインすると、このブラウザの運営画面からはログアウトされます。",
};
const reasonMessage = computed(() => (typeof route.query.reason === "string" ? REASONS[route.query.reason] ?? "" : ""));
const domain = () => useRuntimeConfig().public.nicknameDomain as string;

watch(tab, () => {
  errorMessage.value = "";
  password.value = "";
  password2.value = "";
});

function checkInputs(): boolean {
  if (!useEmail.value) {
    const problem = nicknameProblem(id.value);
    if (problem === "length") {
      errorMessage.value = "ニックネームは2〜20文字で入力してください。";
      return false;
    }
    if (problem === "chars") {
      errorMessage.value = "ニックネームに、空白や「@」は使えません。";
      return false;
    }
  }
  if (password.value.length < 8) {
    errorMessage.value = "パスワードは8文字以上にしてください。";
    return false;
  }
  if (password.value !== password2.value) {
    errorMessage.value = "確認用のパスワードが一致しません。";
    return false;
  }
  if (props.mode === "invite" && inviteCode.value.trim() === "") {
    errorMessage.value = "招待コードを入力してください。";
    return false;
  }
  return true;
}

async function signup() {
  errorMessage.value = "";
  if (!checkInputs()) return;
  busy.value = true;
  try {
    if (useEmail.value) {
      const { error } = await supabase.auth.signUp({
        email: id.value.trim(),
        password: password.value,
        options: { emailRedirectTo: `${window.location.origin}/confirm` },
      });
      if (error) {
        errorMessage.value =
          error.status === 429
            ? "ただいま確認メールを送信できません。しばらく時間をおいてから、もう一度お試しください。"
            : error.code === "weak_password"
              ? "このパスワードは使えません。別のパスワードにしてください。"
              : "登録できませんでした。入力内容をお確かめください。";
        return;
      }
      // すでに登録済みのアドレスでも同じ表示にする（登録の有無を第三者に推測させない）
      sent.value = true;
      return;
    }

    await $fetch<unknown>("/api/signup", {
      method: "POST",
      body: { nickname: id.value, password: password.value, inviteCode: props.mode === "invite" ? inviteCode.value : "" },
    });
    const { error } = await supabase.auth.signInWithPassword({ email: await nicknameToEmail(id.value, domain()), password: password.value });
    if (error) {
      tab.value = "login";
      errorMessage.value = "登録は完了しました。ニックネームとパスワードでログインしてください。";
      return;
    }
    useMe().value = null; // 前のログインの情報を使い回さない
    await navigateTo("/consult");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function login() {
  busy.value = true;
  errorMessage.value = "";
  const value = id.value.trim();
  const email = useEmail.value || value.includes("@") ? value : await nicknameToEmail(value, domain());
  const { error } = await supabase.auth.signInWithPassword({ email, password: password.value });
  if (error) {
    busy.value = false;
    // アカウントの有無を推測されないよう、原因を細かく出し分けない（回数制限と未確認メールのみ区別する）
    errorMessage.value =
      error.status === 429
        ? "試行回数が上限に達しました。しばらく時間をおいてから、もう一度お試しください。"
        : error.code === "email_not_confirmed"
          ? "メールアドレスの確認が済んでいません。届いている確認メールのリンクを開いてください。"
          : `${useEmail.value ? "メールアドレス" : "ニックネーム"}またはパスワードが正しくありません。`;
    return;
  }
  // 招待コードあり入口：ログインと同時に、まだ所属が付いていなければ招待コードを登録する
  if (props.mode === "invite" && inviteCode.value.trim()) {
    try {
      await $fetch<unknown>("/api/invite", { method: "POST", body: { code: inviteCode.value } });
    } catch {
      busy.value = false;
      await navigateTo("/invite");
      return;
    }
  }
  busy.value = false;
  useMe().value = null; // 前のログインの情報を使い回さない
  await navigateTo("/consult");
}
</script>

<template>
  <div>
    <div v-if="sent" class="card">
      <p><strong>確認メールをお送りしました。</strong></p>
      <p>メールに記載のリンクを開くと、登録が完了します。届かない場合は、迷惑メールのフォルダもご確認ください。</p>
      <button type="button" class="secondary" @click="(sent = false), (tab = 'login')">ログインへ</button>
    </div>

    <template v-else>
      <p v-if="reasonMessage && tab === 'login'" class="notice warn" role="status" style="margin-bottom: 12px">{{ reasonMessage }}</p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'signup'" :class="{ on: tab === 'signup' }" @click="tab = 'signup'">はじめての方</button>
        <button type="button" role="tab" :aria-selected="tab === 'login'" :class="{ on: tab === 'login' }" @click="tab = 'login'">登録済みの方</button>
      </div>

      <form class="card" @submit.prevent="tab === 'signup' ? signup() : login()">
        <template v-if="useEmail">
          <p v-if="tab === 'signup'" class="notice">
            ご自身だけが見られる<strong>個人のメールアドレス</strong>をお使いください。勤務先のアドレスは使わないでください。
          </p>
          <label class="field" for="entry-id">メールアドレス</label>
          <input id="entry-id" v-model="id" type="email" autocomplete="username" required />
        </template>
        <template v-else>
          <p v-if="tab === 'signup'" class="note">メールアドレスやお名前の入力は必要ありません。</p>
          <label class="field" for="entry-id">ニックネーム<template v-if="tab === 'signup'">（2〜20文字）</template></label>
          <input id="entry-id" v-model="id" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="254" required />
          <p v-if="tab === 'signup'" class="note">ログインのときに使います。本名や、ご自身が特定される名前は使わないでください。</p>
        </template>

        <label class="field" for="entry-pw">パスワード<template v-if="tab === 'signup'">（8文字以上）</template></label>
        <input id="entry-pw" v-model="password" type="password" :autocomplete="tab === 'signup' ? 'new-password' : 'current-password'" minlength="8" maxlength="72" required />
        <template v-if="tab === 'signup'">
          <label class="field" for="entry-pw2">パスワード（確認）</label>
          <input id="entry-pw2" v-model="password2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
        </template>

        <template v-if="mode === 'invite'">
          <label class="field" for="entry-code">招待コード<template v-if="tab === 'login'">（まだ登録していない場合のみ）</template></label>
          <input id="entry-code" v-model="inviteCode" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" :required="tab === 'signup'" />
          <p v-if="tab === 'signup'" class="note">勤務先などから案内されたコードを入力してください。</p>
        </template>

        <p v-if="tab === 'signup' && !useEmail" class="notice warn" style="margin-top: 14px">
          <strong>ニックネームとパスワードは、忘れないように控えておいてください。</strong>
          メールアドレスを登録しないため、忘れた場合に再設定ができません。
        </p>

        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy" style="margin-top: 20px">
          {{ busy ? "確認しています…" : tab === "signup" ? "登録してはじめる" : "ログイン" }}
        </button>
      </form>

      <p v-if="tab === 'login'" class="note">
        <NuxtLink :to="useEmail ? '/forgot?by=email' : '/forgot'">パスワードを忘れた方</NuxtLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 0; margin-bottom: -1px; }
.tabs button {
  flex: 1;
  padding: 12px 8px;
  color: var(--muted);
  background: #ecebe6;
  border: 1px solid var(--line);
  border-radius: 12px 12px 0 0;
  font-weight: 600;
}
.tabs button.on { color: var(--accent); background: var(--surface); border-bottom-color: var(--surface); }
.tabs + .card { border-top-left-radius: 0; border-top-right-radius: 0; }
</style>

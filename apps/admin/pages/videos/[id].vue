<script setup lang="ts">
// 動画の登録・編集（要件 7.7.2・7.7.3）。運営管理者のみ。
// - 配信範囲は、個人利用者と企業会員の2つの軸を別々に指定する。両方「対象外」では公開できない
// - 公開・予約公開・公開後の配信範囲の変更では、視聴できる利用者を2軸それぞれ示して、確認を求める
// - 【仮】動画のアドレスは、Vimeo / YouTube の埋め込み用アドレス。サムネイルと再生時間の自動取得は未対応（配信サービスが未決）
type Client = { clientId: string; name: string };
type Detail = {
  videoId: string; title: string; description: string; category: string; sourceRef: string; durationMin: number | "";
  scopePersonal: "free" | "paid" | "none"; scopeBusiness: "all" | "some" | "none"; clientIds: string[];
  status: "draft" | "scheduled" | "published"; publishedAt: string | null; sortOrder: number; views: number;
};
const route = useRoute();
const id = computed(() => String(route.params.id));
const isNew = computed(() => id.value === "new");
const form = reactive({
  title: "", description: "", category: "", sourceRef: "", durationMin: "" as number | "", sortOrder: 0,
  scopePersonal: "none" as "free" | "paid" | "none", scopeBusiness: "none" as "all" | "some" | "none", clientIds: [] as string[],
});
const current = ref<Detail | null>(null);
const clients = ref<Client[]>([]);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const message = ref("");
const publishMode = ref<"" | "now" | "schedule">("");
const publishAt = ref("");
const confirmed = ref(false);
const preview = ref(false);

async function load() {
  try {
    clients.value = await $fetch<Client[]>("/api/client-options");
    if (!isNew.value) {
      current.value = await $fetch<Detail>(`/api/videos/${id.value}`);
      const { title, description, category, sourceRef, durationMin, sortOrder, scopePersonal, scopeBusiness, clientIds } = current.value;
      Object.assign(form, { title, description, category, sourceRef, durationMin, sortOrder, scopePersonal, scopeBusiness, clientIds: [...clientIds] });
    }
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
const bothNone = computed(() => form.scopePersonal === "none" && form.scopeBusiness === "none");
const live = computed(() => current.value?.status === "published" || current.value?.status === "scheduled");
const scopeChanged = computed(() => {
  const c = current.value;
  if (!c) return false;
  return c.scopePersonal !== form.scopePersonal || c.scopeBusiness !== form.scopeBusiness || [...c.clientIds].sort().join() !== [...form.clientIds].sort().join();
});
// 視聴できる利用者（2軸それぞれ）
const audience = computed(() => ({
  personal: form.scopePersonal === "free" ? "無料会員と月額会員（登録した個人の利用者すべて）" : form.scopePersonal === "paid" ? "月額会員だけ（無料会員は見られません）" : "個人の利用者は見られません",
  business:
    form.scopeBusiness === "all"
      ? "すべての契約クライアントの所属者"
      : form.scopeBusiness === "some"
        ? `次のクライアントの所属者だけ：${clients.value.filter((c) => form.clientIds.includes(c.clientId)).map((c) => c.name).join("、") || "（未選択）"}`
        : "企業会員は見られません",
}));
const needsConfirm = computed(() => publishMode.value !== "" || (live.value && scopeChanged.value));

async function save(publish?: "now" | "schedule" | "draft") {
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const body = { ...form, publish, publishAt: publish === "schedule" && publishAt.value ? new Date(publishAt.value).toISOString() : undefined, confirmed: confirmed.value };
    if (isNew.value) {
      const res = await $fetch<{ videoId: string }>("/api/videos", { method: "POST", body });
      await navigateTo(`/videos/${res.videoId}`);
      return;
    }
    await $fetch<unknown>(`/api/videos/${id.value}`, { method: "PATCH", body });
    publishMode.value = "";
    confirmed.value = false;
    await load();
    message.value = "保存しました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <p><NuxtLink to="/videos">← 動画の一覧へ</NuxtLink></p>
      <h1>
        {{ isNew ? "動画を登録する" : "動画の編集" }}
        <span v-if="current" class="badge" :class="{ on: current.status === 'published', wait: current.status === 'scheduled' }">{{ current.status === "published" ? "公開中" : current.status === "scheduled" ? `予約（${formatDateTime(current.publishedAt)}）` : "下書き" }}</span>
      </h1>
      <p v-if="loading" class="note">読み込み中…</p>
      <template v-else>
        <p v-if="message" class="ok" role="status">{{ message }}</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <section class="panel">
          <label for="v-title">タイトル</label>
          <input id="v-title" v-model="form.title" maxlength="100" />
          <label for="v-desc">説明文</label>
          <textarea id="v-desc" v-model="form.description" rows="4" maxlength="2000" />
          <div class="two">
            <label>カテゴリ<input v-model="form.category" maxlength="50" list="video-categories" /></label>
            <label>再生時間（分）<input v-model="form.durationMin" type="number" min="0" max="1000" /></label>
            <label>一覧での表示順（小さいほど上）<input v-model.number="form.sortOrder" type="number" min="0" max="9999" /></label>
          </div>
          <datalist id="video-categories"><option value="マンスリーセミナー" /><option value="ノウハウ" /><option value="ガイド" /><option value="個別制作" /></datalist>
          <label for="v-src">動画のアドレス（埋め込み用）</label>
          <input id="v-src" v-model="form.sourceRef" placeholder="https://player.vimeo.com/video/123456789" />
          <p class="note">Vimeo は「https://player.vimeo.com/video/…」、YouTube は「https://www.youtube.com/embed/…」の形で入力してください。</p>
          <button v-if="form.sourceRef" class="secondary small" type="button" @click="preview = !preview">{{ preview ? "プレビューを閉じる" : "プレビュー" }}</button>
          <div v-if="preview && form.sourceRef" class="player"><iframe :src="form.sourceRef" title="プレビュー" allowfullscreen></iframe></div>
        </section>

        <section class="panel">
          <h2>配信範囲</h2>
          <div class="two">
            <label>個人利用者
              <select v-model="form.scopePersonal">
                <option value="free">無料会員以上</option>
                <option value="paid">月額会員のみ</option>
                <option value="none">対象外</option>
              </select>
            </label>
            <label>企業会員
              <select v-model="form.scopeBusiness">
                <option value="all">全クライアント</option>
                <option value="some">選択したクライアントのみ</option>
                <option value="none">対象外</option>
              </select>
            </label>
          </div>
          <div v-if="form.scopeBusiness === 'some'">
            <h3>対象のクライアント</h3>
            <label v-for="c in clients" :key="c.clientId" class="check"><input v-model="form.clientIds" type="checkbox" :value="c.clientId" />{{ c.name }}</label>
            <p v-if="clients.length === 0" class="note">契約クライアントがありません。</p>
          </div>
          <p v-if="bothNone" class="warn">個人利用者・企業会員の両方が「対象外」です。このままでは公開できません。</p>
          <p class="note">未登録の方は、どの設定でも視聴できません。「無料会員以上」を選ぶと、月額会員も対象になります。</p>
        </section>

        <section class="panel">
          <h2>保存・公開</h2>
          <div v-if="!live" class="row">
            <label class="check"><input v-model="publishMode" type="radio" value="" />下書きのまま保存</label>
            <label class="check"><input v-model="publishMode" type="radio" value="now" />すぐに公開</label>
            <label class="check"><input v-model="publishMode" type="radio" value="schedule" />日時を指定して公開</label>
          </div>
          <label v-if="publishMode === 'schedule'">公開する日時<input v-model="publishAt" type="datetime-local" /></label>
          <div v-if="needsConfirm" class="warn">
            <strong>この動画を視聴できる利用者</strong>
            <ul>
              <li>個人利用者：{{ audience.personal }}</li>
              <li>企業会員：{{ audience.business }}</li>
            </ul>
            <label class="check"><input v-model="confirmed" type="checkbox" />上の範囲で間違いないことを確認しました</label>
          </div>
          <div class="row">
            <button type="button" :disabled="busy || form.title.trim() === '' || (needsConfirm && (!confirmed || bothNone)) || (publishMode === 'schedule' && !publishAt)" @click="save(publishMode || undefined)">
              {{ publishMode === "now" ? "公開する" : publishMode === "schedule" ? "予約する" : "保存する" }}
            </button>
            <button v-if="live" class="secondary" type="button" :disabled="busy" @click="save('draft')">下書きに戻す（公開をやめる）</button>
          </div>
          <p v-if="current" class="note">視聴 {{ current.views }} 回。配信範囲と公開状態の変更は、変更前後が監査ログに残ります。</p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.player { position: relative; width: 100%; padding-top: 56.25%; margin-top: 12px; background: #000; border-radius: 8px; overflow: hidden; }
.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
ul { margin: 6px 0; padding-left: 1.2em; }
</style>

<script setup lang="ts">
// クライアント別ランディングページ（要件 8.6.2）。勤務先などから案内された方の入口。
// - 変えられるのは、掲載コメント・社内窓口の連絡先・アクセントカラーだけ（ロゴは未対応）
// - 開示範囲の説明・緊急時の案内・相談の仕様の説明は、全クライアント共通の固定の文面（上書きできない）
// - このページの URL は認証には使わない。登録には招待コードが要る
// - 公開が終わった・見つからない場合は、共通の入口へ転送する
type Landing = {
  clientName: string;
  contractType: "corp" | "muni";
  comment: string;
  contact: string;
  accent: string;
  featureQa: boolean;
  featureConsult: boolean;
  featureVideo: boolean;
  slaHours: number;
};
useHead({ meta: [{ name: "robots", content: "noindex, nofollow" }] });
const route = useRoute();
const landing = ref<Landing | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    landing.value = await $fetch<Landing>(`/api/landing/${String(route.params.code)}`);
  } catch {
    await navigateTo("/", { replace: true });
    return;
  } finally {
    loading.value = false;
  }
});
const accent = computed(() => ACCENT_COLORS[landing.value?.accent ?? "teal"] ?? ACCENT_COLORS.teal);
</script>

<template>
  <main class="page narrow" :style="{ '--accent': accent }">
    <p v-if="loading" class="note">読み込んでいます…</p>
    <template v-else-if="landing">
      <p class="client">{{ landing.clientName }} のみなさまへ</p>
      <h1>ダイヤル.com</h1>
      <p v-if="landing.featureConsult">専門の相談員に、メッセージでご相談いただけます。費用のご負担はありません。</p>
      <p v-else>お役立ていただける情報をご用意しています。</p>
      <p v-if="landing.comment" class="card comment">{{ landing.comment }}</p>

      <NuxtLink class="button" to="/start/invite">はじめる（招待コードを入力）</NuxtLink>
      <p class="note center">すでに登録済みの方も、こちらからログインできます。</p>

      <section v-if="landing.contractType === 'corp'" class="card">
        <h2>勤務先に伝わること・伝わらないこと</h2>
        <ul>
          <li>ご相談の内容、誰が相談したか、誰が登録したかは、<strong>勤務先には伝わりません。</strong></li>
          <li>お名前・部署・社員番号は、登録時にもお聞きしません。</li>
          <li>勤務先の担当部署が見られるのは、3か月ごとの件数などの集計だけです。件数が少ないときは、内訳を表示しません。</li>
          <li>登録しただけでは、相談したことにはなりません。</li>
        </ul>
      </section>
      <section v-else class="card notice warn">
        <h2>ご相談の内容の取り扱い</h2>
        <p>この窓口は、{{ landing.clientName }} の委託を受けて運営しています。<strong>ご相談の内容は、委託元へそのまま報告されます。</strong>ご相談を始める前に、あらためて確認をお願いしています。</p>
      </section>

      <section v-if="landing.featureConsult" class="card">
        <h2>ご相談について</h2>
        <ul>
          <li>メッセージでのやり取りです。お返事までの目安は {{ landing.slaHours }}時間 です。</li>
          <li>回数の上限はありません。何度でもご相談いただけます。</li>
          <li>診断や治療を行うものではありません。</li>
        </ul>
      </section>
      <section v-if="landing.contact" class="card">
        <h2>社内のお問い合わせ先</h2>
        <p class="pre">{{ landing.contact }}</p>
      </section>
      <p class="note center"><NuxtLink to="/">利用規約・プライバシーポリシー（準備中）</NuxtLink></p>
      <EmergencyLink />
    </template>
  </main>
</template>

<style scoped>
.client { font-size: 0.9rem; color: var(--muted); margin-bottom: 4px; }
.comment, .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.center { text-align: center; margin-top: 8px; }
section { margin-top: 16px; }
ul { margin: 0; padding-left: 1.2em; }
li + li { margin-top: 6px; }
</style>

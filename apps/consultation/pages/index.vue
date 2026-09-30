<script setup lang="ts">
// トップ（ログイン前）。サーバー側で生成する公開ページ。3種類の入口へ案内する。
// 【仮】文面は暫定。一般向けと企業会員向けの入口の出し分け（要件 8.6.1）、クライアント別ランディングページ（8.6.2）は未実装。
//      3つの入口のどれを誰に案内するかは未決（未決事項一覧 2.12）
</script>

<template>
  <main class="page narrow">
    <h1>ダイヤル.com</h1>
    <p>専門の相談員に、メッセージでご相談いただけます。</p>
    <div class="entries">
      <NuxtLink class="entry" to="/start/invite">
        <strong>招待コードをお持ちの方</strong>
        <span>勤務先などから案内を受けた方はこちら</span>
      </NuxtLink>
      <NuxtLink class="entry" to="/start/nickname">
        <strong>ニックネームではじめる</strong>
        <span>メールアドレス不要。ニックネームとパスワードだけ</span>
      </NuxtLink>
      <NuxtLink class="entry" to="/start/email">
        <strong>メールアドレスではじめる</strong>
        <span>パスワードを忘れたときに、メールで再設定できます</span>
      </NuxtLink>
    </div>
    <EmergencyLink />
  </main>
</template>

<style scoped>
.entries { display: grid; gap: 12px; margin: 16px 0; }
.entry {
  display: block;
  padding: 16px 18px;
  color: var(--fg);
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 5px solid var(--accent);
  border-radius: 12px;
}
.entry strong { display: block; font-size: 1.05rem; color: var(--accent); }
.entry span { font-size: 0.88rem; color: var(--muted); }
</style>

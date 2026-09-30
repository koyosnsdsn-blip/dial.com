<script setup lang="ts">
// 緊急時の案内（要件 3.5）。ログインしていなくても、サーバー側で生成して表示する。
// 110・119 は常に表示する。公的な相談窓口は、相談員チームが管理画面で維持管理する一覧（public_contacts）から表示する。
// 【仮】一覧の中身は未確定（未決事項 No.14）。登録されるまでは 110・119 のみ
useHead({ title: "お急ぎのとき｜ダイヤル.com" });
type Contact = { name: string; phone: string | null; hours: string | null; note: string | null; url: string | null };
const { data: contacts } = await useFetch<Contact[]>("/api/public-contacts", { default: () => [] });
const tel = (phone: string) => `tel:${phone.replace(/[^0-9#*+]/g, "")}`;
</script>

<template>
  <main class="page narrow">
    <h1>お急ぎのとき・危険を感じるとき</h1>
    <div class="card">
      <p>このサービスは、緊急時の連絡手段ではありません。相談員からのお返事には時間がかかります。</p>
      <p><strong>いのちや身体に危険がせまっているときは、ためらわずに次へ連絡してください。</strong></p>
      <ul>
        <li>警察：<a href="tel:110">110</a></li>
        <li>救急・消防：<a href="tel:119">119</a></li>
      </ul>
    </div>
    <div v-if="contacts && contacts.length" class="card">
      <h2>相談できる公的な窓口</h2>
      <ul class="contacts">
        <li v-for="(c, i) in contacts" :key="i">
          <strong>{{ c.name }}</strong>
          <span v-if="c.phone">電話：<a :href="tel(c.phone)">{{ c.phone }}</a></span>
          <span v-if="c.hours">受付：{{ c.hours }}</span>
          <span v-if="c.note">{{ c.note }}</span>
          <span v-if="c.url"><a :href="c.url" target="_blank" rel="noopener noreferrer">ウェブサイト</a></span>
        </li>
      </ul>
    </div>
    <p v-else class="note">公的な相談窓口のご案内は、準備ができしだい、このページに掲載します。</p>
    <p class="note">このサービスは、医療行為・診断・治療を行うものではありません。</p>
  </main>
</template>

<style scoped>
.contacts { list-style: none; margin: 0; padding: 0; }
.contacts li { padding: 10px 0; }
.contacts li + li { border-top: 1px solid var(--line); }
.contacts strong { display: block; }
.contacts span { display: block; font-size: 0.9rem; color: var(--muted); }
</style>

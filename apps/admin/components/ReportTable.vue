<script setup lang="ts">
// 四半期レポートの表。運営側の確認画面と、クライアント管理サイトの両方で同じ見た目にする。
// 値は開示用に加工済み（件数が少ない内訳は「その他」に合算済み、または非表示）。
export type ReportRow = {
  quarterStart: string;
  members: number;
  employeeCount: number | null;
  casesTotal: number | null;
  genres: { label: string; count: number }[] | null;
  slaRate: number | null;
  generatedAt: string;
};
defineProps<{ rows: ReportRow[]; contractType: "corp" | "muni" }>();
</script>

<template>
  <div class="scroll">
    <table>
      <thead>
        <tr><th>期間</th><th>登録件数</th><th>相談件数</th><th>相談内容の内訳</th><th>期限内に返信した割合</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.quarterStart">
          <td class="nowrap">{{ quarterLabel(r.quarterStart) }}</td>
          <td class="num">{{ r.members }} 件<span v-if="r.employeeCount" class="muted"><br />（従業員数 {{ r.employeeCount }}）</span></td>
          <td class="num">{{ r.casesTotal === null ? "—" : `${r.casesTotal} 件` }}</td>
          <td>
            <ul v-if="r.genres && r.genres.length" class="genres">
              <li v-for="g in r.genres" :key="g.label">{{ g.label }}：{{ g.count }} 件</li>
            </ul>
            <span v-else-if="r.casesTotal === null" class="muted">表示しません</span>
            <span v-else-if="r.genres === null" class="muted">件数が少ないため表示しません</span>
            <span v-else class="muted">—</span>
          </td>
          <td class="num">{{ r.slaRate === null ? "—" : `${r.slaRate}%` }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="contractType === 'corp'" class="note">
    相談した方が特定されないよう、件数が少ない期間は内訳を表示せず、件数が少ない項目は「その他」にまとめています。
    レポートは四半期ごとに更新され、期間の途中の数値や、任意の期間での集計は提供していません。
  </p>
</template>

<style scoped>
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; white-space: nowrap; }
.num { white-space: nowrap; }
.nowrap { white-space: nowrap; }
.genres { margin: 0; padding: 0; list-style: none; }
.muted { color: var(--muted); font-size: 13px; }
</style>

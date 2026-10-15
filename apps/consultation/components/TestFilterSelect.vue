<script setup lang="ts">
// 「テスト」の表示・非表示の選択（運営画面の一覧の絞り込み）。v-model で TestMode を受け渡す
import { TEST_MODE_OPTIONS, type TestMode } from "../ops/testFilter";
defineProps<{ modelValue: TestMode }>();
defineEmits<{ "update:modelValue": [TestMode] }>();
</script>

<template>
  <label class="test-filter">テスト
    <select :value="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value as TestMode)">
      <option v-for="o in TEST_MODE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </label>
</template>

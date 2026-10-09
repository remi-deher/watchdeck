<template>
  <!-- Le test de connexion, a cote des champs dont il depend : on sait que ca marche avant
       de partir. Un champ modifie depuis le dernier test le rend perime. -->
  <div class="configure-test">
    <UiButton size="sm" :loading="testing" @click="emit('test')"><template #icon><PlugZap /></template>{{ label }}</UiButton>
    <p v-if="testing" class="configure-test__result" aria-live="polite">Test en cours…</p>
    <p v-else-if="stale && result" class="configure-test__result" aria-live="polite">Réglage modifié depuis le test : testez à nouveau.</p>
    <p v-else-if="result" class="configure-test__result" :class="result.ok ? 'is-ok' : 'is-error'" aria-live="polite">
      <component :is="result.ok ? CheckCircle2 : XCircle" aria-hidden="true" />{{ result.message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, PlugZap, XCircle } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { ConfigureTestResult } from './types';

withDefaults(
  defineProps<{ result?: ConfigureTestResult | null; testing?: boolean; stale?: boolean; label?: string }>(),
  { result: null, testing: false, stale: false, label: 'Tester la connexion' },
);
const emit = defineEmits<{ test: [] }>();
</script>

<style scoped lang="scss">
.configure-test { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.configure-test__result { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.configure-test__result svg { flex: none; width: 16px; height: 16px; }
.configure-test__result.is-ok { color: var(--green-text, var(--green)); }
.configure-test__result.is-error { color: var(--red-text); }
</style>

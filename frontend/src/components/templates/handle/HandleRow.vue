<template>
  <!-- Une ligne a traiter : le probleme en clair, la correction proposee, l'action
       principale d'abord. L'affiche n'apparait que si l'element en a une (un media). -->
  <li class="handle-row" :class="[`is-${item.urgency}`, { 'has-poster': hasPoster }]">
    <UiCheckbox v-if="selectable" :model-value="selected" :aria-label="`Sélectionner ${item.title}`" @update:model-value="emit('toggle', item.key)" />
    <div v-if="hasPoster" class="handle-row__poster">
      <img :src="proxyUrl(poster!, { width: 120 })" alt="" loading="lazy" @error="posterFailed = true" />
    </div>
    <div class="handle-row__text">
      <component :is="item.to ? RouterLink : 'strong'" :to="item.to || undefined" class="handle-row__title">{{ item.title }}</component>
      <small v-if="item.subtitle" class="handle-row__subtitle">{{ item.subtitle }}</small>
      <span class="handle-row__problem">{{ item.problem }}</span>
      <span v-if="item.proposal" class="handle-row__proposal">Proposé : {{ item.proposal }}</span>
    </div>
    <div v-if="item.actions?.length" class="handle-row__actions">
      <UiButton
        v-for="(action, index) in item.actions"
        :key="action.key"
        size="sm"
        :variant="action.tone === 'danger' ? 'danger' : index === 0 || action.tone === 'primary' ? 'primary' : 'secondary'"
        :disabled="action.disabled"
        :title="action.title"
        @click="emit('action', item, action.key)"
      >
        <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
      </UiButton>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { proxyUrl } from '@/utils/mediaImage';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import type { HandleItem } from './types';

const props = withDefaults(defineProps<{ item: HandleItem; selectable?: boolean; selected?: boolean }>(), { selectable: true, selected: false });
const emit = defineEmits<{ action: [item: HandleItem, key: string]; toggle: [key: string] }>();

const posterFailed = ref(false);
const poster = computed(() => props.item.poster || props.item.media?.poster_url || null);
watch(poster, () => { posterFailed.value = false; });
const hasPoster = computed(() => Boolean(poster.value) && !posterFailed.value);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.handle-row { display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-3); }
.handle-row__poster { flex: none; width: 40px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-2); }
.handle-row__poster img { width: 100%; height: 100%; object-fit: cover; }
.handle-row__text { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; font-size: var(--fs-sm); }
.handle-row__title { overflow: hidden; color: var(--text); font-size: var(--fs-base); font-weight: 700; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.handle-row__title:hover { color: var(--accent); }
.handle-row__subtitle, .handle-row__proposal { color: var(--muted); }
.handle-row__problem { color: var(--amber-text, var(--text)); }
.handle-row.is-high .handle-row__problem { color: var(--red-text); }
.handle-row__actions { display: flex; flex: none; flex-wrap: wrap; gap: var(--space-2); }

@include bp.until(phablet) {
  .handle-row { flex-wrap: wrap; }
  .handle-row__actions { width: 100%; }
}
</style>

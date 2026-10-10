<template>
  <!-- Une ligne a traiter : le probleme en clair, la correction proposee, l'action
       principale d'abord. L'affiche n'apparait que si l'element en a une (un media). -->
  <li class="handle-row" :class="[`is-${item.handling?.urgency || item.urgency || 'medium'}`, { 'has-poster': hasPoster }]">
    <div v-if="backdrop" class="handle-row__backdrop" :style="{ backgroundImage: `url(${proxyUrl(backdrop, { kind: 'backdrop' })})` }" aria-hidden="true" />
    <UiCheckbox v-if="selectable" :model-value="selected" :aria-label="`Sélectionner ${item.title}`" @update:model-value="emit('toggle', item.key)" />
    <div v-if="hasPoster" class="handle-row__poster">
      <img :src="proxyUrl(poster!, { width: 120 })" alt="" loading="lazy" @error="posterFailed = true" />
    </div>
    <div class="handle-row__text">
      <component :is="item.to ? RouterLink : 'strong'" :to="item.to || undefined" class="handle-row__title">{{ item.title }}</component>
      <small v-if="item.subtitle" class="handle-row__subtitle">{{ item.subtitle }}</small>
      <StatusBadge v-if="item.handling" :status="item.handling.state" />
      <span class="handle-row__problem">{{ item.handling?.label || item.problem }}</span>
      <span v-if="item.handling?.consequence" class="handle-row__consequence">{{ item.handling.consequence }}</span>
      <span v-if="proposal" class="handle-row__proposal">Proposé : {{ proposal }}</span>
    </div>
    <label v-if="item.note" class="handle-row__note">
      {{ item.note.label }}
      <textarea v-model="note" rows="2" :disabled="busy" :placeholder="item.note.placeholder" @blur="saveNote" />
    </label>
    <div v-if="actions.length" class="handle-row__actions">
      <UiButton
        v-for="(action, index) in actions"
        :key="action.key"
        size="sm"
        :variant="action.tone === 'danger' ? 'danger' : index === 0 || action.tone === 'primary' ? 'primary' : 'secondary'"
        :disabled="busy || action.disabled"
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
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import type { HandleItem, HandleAction } from './types';

const props = withDefaults(defineProps<{ item: HandleItem; selectable?: boolean; selected?: boolean; busy?: boolean }>(), { selectable: true, selected: false });
const emit = defineEmits<{ action: [item: HandleItem, key: string]; toggle: [key: string]; note: [item: HandleItem, value: string] }>();

const actions = computed<HandleAction[]>(() => props.item.handling?.actions || props.item.actions || []);
const proposal = computed(() => props.item.handling?.proposal ?? props.item.proposal);
const note = ref(props.item.note?.value || '');
watch(() => props.item.note?.value, value => { note.value = value || ''; });
function saveNote(): void {
  if (note.value.trim() !== (props.item.note?.value || '').trim()) emit('note', props.item, note.value.trim());
}
const posterFailed = ref(false);
const backdrop = computed(() => props.item.backdrop || props.item.media?.backdrop_url || null);
const poster = computed(() => props.item.poster || props.item.media?.poster_url || null);
watch(poster, () => { posterFailed.value = false; });
const hasPoster = computed(() => Boolean(poster.value) && !posterFailed.value);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.handle-row { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-3); }
.handle-row__backdrop { position: absolute; inset: 0; z-index: -1; background-size: cover; background-position: center; opacity: .08; pointer-events: none; }
.handle-row__poster { flex: none; width: 40px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-2); }
.handle-row__poster img { width: 100%; height: 100%; object-fit: cover; }
.handle-row__text { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; font-size: var(--fs-sm); }
.handle-row__title { overflow: hidden; color: var(--text); font-size: var(--fs-base); font-weight: 700; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.handle-row__title:hover { color: var(--accent); }
.handle-row__subtitle, .handle-row__proposal { color: var(--muted); }
.handle-row__problem { color: var(--amber-text, var(--text)); }
.handle-row.is-high .handle-row__problem { color: var(--red-text); }
.handle-row__note { display: grid; gap: 4px; color: var(--muted); font-size: var(--fs-xs); }
.handle-row__note textarea { padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font: inherit; }
.handle-row__consequence { color: var(--muted); }
.handle-row__actions { display: flex; flex: none; flex-wrap: wrap; gap: var(--space-2); }

@include bp.until(phablet) {
  .handle-row { flex-wrap: wrap; }
  .handle-row__note, .handle-row__actions { width: 100%; }
}
</style>

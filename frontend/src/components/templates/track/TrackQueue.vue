<template>
  <!-- La file d'attente : une ligne par element, dans l'ordre de passage. Des centaines
       d'elements en attente ne doivent pas noyer ce qui est bloque ou en cours : au-dela
       de `limit`, la liste se replie. -->
  <ol class="track-queue">
    <li v-for="(item, index) in shown" :key="item.key" class="track-queue__row">
      <span class="track-queue__rank">{{ index + 1 }}</span>
      <component :is="item.to ? RouterLink : 'span'" :to="item.to || undefined" class="track-queue__title">{{ item.title }}</component>
      <small class="track-queue__meta">{{ [item.subtitle, item.note].filter(Boolean).join(' · ') }}</small>
      <UiButton
        v-for="action in item.actions || []"
        :key="action.key"
        size="sm"
        variant="ghost"
        :disabled="action.disabled"
        :title="action.title"
        @click="emit('action', item, action.key)"
      >
        <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
      </UiButton>
    </li>
    <li v-if="hidden > 0" class="track-queue__more">
      <button type="button" @click="expanded = true">+ {{ hidden }} {{ hidden > 1 ? 'autres' : 'autre' }}</button>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import UiButton from '@/components/ui/UiButton.vue';
import { resolveTrackItem } from '@/composables/workPresentation';
import type { TrackItem } from './types';

const props = withDefaults(defineProps<{ items: TrackItem[]; limit?: number }>(), { limit: 5 });
const emit = defineEmits<{ action: [item: TrackItem, key: string] }>();

const expanded = ref(false);
const shown = computed(() => ((expanded.value ? props.items : props.items.slice(0, props.limit)).map(resolveTrackItem)));
const hidden = computed(() => props.items.length - shown.value.length);
</script>

<style scoped lang="scss">
.track-queue { display: grid; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); list-style: none; min-width: 0; }
.track-queue > li + li { border-top: 1px solid var(--border); }
.track-queue__row { display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-2) var(--space-3); font-size: var(--fs-sm); }
.track-queue__rank { flex: none; min-width: 2ch; color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
.track-queue__title { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--text); text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.track-queue__title:hover { color: var(--accent); }
.track-queue__meta { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.track-queue__more button { width: 100%; padding: var(--space-2) var(--space-3); border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
</style>

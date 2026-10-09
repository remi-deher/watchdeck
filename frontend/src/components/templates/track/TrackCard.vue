<template>
  <!-- Un element suivi. Bloque, le diagnostic passe avant la progression : savoir pourquoi
       et quoi faire compte plus qu'un pourcentage fige. -->
  <article class="track-card" :class="[`is-${item.state}`, { 'has-cover': item.poster || item.icon }]">
    <div v-if="item.poster || item.icon" class="track-card__cover">
      <img v-if="item.poster && !posterFailed" :src="proxyUrl(item.poster, { width: 200 })" :alt="''" loading="lazy" @error="posterFailed = true" />
      <component :is="item.icon" v-else aria-hidden="true" />
    </div>

    <div class="track-card__body">
      <header class="track-card__head">
        <div class="track-card__identity">
          <component :is="item.to ? RouterLink : 'strong'" :to="item.to || undefined" class="track-card__title">{{ item.title }}</component>
          <small v-if="item.subtitle">{{ item.subtitle }}</small>
        </div>
        <span class="track-card__state">{{ item.step || STATE_LABELS[item.state] }}</span>
      </header>

      <ul v-if="item.tags?.length" class="track-card__tags">
        <li v-for="tag in item.tags" :key="tag">{{ tag }}</li>
      </ul>

      <div v-if="item.state === 'blocked' && item.cause" class="track-card__cause" role="note">
        <p class="track-card__headline"><AlertTriangle aria-hidden="true" />{{ item.cause.headline }}</p>
        <ul v-if="item.cause.reasons?.length"><li v-for="reason in item.cause.reasons" :key="reason">{{ reason }}</li></ul>
        <p v-if="item.cause.hint" class="track-card__hint">{{ item.cause.hint }}</p>
      </div>

      <div v-if="item.progress != null" class="track-card__progress">
        <div><span>{{ item.eta || ' ' }}</span><strong>{{ Math.round(item.progress) }} %</strong></div>
        <UiProgress :value="item.progress" :label="`Progression de ${item.title}`" />
      </div>
      <p v-else-if="item.eta" class="track-card__eta">{{ item.eta }}</p>

      <p v-if="item.note" class="track-card__note">{{ item.note }}</p>

      <footer v-if="item.actions?.length" class="track-card__actions">
        <UiButton
          v-for="action in item.actions"
          :key="action.key"
          size="sm"
          :variant="action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : 'secondary'"
          :disabled="action.disabled"
          :title="action.title"
          @click="emit('action', item, action.key)"
        >
          <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
        </UiButton>
      </footer>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { AlertTriangle } from '@lucide/vue';
import { proxyUrl } from '@/utils/mediaImage';
import UiButton from '@/components/ui/UiButton.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import type { TrackItem, TrackState } from './types';

defineProps<{ item: TrackItem }>();
const emit = defineEmits<{ action: [item: TrackItem, key: string] }>();

const STATE_LABELS: Record<TrackState, string> = { blocked: 'Bloqué', running: 'En cours', paused: 'En pause', waiting: 'En attente' };
const posterFailed = ref(false);
</script>

<style scoped lang="scss">
.track-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); min-width: 0; }
.track-card.has-cover { grid-template-columns: 64px minmax(0, 1fr); }
.track-card.is-blocked { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); }
.track-card__cover { display: grid; place-items: center; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); }
.track-card__cover img { width: 100%; height: 100%; object-fit: cover; }
.track-card__cover svg { width: 24px; height: 24px; }
.track-card__body { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
.track-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); min-width: 0; }
.track-card__identity { display: grid; gap: 2px; min-width: 0; }
.track-card__title { overflow: hidden; color: var(--text); font-weight: 700; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.track-card__title:hover { color: var(--accent); }
.track-card__identity small, .track-card__eta, .track-card__note { margin: 0; color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.track-card__state { flex: none; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.track-card.is-blocked .track-card__state { background: color-mix(in srgb, var(--red) 14%, var(--surface)); color: var(--red-text); }
.track-card.is-running .track-card__state { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
.track-card__tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.track-card__tags li { padding: 1px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--muted); font-size: var(--fs-xs); }
.track-card__cause { display: grid; gap: 4px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--red) 7%, var(--surface)); font-size: var(--fs-sm); }
.track-card__cause p, .track-card__cause ul { margin: 0; }
.track-card__cause ul { padding-left: 1.2em; color: var(--muted); }
.track-card__headline { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.track-card__headline svg { flex: none; width: 16px; height: 16px; color: var(--red-text); }
.track-card__hint { color: var(--muted); }
.track-card__progress { display: grid; gap: 4px; font-size: var(--fs-sm); }
.track-card__progress > div { display: flex; justify-content: space-between; gap: var(--space-2); color: var(--muted); }
.track-card__progress strong { color: var(--text); }
.track-card__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>

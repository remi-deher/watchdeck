<template>
  <!-- Un élément suivi. Bloqué, le diagnostic passe avant la progression : savoir pourquoi
       et quoi faire compte plus qu'un pourcentage figé. -->
  <article class="track-card" :class="[`is-${item.state}`, { 'has-cover': poster || item.icon }]">
    <component
      :is="item.to ? RouterLink : 'div'"
      v-if="poster || item.icon"
      :to="item.to || undefined"
      class="track-card__cover"
      :title="item.to ? `Voir la fiche de ${item.title}` : undefined"
    >
      <img
        v-if="poster && !posterFailed"
        :src="proxyUrl(poster, { width: 240 })"
        :alt="''"
        loading="lazy"
        @error="posterFailed = true"
      />
      <component :is="item.icon" v-else aria-hidden="true" />
    </component>

    <div class="track-card__body">
      <header class="track-card__head">
        <div class="track-card__identity">
          <component
            :is="item.to ? RouterLink : 'strong'"
            :to="item.to || undefined"
            class="track-card__title"
          >
            {{ item.title }}
          </component>
          <small v-if="item.subtitle" class="track-card__subtitle">{{ item.subtitle }}</small>
        </div>
        <span class="track-card__state" :class="`state-${item.state}`">
          {{ item.step || STATE_LABELS[item.state] }}
        </span>
      </header>

      <ul v-if="item.tags?.length" class="track-card__tags">
        <li v-for="tag in item.tags" :key="tag">{{ tag }}</li>
      </ul>

      <div v-if="item.state === 'blocked' && item.cause" class="track-card__cause" role="note">
        <p class="track-card__headline">
          <AlertTriangle aria-hidden="true" />
          <span>{{ item.cause.headline }}</span>
        </p>
        <ul v-if="item.cause.reasons?.length" class="track-card__reasons">
          <li v-for="reason in item.cause.reasons" :key="reason">{{ reason }}</li>
        </ul>
        <p v-if="item.cause.hint" class="track-card__hint">{{ item.cause.hint }}</p>
      </div>

      <div v-if="item.progress != null" class="track-card__progress">
        <div>
          <span>{{ item.eta || ' ' }}</span>
          <strong>{{ Math.round(item.progress) }} %</strong>
        </div>
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
          <template v-if="actionIcon(action)" #icon>
            <component :is="actionIcon(action)" />
          </template>
          {{ action.label }}
        </UiButton>
      </footer>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { AlertTriangle, Check, RefreshCw, Sparkles, Trash2, XCircle } from '@lucide/vue';
import { proxyUrl } from '@/utils/mediaImage';
import UiButton from '@/components/ui/UiButton.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { resolveTrackItem } from '@/composables/workPresentation';
import type { TrackAction, TrackItem, TrackState } from './types';

const props = defineProps<{ item: TrackItem }>();
const item = computed(() => resolveTrackItem(props.item));
/* L'affiche vient du media quand il y en a un (MediaRef). */
const poster = computed(() => props.item.poster || props.item.media?.poster_url || null);
const emit = defineEmits<{ action: [item: TrackItem, key: string] }>();

const STATE_LABELS: Record<TrackState, string> = {
  blocked: 'Bloqué',
  running: 'En cours',
  paused: 'En pause',
  waiting: 'En attente',
  unknown: 'État inconnu',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const DEFAULT_ACTION_ICONS: Record<string, any> = {
  interactive: Sparkles,
  retry: RefreshCw,
  approve: Check,
  reject: XCircle,
  withdraw: Trash2,
};

function actionIcon(action: TrackAction) {
  return action.icon || DEFAULT_ACTION_ICONS[action.key] || null;
}

const posterFailed = ref(false);
</script>

<style scoped lang="scss">
.track-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  min-width: 0;
  transition: border-color var(--motion-duration-fast), box-shadow var(--motion-duration-fast);
}

.track-card:hover {
  border-color: var(--border-strong);
}

.track-card.has-cover {
  grid-template-columns: 80px minmax(0, 1fr);
}

.track-card.is-blocked {
  border-color: color-mix(in srgb, var(--red) 35%, var(--border));
  border-left: 3px solid var(--red);
}

.track-card__cover {
  display: grid;
  place-items: center;
  width: 80px;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  align-self: start;
}

a.track-card__cover {
  transition: opacity var(--motion-duration-fast), transform var(--motion-duration-fast);
}

a.track-card__cover:hover {
  opacity: 0.92;
  transform: scale(1.02);
}

.track-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.track-card__cover svg {
  width: 28px;
  height: 28px;
}

.track-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.track-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.track-card__identity {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.track-card__title {
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-base);
  font-weight: 700;
  line-height: 1.3;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.track-card__title:hover {
  color: var(--accent);
}

.track-card__subtitle,
.track-card__eta,
.track-card__note {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}

.track-card__state {
  flex: none;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1;
}

.track-card.is-blocked .track-card__state {
  background: color-mix(in srgb, var(--red) 12%, var(--surface-2));
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
  color: var(--red-text);
}

.track-card.is-running .track-card__state {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
}

.track-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.track-card__tags li {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
}

.track-card__cause {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--red) 6%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--red) 22%, var(--border));
  border-left: 3px solid var(--red);
  font-size: var(--fs-xs);
}

.track-card__cause p,
.track-card__cause ul {
  margin: 0;
}

.track-card__headline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
  font-size: var(--fs-sm);
  color: var(--red-text);
}

.track-card__headline svg {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--red-text);
}

.track-card__reasons {
  padding-left: 1.2rem;
  color: var(--text);
  line-height: 1.4;
}

.track-card__hint {
  color: var(--muted);
  line-height: 1.4;
  font-size: var(--fs-xs);
}

.track-card__progress {
  display: grid;
  gap: 4px;
  font-size: var(--fs-xs);
}

.track-card__progress > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--muted);
}

.track-card__progress strong {
  color: var(--text);
  font-weight: 600;
}

.track-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-1);
}
</style>

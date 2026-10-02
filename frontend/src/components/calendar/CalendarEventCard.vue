<template>
  <!-- Une sortie de l'agenda. L'etat se lit a la
       bande de couleur a gauche, doublee d'une etiquette quand il demande attention. -->
  <article
    class="calendar-event-card"
    :class="[`state-${state}`, { interactive, 'has-fanart': !!event.fanart_url }]"
    :role="interactive ? 'link' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? `Ouvrir la fiche de ${event.title}` : undefined"
    @click="interactive && $emit('open', event)"
    @keydown.enter.prevent="interactive && $emit('open', event)"
    @keydown.space.prevent="interactive && $emit('open', event)"
  >
    <div v-if="event.fanart_url" class="card-backdrop" :style="{ backgroundImage: `url(${event.fanart_url})` }"></div>
    <div v-if="event.fanart_url" class="card-backdrop-overlay"></div>

    <div class="card-poster">
      <img v-if="event.poster_url" :src="event.poster_url" :alt="event.title" loading="lazy" decoding="async">
      <div v-else class="poster-fallback"><Film v-if="event.type==='movie'"/><Tv v-else/></div>
    </div>

    <div class="card-info">
      <div class="card-title-row">
        <strong class="card-title">{{ event.title }}</strong>
        <UiTooltip :focusable="false" v-if="event.rating" text="Note TMDB/Plex"><span class="rating-badge"><Star /> {{ event.rating }}</span></UiTooltip>
      </div>

      <div class="card-meta">
        <span v-if="time" class="time-badge"><Clock />{{ time }}</span>
        <span class="subtitle-text"><component :is="releaseIcon(event)" class="release-icon" aria-hidden="true" />{{ event.subtitle }}</span>
        <span v-if="event.instance" class="instance-tag">{{ event.instance }}</span>
      </div>

      <div v-if="event.genres && event.genres.length" class="card-genres">
        <span v-for="g in event.genres" :key="g" class="genre-pill">{{ g }}</span>
      </div>
    </div>

    <div class="card-actions" @click.stop>
      <span v-if="state !== 'available' && state !== 'upcoming'" class="state-chip">
        <Download v-if="state==='downloading'" aria-hidden="true" />{{ STATE_LABELS[state] }}
      </span>
      <!-- Disponible : le bouton suffit, un badge « Disponible » a cote le repetait. -->
      <button
        v-if="state === 'available'"
        type="button"
        class="plex-action-btn"
        title="Regarder sur Plex"
        @click.stop="$emit('play', event, $event)"
      >
        <Play /> <span>Regarder sur Plex</span>
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Download, Film, Play, Star, Tv } from '@lucide/vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { STATE_LABELS, eventState, releaseIcon, type CalendarEvent } from '@/utils/calendarEvents';

const props = withDefaults(defineProps<{
  event: CalendarEvent;
  /** Heure deja formatee (vide pour une sortie sans heure). */
  time?: string;
  now?: number;
}>(), { time: '', now: undefined });

defineEmits<{ open: [event: CalendarEvent]; play: [event: CalendarEvent, domEvent: Event] }>();

const state = computed(() => eventState(props.event, props.now));
const interactive = computed(() => !!(props.event.library_item_id || props.event.request_id));
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.calendar-event-card {
  --state-color: var(--accent);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 12px 16px 12px 18px;
  border-radius: var(--inset-radius);
  background-color: var(--surface);
  transition: transform var(--motion-duration-instant) var(--motion-ease-standard), box-shadow var(--motion-duration-instant) var(--motion-ease-standard);
}
/* Bande d'etat : visible avec ou sans image de fond. */
.calendar-event-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 3;
  width: 4px;
  background: var(--state-color);
}
.state-available { --state-color: var(--success); }
.state-downloading { --state-color: var(--blue); }
.state-late { --state-color: var(--danger); }
.state-released { --state-color: var(--muted); }
.state-upcoming { --state-color: var(--accent); }

.calendar-event-card.interactive { cursor: pointer; }
.calendar-event-card.interactive:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgb(var(--shadow-color) / calc(0.35 * var(--shadow-scale)));
}
.calendar-event-card.interactive:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.card-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center right;
  background-repeat: no-repeat;
}
/* Le voile part de la couleur de surface du theme : le texte garde ses couleurs
   habituelles, en clair comme en sombre (il etait code en dur, sombre, avec un titre
   blanc illisible sur une carte claire sans image). */
.card-backdrop-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 84%, transparent) 45%, color-mix(in srgb, var(--surface) 40%, transparent) 100%);
}

.card-poster, .card-info, .card-actions { position: relative; z-index: 2; }

.card-poster {
  flex: 0 0 54px;
  height: 80px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgb(var(--shadow-color) / calc(0.35 * var(--shadow-scale)));
}
.card-poster img { width: 100%; height: 100%; object-fit: cover; }
.poster-fallback { color: var(--muted); display: grid; place-items: center; }
.poster-fallback svg { width: 24px; height: 24px; }

.card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.card-title-row { display: flex; align-items: center; gap: var(--space-2); }
.card-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rating-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
  gap: 3px;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.rating-badge svg { width: 12px; height: 12px; fill: currentColor; }

.card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-xs); }
.time-badge { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; }
.time-badge svg { width: 13px; height: 13px; }
.subtitle-text { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.release-icon { flex: 0 0 auto; width: 13px; height: 13px; }
.instance-tag { padding: 1px 6px; border-radius: var(--radius-xs); background: rgb(var(--ink) / 0.08); font-size: var(--fs-xs); }

.card-genres { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.genre-pill { padding: 1px 6px; border-radius: var(--radius-xs); background: rgb(var(--ink) / 0.1); color: var(--muted); font-size: var(--fs-xs); font-weight: 500; }

.card-actions { flex: 0 0 auto; display: flex; align-items: center; gap: var(--space-2); }

.state-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--state-color) 16%, transparent);
  color: var(--state-color);
  font-size: var(--fs-xs);
  font-weight: 700;
  white-space: nowrap;
}
.state-chip svg { width: 12px; height: 12px; }

.plex-action-btn, .plex-action-btn * { color: var(--on-accent); }
.plex-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
  border: 0;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent);
  transition: transform var(--motion-duration-instant) var(--motion-ease-standard), background var(--motion-duration-instant) var(--motion-ease-standard);
}
.plex-action-btn:hover { background: color-mix(in srgb, var(--accent) 88%, white); transform: translateY(-1px); }
.plex-action-btn svg { width: 14px; height: 14px; fill: currentColor; }

@include bp.until(tablet) {
  .calendar-event-card { padding: 10px 12px 10px 14px; gap: var(--space-2); flex-wrap: wrap; }
  .calendar-event-card .card-poster { flex: 0 0 44px; height: 64px; }
  .card-title { font-size: var(--fs-sm); }
  .rating-badge { padding: 1px 6px; }
  .rating-badge svg { width: 10px; height: 10px; }
  .calendar-event-card .card-actions { width: 100%; margin-top: 4px; justify-content: space-between; gap: 8px; }
  .calendar-event-card .card-actions:empty { display: none; }
  .plex-action-btn { min-height: 44px; padding: 5px 10px; }
}
</style>

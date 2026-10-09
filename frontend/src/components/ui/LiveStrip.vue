<template>
  <!-- Bandeau « en direct » commun : ce qui se passe maintenant (lectures Plex, fichiers en
       cours d'encodage, telechargements, transferts). La disposition suit le nombre
       d'elements pour occuper toute la largeur : un seul en banniere (fond de l'oeuvre,
       affiche en incrustation), deux a cinq en tuiles fanart, au-dela en mur d'affiches.
       L'image porte un badge (mode, etape, client), qui ou ou, le titre ou le logo, l'etat
       et la progression ; dessous, une ligne qui dit qui et sur quoi, puis les faits, chacun
       avec son icone, quatre au plus (le reste en « +N »). Au repos, il tient sur une ligne.
       La page traduit ses objets en cartes (`items`, voir liveStrip.ts). -->
  <section class="panel live-strip" :class="{ 'is-idle': !items.length }" :aria-labelledby="titleId">
    <template v-if="items.length">
      <header class="live-strip-head">
        <span class="live-strip-badge"><i aria-hidden="true"></i><span>{{ liveLabel }}<span v-if="liveExtra" class="live-strip-badge-extra"> {{ liveExtra }}</span></span></span>
        <h2 :id="titleId">{{ title }}</h2>
        <p v-if="summary" class="live-strip-summary">{{ summary }}</p>
        <RouterLink v-if="link" :to="link.to" class="panel-link">{{ link.label }}</RouterLink>
      </header>
      <div class="live-strip-list" :class="[`is-${layout}`, { 'is-plain': plain }]" :style="{ '--live-count': items.length }">
        <button
          v-for="(item, index) in items"
          :key="item.key"
          type="button"
          class="live-card"
          :class="{ paused: item.paused }"
          :aria-label="[item.title, item.who].filter(Boolean).join(', ')"
          @click="emit('select', item)"
        >
          <span class="live-poster">
            <template v-if="wide">
              <span class="live-backdrop">
                <MediaArtwork v-if="item.backdrop" :src="item.backdrop" alt="" :type="type" size="backdrop" :priority="index === 0" />
                <span v-else-if="item.poster" class="live-backdrop-blur" :style="{ backgroundImage: `url(&quot;${item.poster}&quot;)` }"></span>
              </span>
            </template>
            <MediaArtwork v-else-if="item.poster" :src="item.poster" alt="" :type="type" size="poster" :priority="index === 0" />
            <span v-if="!item.poster && !item.backdrop && item.icon" class="live-poster-icon" aria-hidden="true"><component :is="item.icon" /></span>
            <span class="live-poster-shade" aria-hidden="true"></span>
            <span v-if="item.paused" class="live-poster-pause" aria-hidden="true"><Pause /></span>
            <span class="live-poster-top">
              <slot name="badge" :item="item">
                <span v-if="item.badge" class="live-badge" :class="`is-${item.badge.tone || 'neutral'}`">{{ item.badge.label }}</span>
              </slot>
              <span v-if="item.corner?.label" class="live-corner"><component :is="item.corner.icon" v-if="item.corner.icon" aria-hidden="true" />{{ item.corner.label }}</span>
              <UiAvatar v-else-if="item.corner" :src="item.corner.avatar" :name="item.corner.name || '?'" size="sm" tone="accent" />
            </span>
            <span class="live-poster-bottom">
              <span v-if="wide && item.poster" class="live-inset" aria-hidden="true">
                <MediaArtwork :src="item.poster" alt="" :type="type" size="poster" :priority="index === 0" />
              </span>
              <span class="live-poster-text">
                <template v-if="wide && item.logo && !brokenLogos.has(item.key)">
                  <img class="live-logo" :src="item.logo" alt="" decoding="async" @error="brokenLogos.add(item.key)">
                  <strong class="live-logo-label">{{ item.logoCaption }}</strong>
                </template>
                <strong v-else>{{ item.title }}</strong>
                <small v-if="item.status">{{ item.status }}</small>
                <span v-if="item.progress != null" class="live-card-track"><i :class="{ paused: item.paused }" :style="{ width: `${Math.min(100, Math.max(0, item.progress))}%` }"></i></span>
              </span>
            </span>
          </span>
          <span v-if="item.who" class="live-card-who">{{ item.who }}</span>
          <span v-if="item.facts?.length" class="live-card-chips">
            <span v-for="fact in item.facts.slice(0, FACTS_SHOWN)" :key="fact.key" class="live-chip" :class="fact.tone && fact.tone !== 'neutral' ? fact.tone : ''">
              <component :is="fact.icon" v-if="fact.icon" class="live-chip-icon" aria-hidden="true" />{{ fact.label }}
            </span>
            <span v-if="item.facts.length > FACTS_SHOWN" class="live-chip live-chip-more" :title="item.facts.slice(FACTS_SHOWN).map((fact) => fact.label).join(' · ')">+{{ item.facts.length - FACTS_SHOWN }}</span>
          </span>
          <span v-if="item.note" class="live-card-reason" :title="item.note">{{ item.note }}</span>
        </button>
      </div>
    </template>

    <!-- Au repos, le bandeau tient sur une ligne : un grand cadre vide au sommet de la
         page prenait la place la plus visible pour dire qu'il ne se passait rien. -->
    <div v-else class="live-strip-idle" :aria-busy="loading">
      <span class="live-strip-idle-icon" :class="{ off: idle.warn }"><component :is="idle.icon || Activity" aria-hidden="true" /></span>
      <div class="live-strip-idle-text" :role="loading ? 'status' : undefined">
        <h2 :id="titleId">{{ idle.title }}</h2>
        <p v-if="idle.message">{{ idle.message }}</p>
      </div>
      <template v-if="idle.action">
        <UiButton v-if="idle.action.primary" :to="idle.action.to">{{ idle.action.label }}</UiButton>
        <RouterLink v-else :to="idle.action.to" class="panel-link">{{ idle.action.label }}</RouterLink>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, useId } from 'vue';
import { Activity, Pause } from '@lucide/vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import UiAvatar from './UiAvatar.vue';
import UiButton from './UiButton.vue';
import type { LiveIdle, LiveItem } from './liveStrip';

export type { LiveFact, LiveIdle, LiveItem, LiveTone } from './liveStrip';

const props = withDefaults(
  defineProps<{
    items: LiveItem[];
    /** « 2 lectures », « 3 fichiers en cours »… */
    title: string;
    summary?: string;
    /** Libelle du badge (« En direct ») et sa precision, masquee en largeur etroite. */
    liveLabel?: string;
    liveExtra?: string;
    link?: { label: string; to: string | Record<string, any> } | null;
    /** Etat au repos, au chargement ou en panne : la page dit ce qu'il faut afficher. */
    idle: LiveIdle;
    loading?: boolean;
    /** Type des images (affiches de film, pochettes) pour leur repli. */
    type?: string;
  }>(),
  { summary: '', liveLabel: 'En direct', liveExtra: '', link: null, loading: false, type: 'movie' },
);
const emit = defineEmits<{ select: [item: LiveItem] }>();

const FACTS_SHOWN = 4;
const titleId = `live-strip-${useId()}`;

/* Disposition selon le nombre : chaque element prend toute la largeur du bandeau. */
const layout = computed<'banner' | 'fanart' | 'posters'>(() => {
  const total = props.items.length;
  if (total <= 1) return 'banner';
  return total <= 5 ? 'fanart' : 'posters';
});
const wide = computed(() => layout.value !== 'posters');
/* Sans aucune image (un fichier sans fiche media), une grande banniere ne montrerait
   qu'un fond vide : elle se reduit a une bande. */
const plain = computed(() => props.items.every((item) => !item.backdrop && !item.poster));
/* Un logo introuvable rend la main au titre ecrit. */
const brokenLogos = reactive(new Set<string>());
</script>

<style scoped lang="scss">
.live-strip { display: grid; gap: var(--space-3); min-width: 0; }
.live-strip-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); min-width: 0; }
.live-strip-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl); line-height: 1.2; }
.live-strip-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.live-strip-head .panel-link { margin-left: auto; }
.live-strip-badge { display: inline-flex; align-items: center; gap: var(--space-2); padding: 3px 10px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green-text); font-size: var(--fs-xs); font-weight: 700; }
.live-strip-badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }

/* Mur d'affiches (six et plus) : une colonne par element, etiree pour remplir la ligne ;
   au-dela, le mur defile horizontalement. La marge interne garde la place du contour de
   focus, que le defilement rognerait. */
.live-strip-list { display: grid; grid-template-columns: repeat(var(--live-count), minmax(130px, 1fr)); gap: var(--space-4); min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: thin; padding: 7px; margin: -7px; }
.live-strip-list.is-fanart { grid-template-columns: repeat(var(--live-count), minmax(0, 1fr)); }
.live-strip-list.is-banner { grid-template-columns: minmax(0, 1fr); }
.live-strip-list.is-fanart, .live-strip-list.is-banner { overflow-x: visible; }
.live-card { display: grid; gap: var(--space-2); align-content: start; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; scroll-snap-align: start; }
.live-card:focus-visible { outline: none; }
.live-card:hover .live-poster, .live-card:focus-visible .live-poster { outline: 3px solid var(--accent); outline-offset: 3px; }

/* Tout ce qui est pose sur l'image reste clair sur voile sombre, quel que soit le theme. */
.live-poster { --scrim: 8 10 15; --on-poster: 255 255 255; position: relative; display: block; aspect-ratio: 2 / 3; max-width: 100%; overflow: hidden; border-radius: var(--radius-md); background: var(--media-placeholder); color: rgb(var(--on-poster)); box-shadow: 0 0 0 1px rgb(var(--ink) / 22%), 0 8px 22px -12px rgb(var(--scrim) / 70%); transition: outline-color var(--motion-duration-instant) var(--motion-ease-standard); }
.live-poster::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgb(var(--on-poster) / 12%); pointer-events: none; }
.live-poster :deep(.media-artwork) { position: absolute; inset: 0; }
.live-poster-icon { position: absolute; inset: 0; display: grid; place-items: center; color: rgb(var(--on-poster) / 45%); }
.live-poster-icon svg { width: 32px; height: 32px; }
.live-poster-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgb(var(--scrim) / 94%) 0%, rgb(var(--scrim) / 60%) 32%, transparent 58%), linear-gradient(to bottom, rgb(var(--scrim) / 55%), transparent 26%); }
.live-poster-pause { position: absolute; inset: 0; display: grid; place-items: center; background: rgb(var(--scrim) / 30%); }
.live-poster-pause svg { width: 40px; height: 40px; padding: 10px; border-radius: 50%; background: rgb(var(--scrim) / 60%); fill: currentColor; }
.live-poster-top { position: absolute; top: 8px; right: 8px; left: 8px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.live-poster-top :deep(.playback-badge), .live-badge, .live-corner { background: rgb(var(--scrim) / 62%); backdrop-filter: blur(6px); color: rgb(var(--on-poster) / 88%); }
.live-poster-top :deep(.playback-badge.direct_play), .live-badge.is-ok { color: color-mix(in srgb, var(--green) 45%, white); }
.live-poster-top :deep(.playback-badge.direct_stream), .live-badge.is-accent { color: color-mix(in srgb, var(--blue) 45%, white); }
.live-poster-top :deep(.playback-badge.transcode), .live-badge.is-warn { color: color-mix(in srgb, var(--amber) 45%, white); }
.live-badge, .live-corner { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.live-corner { margin-left: auto; }
.live-corner svg { width: 13px; height: 13px; }
.live-poster-top :deep(.ui-avatar) { box-shadow: 0 0 0 2px rgb(var(--scrim) / 55%); }
.live-poster-bottom { position: absolute; right: 10px; bottom: 10px; left: 10px; display: flex; align-items: flex-end; gap: var(--space-3); }
.live-poster-text { display: grid; flex: 1; gap: 5px; min-width: 0; }
.live-poster-text strong { display: -webkit-box; max-height: 2.7em; overflow: hidden; font-size: var(--fs-sm); line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.live-poster-text small { color: rgb(var(--on-poster) / 78%); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.live-card-track { display: block; height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: rgb(var(--on-poster) / 22%); }
.live-card-track i { display: block; height: 100%; background: var(--plex); transition: width 1s linear; }
.live-card-track i.paused { background: rgb(var(--on-poster) / 60%); transition: none; }

.is-fanart .live-poster { aspect-ratio: 16 / 9; }
.is-banner .live-poster { aspect-ratio: auto; height: clamp(220px, 22vw, 340px); }
.is-plain .live-poster, .is-plain.is-banner .live-poster { aspect-ratio: auto; height: 132px; }
.is-plain .live-poster-icon { justify-items: end; padding-right: var(--space-5); }
.live-backdrop { position: absolute; inset: 0; overflow: hidden; }
.live-backdrop :deep(.media-artwork) { position: absolute; inset: 0; }
.live-backdrop-blur { position: absolute; inset: -24px; background-position: center; background-size: cover; filter: blur(22px) saturate(1.2); opacity: .7; }
.is-fanart .live-poster-shade, .is-banner .live-poster-shade { background: linear-gradient(to top, rgb(var(--scrim) / 92%) 0%, rgb(var(--scrim) / 55%) 40%, transparent 72%), linear-gradient(to right, rgb(var(--scrim) / 55%), transparent 55%), linear-gradient(to bottom, rgb(var(--scrim) / 50%), transparent 30%); }
.live-inset { flex: none; position: relative; width: clamp(56px, 22%, 96px); aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); box-shadow: 0 6px 18px rgb(var(--scrim) / 55%), 0 0 0 1px rgb(var(--on-poster) / 14%); }
.live-inset :deep(.media-artwork) { position: absolute; inset: 0; }
.live-logo { display: block; max-width: min(100%, 240px); max-height: 56px; object-fit: contain; object-position: left bottom; filter: drop-shadow(0 2px 6px rgb(var(--scrim) / 70%)); }
.live-poster-text strong.live-logo-label { font-size: var(--fs-xs); color: rgb(var(--on-poster) / 86%); }
.is-banner .live-poster-bottom { right: var(--space-5); bottom: var(--space-4); left: var(--space-4); gap: var(--space-4); }
.is-banner .live-inset { width: clamp(96px, 11%, 150px); }
.is-banner .live-poster-text { max-width: 640px; }
.is-banner .live-poster-text strong { font-family: var(--font-display); font-size: var(--fs-xl); }
.is-banner .live-poster-text strong.live-logo-label { font-family: inherit; font-size: var(--fs-sm); }
.is-banner .live-logo { max-width: min(100%, 360px); max-height: 96px; }
.is-banner .live-poster-text small { font-size: var(--fs-sm); }
.is-banner .live-card-track { height: 5px; }

.live-card-who { overflow: hidden; color: var(--text); font-size: var(--fs-sm); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
/* Faits : une icone qui dit ce qu'est la valeur, une hauteur et un espacement reguliers,
   quatre au plus -- la ligne se lit d'un regard au lieu d'une suite de sigles. */
.live-card-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.live-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 24px; padding: 2px 8px; border-radius: var(--radius-sm); background: rgb(var(--ink) / 6%); color: var(--text); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.live-chip-icon { flex: none; width: 13px; height: 13px; color: var(--muted); }
.live-chip.hdr { background: color-mix(in srgb, var(--violet) 12%, transparent); color: var(--violet-text); }
.live-chip.remote { background: color-mix(in srgb, var(--blue) 11%, transparent); color: var(--blue-text); }
.live-chip.warn { background: color-mix(in srgb, var(--amber) 12%, transparent); color: var(--amber-text); }
.live-chip.ok { background: color-mix(in srgb, var(--green) 11%, transparent); color: var(--green-text); }
.live-chip.accent { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
.live-chip.hdr .live-chip-icon, .live-chip.remote .live-chip-icon, .live-chip.warn .live-chip-icon, .live-chip.ok .live-chip-icon, .live-chip.accent .live-chip-icon { color: currentColor; }
.live-chip-more { color: var(--muted); cursor: help; }
.live-card-reason { display: -webkit-box; overflow: hidden; color: var(--amber-text); font-size: var(--fs-xs); line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }

@media (prefers-reduced-motion: reduce) { .live-card-track i, .live-poster { transition: none; } }

.live-strip.is-idle { display: block; }
.live-strip-idle { display: flex; align-items: center; gap: var(--space-3) var(--space-4); flex-wrap: wrap; min-width: 0; }
.live-strip-idle-icon { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); }
.live-strip-idle-icon svg { width: 20px; height: 20px; }
.live-strip-idle-icon.off { color: var(--amber-text); background: color-mix(in srgb, var(--amber) 12%, transparent); }
.live-strip-idle-text { display: grid; gap: 2px; flex: 1; min-width: min(240px, 100%); }
.live-strip-idle-text h2 { margin: 0; font-size: var(--fs-md); }
.live-strip-idle-text p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

@container page (max-width: 700px) {
  .live-strip-head { gap: var(--space-1) var(--space-3); }
  .live-strip-head h2 { font-size: var(--fs-lg); }
  .live-strip-badge-extra { display: none; }
  .live-strip-head .panel-link { order: 2; }
  .live-strip-head h2 { order: 3; }
  .live-strip-summary { order: 4; }
  .live-strip-list.is-fanart, .live-strip-list.is-posters { grid-template-columns: none; grid-auto-flow: column; overflow-x: auto; scroll-snap-type: x mandatory; gap: var(--space-3); }
  .live-strip-list.is-fanart { grid-auto-columns: 86%; }
  .live-strip-list.is-posters { grid-auto-columns: minmax(150px, 46%); }
  .is-banner .live-poster { height: auto; aspect-ratio: 4 / 3; }
}
</style>

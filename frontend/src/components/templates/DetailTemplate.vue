<template>
  <!-- Gabarit « Fiche » : repond a « tout sur cet element ».
         1. l'en-tete (SheetHero, celui de la fiche media) : banniere, affiche ou icone,
            type, titre, informations cles, etat en badges, resume (SheetSummary), et les
            actions -- la principale en avant, deux secondaires au plus, le reste dans « … » ;
         2. une seule alerte d'etat, la plus importante, avec le lien qui la traite ;
         3. les onglets de detail (UiTabs, « consulter ») : la seule rangee de la fiche (emplacements
            `tab-<cle>`) ;
         4. les faits, en panneau lateral sur grand ecran, sous les onglets sur telephone.
       Les actions vivent dans l'en-tete, jamais dans un onglet. -->
  <article class="detail">
    <UiButton v-if="back" class="detail__back" size="sm" variant="ghost" @click="emit('back')"><template #icon><ArrowLeft /></template>Retour</UiButton>
    <!-- L'en-tete commun des fiches (SheetHero), celui de la fiche media : banniere qui ne
         porte que l'image, affiche qui en chevauche le bas, texte dessous. -->
    <SheetHero :image-url="backdrop || null" :variant="variant" stack-on-mobile fade :dock="['badges', 'dates', 'actions']" class="detail__hero">
      <template v-if="$slots.overlay" #overlay><slot name="overlay" /></template>
      <template #poster>
        <div class="detail__cover" :class="{ 'is-square': posterShape === 'square' }">
          <img v-if="poster && !posterFailed" :src="proxyUrl(poster, { width: 780 })" :srcset="srcSetFor(poster, { width: 780 })" sizes="(max-width: 767px) 140px, 220px" alt="" loading="eager" fetchpriority="high" decoding="async" @error="posterFailed = true" />
          <component :is="icon || FileQuestion" v-else aria-hidden="true" />
        </div>
      </template>
      <div class="detail__identity">
        <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
        <h1 class="detail__title">{{ title }}</h1>
        <p v-if="meta.length" class="detail__meta">{{ meta.join(' · ') }}</p>
        <slot name="identity" />
        <template v-if="loading && !summary"><div class="detail__skeleton" aria-hidden="true"><span class="skeleton-line" /><span class="skeleton-line" /><span class="skeleton-line is-short" /></div></template>
        <SheetSummary v-else-if="summary" :text="summary" :lines="4" />
      </div>
      <!-- Le dock (voir SheetHero) : l'etat, les dates cles et les actions se glissent a droite de
           l'affiche, sous le texte, tant qu'ils tiennent sans en depasser le bas ; sinon ils restent
           dessous, en ligne. -->
      <template #dock-badges>
        <ul v-if="badges.length || $slots.badges" class="detail__badges" aria-label="État">
          <li v-for="badge in badges" :key="badge.key" :class="`is-${badge.tone}`">{{ badge.label }}</li>
          <slot name="badges" />
        </ul>
      </template>
      <template #dock-dates>
        <dl v-if="dates.length" class="detail__dates">
          <div v-for="entry in dates" :key="entry.label"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
        </dl>
      </template>
      <template #dock-actions>
        <div v-if="loading" class="detail__actions" aria-hidden="true"><span class="skeleton-pill" /><span class="skeleton-pill" /></div>
        <div v-else-if="actions.length" class="detail__actions">
          <UiButton
            v-for="(action, index) in shownActions"
            :key="action.key"
            size="sm"
            :variant="index === 0 ? 'primary' : action.danger ? 'danger' : 'secondary'"
            :to="action.to"
            :href="action.href"
            :disabled="action.disabled"
            @click="!action.to && !action.href && emit('action', action.key)"
          >
            <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}<small v-if="action.count" class="detail__count">{{ action.count }}</small>
          </UiButton>
          <UiMenu v-if="menuActions.length" align="end" label="Actions">
            <template #trigger><UiButton size="sm" icon-only aria-label="Plus d’actions" title="Plus d’actions"><MoreHorizontal /></UiButton></template>
            <template v-for="(action, index) in menuActions" :key="action.key">
              <UiMenuSeparator v-if="action.separated && index > 0" />
              <UiMenuItem :variant="action.danger ? 'danger' : 'default'" :disabled="action.disabled" @select="menuSelect(action)">
                <component :is="action.icon" v-if="action.icon" :size="15" aria-hidden="true" />{{ action.label }}
              </UiMenuItem>
            </template>
          </UiMenu>
        </div>
      </template>
    </SheetHero>

    <div v-if="alert" class="detail__alert" :class="`is-${alert.tone}`" role="status">
      <AlertTriangle aria-hidden="true" />
      <span>{{ alert.message }}</span>
      <template v-if="alert.link">
        <RouterLink v-if="alert.link.to" :to="alert.link.to" class="detail__alert-link">{{ alert.link.label }}</RouterLink>
        <button v-else-if="alert.link.tab" type="button" class="detail__alert-link" @click="emit('update:tab', alert.link.tab)">{{ alert.link.label }}</button>
      </template>
    </div>

    <div class="detail__body" :class="{ 'has-facts': facts.length }">
      <!-- Onglets « consulter » (UiTabs) : les parties de cet element, pas une navigation. -->
      <UiTabs v-if="tabs.length > 1" :model-value="activeTab" :items="tabs" ariaLabel="Sections de la fiche" @update:model-value="emit('update:tab', $event)">
        <template #default="{ tab: shown }"><slot :name="`tab-${shown}`" /></template>
      </UiTabs>
      <div v-else class="detail__panel"><slot :name="`tab-${activeTab}`" /></div>
      <dl v-if="facts.length" class="detail__facts">
        <div v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
      </dl>
    </div>
    <!-- Sous les onglets : ce qui accompagne la fiche sans en etre une partie (distribution, suggestions…). -->
    <slot name="after" />
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { AlertTriangle, ArrowLeft, FileQuestion, MoreHorizontal } from '@lucide/vue';
import { proxyUrl, srcSetFor } from '@/utils/mediaImage';
import SheetHero from '@/components/ui/SheetHero.vue';
import SheetSummary from '@/components/ui/SheetSummary.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import UiTabs from '@/components/ui/UiTabs.vue';
import type { DetailAction, DetailAlert, DetailBadge, DetailFact, DetailTab } from './detail/types';

export type { DetailAction, DetailAlert, DetailBadge, DetailFact, DetailTab, DetailTone } from './detail/types';

const props = withDefaults(
  defineProps<{
    title: string;
    poster?: string | null;
    /** Image de la banniere (fond de film, pochette…). */
    backdrop?: string | null;
    /** Type de l'element, au-dessus du titre (« Film », « Utilisateur »…). */
    eyebrow?: string;
    /** Resume, replie a quelques lignes. */
    summary?: string;
    /** `sheet` dans la feuille de l'overlay, `card` en page. */
    variant?: 'card' | 'sheet';
    icon?: any;
    /** Informations cles : annee, type, duree… */
    meta?: string[];
    badges?: DetailBadge[];
    /** La premiere est l'action principale ; au-dela de trois, le reste passe dans « … ». */
    actions?: DetailAction[];
    alert?: DetailAlert | null;
    tabs?: DetailTab[];
    tab?: string;
    facts?: DetailFact[];
    /** Dates cles, a cote de l'affiche (sorties, prochain episode…). */
    dates?: DetailFact[];
    /** Donnees partielles en attendant la fiche : le resume et les actions montrent un squelette. */
    loading?: boolean;
    /** `square` pour une pochette (musique). */
    posterShape?: 'portrait' | 'square';
    /** Fiche ouverte en pleine page par son adresse : un « Retour » en tete (en feuille, on la ferme). */
    back?: boolean;
  }>(),
  { poster: null, backdrop: null, eyebrow: '', summary: '', variant: 'sheet', icon: null, meta: () => [], badges: () => [], actions: () => [], alert: null, tabs: () => [], tab: '', facts: () => [], dates: () => [], loading: false, posterShape: 'portrait', back: false },
);
const emit = defineEmits<{ action: [key: string]; 'update:tab': [key: string]; back: [] }>();

const router = useRouter();
const posterFailed = ref(false);
watch(() => props.poster, () => { posterFailed.value = false; });
/* Trois actions visibles au plus ; celles qui se declarent `menu`, et le reste au-dela, vont dans « … ». */
const visible = computed(() => props.actions.filter((action) => !action.menu).slice(0, 3));
const shownActions = visible;
const menuActions = computed(() => props.actions.filter((action) => !visible.value.includes(action)));
/* Une action du menu qui est un lien s'ouvre comme un lien ; les autres remontent. */
function menuSelect(action: DetailAction): void {
  if (action.href) window.open(action.href, '_blank', 'noopener,noreferrer');
  else if (action.to) void router.push(action.to);
  else emit('action', action.key);
}
const activeTab = computed(() => props.tab || props.tabs[0]?.key || 'main');
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.detail { display: grid; gap: var(--space-4); min-width: 0; }
.detail__back { justify-self: start; }
/* Meme affiche que la fiche media (.mdh-poster) : 180px, ombree, chevauchant la banniere. */
.detail__cover { display: grid; place-items: center; width: 220px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); box-shadow: 0 16px 40px rgba(0, 0, 0, .5); }
.detail__cover img { width: 100%; height: 100%; object-fit: cover; }
.detail__cover svg { width: 32px; height: 32px; }
.detail__cover.is-square { aspect-ratio: 1; }
.detail__dates { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: var(--fs-xs); }
.detail__dates > div { display: grid; gap: 1px; }
.detail__dates dt { color: var(--muted); }
.detail__dates dd { margin: 0; font-weight: 600; }
.detail__count { margin-left: 6px; padding: 0 6px; border-radius: var(--radius-pill); background: color-mix(in srgb, currentColor 16%, transparent); font-size: var(--fs-xs); }
.detail__skeleton { display: grid; gap: 6px; }
.detail__identity { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
.detail__title { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl, 1.5rem); overflow-wrap: anywhere; }
.detail__meta { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.detail__badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.detail__badges li { padding: 2px 9px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-xs); font-weight: 600; }
.detail__badges li.is-plain { padding: 0; background: none; }
.detail__badges .is-success { background: color-mix(in srgb, var(--green) 14%, var(--surface)); color: var(--green-text, var(--green)); }
.detail__badges .is-warning { background: color-mix(in srgb, var(--amber) 16%, var(--surface)); color: var(--amber-text); }
.detail__badges .is-danger { background: color-mix(in srgb, var(--red) 14%, var(--surface)); color: var(--red-text); }
.detail__badges .is-info { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
.detail__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.detail__alert { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); font-size: var(--fs-sm); }
.detail__alert svg { flex: none; width: 16px; height: 16px; }
.detail__alert > span { flex: 1 1 14rem; }
.detail__alert.is-danger { background: color-mix(in srgb, var(--red) 10%, var(--surface)); color: var(--red-text); }
.detail__alert.is-warning { background: color-mix(in srgb, var(--amber) 12%, var(--surface)); color: var(--amber-text); }
.detail__alert.is-info { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); color: var(--accent); }
.detail__alert-link { padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.detail__body { display: grid; gap: var(--space-4); min-width: 0; }
.detail__body.has-facts { grid-template-columns: minmax(0, 1fr) 14rem; align-items: start; }
.detail__panel { min-width: 0; }
.detail__facts { display: grid; margin: 0; font-size: var(--fs-sm); }
.detail__facts > div { display: flex; justify-content: space-between; gap: var(--space-2); padding: 6px 0; border-bottom: 1px solid var(--border); }
.detail__facts dt { color: var(--muted); }
.detail__facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }

@include bp.until(tablet) {
  .detail__cover { width: 140px; }
}
@include bp.until(desktop) {
  .detail__body.has-facts { grid-template-columns: minmax(0, 1fr); }
}
</style>

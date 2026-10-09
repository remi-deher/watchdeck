<template>
  <!-- Gabarit « Fiche » : repond a « tout sur cet element ».
         1. l'en-tete : affiche ou icone, titre, informations cles, etat en badges, et les
            actions -- la principale en avant, deux secondaires au plus, le reste dans « … » ;
         2. une seule alerte d'etat, la plus importante, avec le lien qui la traite ;
         3. les onglets de detail (UiTabs, « consulter ») : la seule rangee de la fiche (emplacements
            `tab-<cle>`) ;
         4. les faits, en panneau lateral sur grand ecran, sous les onglets sur telephone.
       Les actions vivent dans l'en-tete, jamais dans un onglet. -->
  <article class="detail">
    <header class="detail__hero">
      <div class="detail__cover">
        <img v-if="poster && !posterFailed" :src="proxyUrl(poster, { width: 300 })" alt="" @error="posterFailed = true" />
        <component :is="icon || FileQuestion" v-else aria-hidden="true" />
      </div>
      <div class="detail__identity">
        <h1 class="detail__title">{{ title }}</h1>
        <p v-if="meta.length" class="detail__meta">{{ meta.join(' · ') }}</p>
        <ul v-if="badges.length" class="detail__badges" aria-label="État">
          <li v-for="badge in badges" :key="badge.key" :class="`is-${badge.tone}`">{{ badge.label }}</li>
        </ul>
        <div v-if="actions.length" class="detail__actions">
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
            <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
          </UiButton>
          <UiMenu v-if="menuActions.length" align="end">
            <template #trigger><UiButton size="sm" icon-only aria-label="Plus d’actions" title="Plus d’actions"><MoreHorizontal /></UiButton></template>
            <UiMenuItem v-for="action in menuActions" :key="action.key" :variant="action.danger ? 'danger' : 'default'" :disabled="action.disabled" @select="emit('action', action.key)">{{ action.label }}</UiMenuItem>
          </UiMenu>
        </div>
      </div>
    </header>

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
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { AlertTriangle, FileQuestion, MoreHorizontal } from '@lucide/vue';
import { proxyUrl } from '@/utils/mediaImage';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiTabs from '@/components/ui/UiTabs.vue';
import type { DetailAction, DetailAlert, DetailBadge, DetailFact, DetailTab } from './detail/types';

export type { DetailAction, DetailAlert, DetailBadge, DetailFact, DetailTab, DetailTone } from './detail/types';

const props = withDefaults(
  defineProps<{
    title: string;
    poster?: string | null;
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
  }>(),
  { poster: null, icon: null, meta: () => [], badges: () => [], actions: () => [], alert: null, tabs: () => [], tab: '', facts: () => [] },
);
const emit = defineEmits<{ action: [key: string]; 'update:tab': [key: string] }>();

const posterFailed = ref(false);
const shownActions = computed(() => props.actions.slice(0, 3));
const menuActions = computed(() => props.actions.slice(3));
const activeTab = computed(() => props.tab || props.tabs[0]?.key || 'main');
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.detail { display: grid; gap: var(--space-4); min-width: 0; }
.detail__hero { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--space-4); }
.detail__cover { display: grid; place-items: center; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); }
.detail__cover img { width: 100%; height: 100%; object-fit: cover; }
.detail__cover svg { width: 32px; height: 32px; }
.detail__identity { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
.detail__title { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl, 1.5rem); overflow-wrap: anywhere; }
.detail__meta { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.detail__badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.detail__badges li { padding: 2px 9px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-xs); font-weight: 600; }
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

@include bp.until(phablet) {
  .detail__hero { grid-template-columns: 84px minmax(0, 1fr); }
}
@include bp.until(desktop) {
  .detail__body.has-facts { grid-template-columns: minmax(0, 1fr); }
}
</style>

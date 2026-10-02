<template>
  <div ref="root" v-show="visible" class="settings-item" :class="{ 'is-openable': openable, 'has-detail': hasDetail }" role="listitem">
    <component
      :is="openable ? 'button' : 'div'"
      :type="openable ? 'button' : undefined"
      class="settings-item-main"
      :aria-haspopup="hasDetail ? 'dialog' : undefined"
      @click="openable && openDetail()"
    >
      <span v-if="icon" class="settings-item-icon"><component :is="icon" aria-hidden="true" /></span>
      <span class="settings-item-text">
        <span class="settings-item-title">
          {{ title }}
          <small v-if="tag" class="settings-item-tag">{{ tag }}</small>
        </span>
        <span v-if="subtitle" class="settings-item-subtitle">{{ subtitle }}</span>
      </span>
      <span v-if="statusLabel" class="settings-item-status" :class="status">{{ statusLabel }}</span>
    </component>
    <div v-if="$slots.actions" class="settings-item-actions"><slot name="actions" /></div>
    <span v-if="openable" class="settings-item-chevron" aria-hidden="true"><ChevronRight /></span>
  </div>

  <ModalShell
    v-if="hasDetail"
    :open="detailOpen"
    :title="title"
    panel-class="settings-drawer"
    :error="saveable ? error : ''"
    :busy="saveable && saving"
    @close="detailOpen = false"
  >
    <div class="settings-drawer-body">
      <!-- Les actions rapides de la ligne reviennent en tete du volet : sur telephone, la
           ligne les masque pour garder une liste courte. -->
      <div v-if="$slots.actions" class="settings-drawer-quick"><slot name="actions" /></div>
      <slot :close="closeDetail" />
    </div>
    <template v-if="saveable || $slots['detail-actions']" #actions>
      <slot name="detail-actions" :close="closeDetail" />
      <UiButton v-if="saveable" variant="primary" :loading="saving" @click="saveAndClose">
        <template #icon><Save /></template>{{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
/**
 * Un objet de reglage : une connexion, une instance, un canal, une tache.
 *
 * Cartes pour les objets, lignes pour les reglages, disait la regle -- la carte s'en va
 * elle aussi. Un objet tient sur une ligne qui dit l'essentiel d'un coup d'oeil : son
 * nom, un resume, son etat, une action rapide (Tester, Activer). Le detail s'ouvre dans
 * un volet (a droite sur ordinateur, feuille en bas sur telephone) plutot que de deplier
 * la page : on voit toutes les connexions et leur etat sans rien ouvrir.
 *
 * - avec un slot par defaut : la ligne ouvre ce contenu dans le volet ;
 * - avec `clickable` sans slot : la ligne emet `open` (formulaire a sa propre adresse) ;
 * - sinon : ligne inerte, seules ses actions rapides reagissent.
 *
 * `saveable` ajoute « Enregistrer » au volet, pour les objets dont les champs vivent
 * dans le formulaire global des reglages : on enregistre la ou l'on vient de saisir.
 */
import { computed, inject, ref, useSlots, type Component } from 'vue';
import { ChevronRight, Save } from '@lucide/vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { error, save, saving } from '@/settingsForm';
import { SETTINGS_GROUP_KEY, useSearchableBlock } from '@/composables/useSettingsSearch';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: Component | null;
    /** active | inactive | error | neutral */
    status?: string;
    statusText?: string;
    /** Petite mention a cote du titre (« Par défaut », « Principal »...). */
    tag?: string;
    /** Mots que la recherche doit trouver alors qu'ils ne sont visibles que dans le volet. */
    keywords?: string;
    clickable?: boolean;
    saveable?: boolean;
  }>(),
  { subtitle: '', icon: null, status: 'neutral', statusText: '', tag: '', keywords: '', clickable: false, saveable: false }
);
const emit = defineEmits<{ (e: 'open'): void }>();
const slots = useSlots();

const hasDetail = computed(() => Boolean(slots.default));
const openable = computed(() => hasDetail.value || props.clickable);
const detailOpen = ref(false);

function openDetail(): void {
  if (hasDetail.value) detailOpen.value = true;
  else emit('open');
}
function closeDetail(): void { detailOpen.value = false; }

async function saveAndClose(): Promise<void> {
  await save();
  if (!error.value) detailOpen.value = false;
}

const defaultLabels: Record<string, string> = { active: 'Actif', inactive: 'Inactif', error: 'Erreur', neutral: '' };
const statusLabel = computed(() => props.statusText || defaultLabels[props.status || ''] || '');

const group = inject(SETTINGS_GROUP_KEY, null);
const root = ref<HTMLElement | null>(null);
const { visible } = useSearchableBlock(() => root.value, () => `${props.title} ${props.subtitle} ${props.keywords}`, {
  alsoMatches: () => Boolean(group?.titleMatches.value),
});

defineExpose({ open: openDetail, close: closeDetail });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.settings-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding-right: var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  transition: background var(--motion-duration-fast) var(--motion-ease-standard);
}

.settings-item:last-child {
  border-bottom: 0;
}

.settings-item.is-openable:hover {
  background: color-mix(in srgb, var(--surface-2) 70%, var(--surface));
}

.settings-item-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'icon text status';
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  min-height: 60px;
  padding: 10px 0 10px var(--space-4);
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
}

button.settings-item-main {
  cursor: pointer;
}

button.settings-item-main:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

.settings-item-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
}

.settings-item-icon svg {
  width: 17px;
  height: 17px;
}

.settings-item-text {
  grid-area: text;
  display: grid;
  gap: 2px;
  min-width: 0;
}

.settings-item-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  font-weight: 650;
}

.settings-item-tag {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 500;
}

.settings-item-subtitle {
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.4;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* L'etat se lit a la couleur ET au mot : une pastille et son libelle. */
.settings-item-status {
  grid-area: status;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 96px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
}

.settings-item-status::before {
  content: '';
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.8;
}

.settings-item-status.active { color: var(--green-text); }
.settings-item-status.error { color: var(--red-text); }

.settings-item-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.settings-item-chevron {
  display: grid;
  place-items: center;
  color: var(--muted);
}

.settings-item-chevron svg {
  width: 16px;
  height: 16px;
}

/* Sur telephone, l'etat passe sous le titre et les actions rapides sur leur propre
   rangee : la ligne garde son nom lisible au lieu de le tronquer a trois lettres. */
@include bp.until(phablet) {
  .settings-item {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'main chevron' 'actions actions';
    padding-right: var(--space-3);
  }
  .settings-item-main {
    grid-area: main;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: 'icon text' 'icon status';
    row-gap: 4px;
    padding-left: var(--space-3);
  }
  .settings-item-status { min-width: 0; }
  .settings-item-chevron { grid-area: chevron; }
  .settings-item-actions {
    grid-area: actions;
    justify-content: flex-start;
    padding: 0 0 10px calc(var(--space-3) + 34px + var(--space-3));
  }
  .settings-item-actions:empty,
  .settings-item.has-detail .settings-item-actions { display: none; }
}

/* Sur ordinateur, une colonne d'actions de largeur commune : les etats s'alignent d'une
   ligne a l'autre, qu'elle porte un bouton Tester, un interrupteur ou trois icones. */
@include bp.from(phablet) {
  .settings-item-actions { min-width: 132px; }
}
</style>

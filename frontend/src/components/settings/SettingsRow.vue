<template>
  <div ref="root" v-show="visible" class="settings-row" :class="{ disabled, block }">
    <div class="settings-row-label">
      <component :is="labelFor ? 'label' : 'span'" :for="labelFor" class="settings-row-title">{{ label }}</component>
      <p v-if="description" class="settings-row-desc">{{ description }}</p>
    </div>
    <div class="settings-row-control"><slot /></div>
  </div>
</template>

<script setup lang="ts">
/**
 * Une ligne de reglage : libelle a gauche, controle a droite, filet de separation.
 *
 * Remplace l'ancienne carte pour les reglages proprement dits. Une carte coute ~105 px
 * de decor avant le premier champ (icone 44 px, padding 44 px, bordure, ombre,
 * espacement) : sur une page de reglages on ne consulte pas, on CHERCHE, et chaque
 * bordure interrompt le balayage vertical du regard. Un objet autonome dote d'un etat
 * -- une connexion Plex, une instance Sonarr -- est une ligne de SettingsItem, qui
 * ouvre son detail dans un volet.
 *
 * `block` bascule le controle sous le libelle : pour les contenus larges (selecteur
 * de bibliotheques, groupes de cases) qu'une colonne de droite comprimerait.
 */
import { inject, ref } from 'vue';
import { SETTINGS_GROUP_KEY, useSearchableBlock } from '@/composables/useSettingsSearch';

const props = withDefaults(
  defineProps<{
    label: string;
    description?: string;
    /** Grise la ligne quand le reglage depend d'un autre, desactive. */
    disabled?: boolean;
    /** Place le controle sous le libelle plutot qu'a sa droite. */
    block?: boolean;
    /** id du champ, pour rendre le libelle cliquable. */
    labelFor?: string;
  }>(),
  { description: '', disabled: false, block: false, labelFor: '' }
);

/* Une ligne se masque quand elle ne correspond pas a la recherche, sauf si c'est le
   titre de sa section qui correspond. Elle ne compte pas dans le total du champ : ce sont
   les sections qu'on compte. */
const group = inject(SETTINGS_GROUP_KEY, null);
const root = ref<HTMLElement | null>(null);
const { visible } = useSearchableBlock(() => root.value, () => `${props.label} ${props.description}`, {
  count: false,
  alsoMatches: () => Boolean(group?.titleMatches.value),
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  gap: var(--space-4);
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.settings-row:last-child {
  border-bottom: 0;
}

/* Grise sans masquer : le reglage reste lisible, on comprend juste qu'il est inerte. */
.settings-row.disabled .settings-row-label {
  opacity: 0.5;
}

.settings-row-label {
  min-width: 0;
}

.settings-row-title {
  display: block;
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 600;
}

label.settings-row-title {
  cursor: pointer;
}

.settings-row-desc {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.45;
  /* Une description qui court sur toute la largeur redevient un pave : on la borne. */
  max-width: 70ch;
}

.settings-row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-width: 0;
}

/* Les champs texte/nombre ont besoin d'une largeur utile sans envahir la ligne. */
.settings-row-control :deep(input[type='text']),
.settings-row-control :deep(input[type='number']),
.settings-row-control :deep(input:not([type])),
.settings-row-control :deep(select) {
  min-width: 0;
  max-width: 260px;
}

.settings-row-control :deep(input[type='checkbox']) {
  width: 18px;
  height: 18px;
  flex: none;
  cursor: pointer;
}

/* Controle large : il passe sous le libelle et occupe toute la largeur. */
.settings-row.block {
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: var(--space-3);
}

.settings-row.block .settings-row-control {
  justify-content: flex-start;
}

.settings-row.block .settings-row-control :deep(input),
.settings-row.block .settings-row-control :deep(select) {
  max-width: none;
}

/* Sous 640 px la colonne de droite n'a plus la place : on empile, en gardant le
   filet de separation qui structure la lecture. */
@include bp.until(phablet) {
  .settings-row {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: var(--space-2);
  }

  .settings-row-control {
    justify-content: flex-start;
  }

  .settings-row-control :deep(input[type='text']),
  .settings-row-control :deep(input[type='number']),
  .settings-row-control :deep(input:not([type])),
  .settings-row-control :deep(select) {
    max-width: none;
    width: 100%;
  }
}
</style>

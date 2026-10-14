<template>
  <!-- Objets geres par l'API (instances *arr, clients, serveurs Plex, fournisseurs d'email) :
       le bloc commun ResourceList du gabarit Configurer. Modifier ouvre la fenetre « Creer »
       a sa propre adresse (`open-modal`) ; ajouter fait de meme sans objet. -->
  <div class="crud-list">
    <p v-if="subtitle" class="crud-list__subtitle">{{ subtitle }}</p>
    <ResourceList
      :resources="resources"
      :add-label="addLabel"
      :empty-text="emptyLabel"
      @add="$emit('open-modal')"
      @edit="(resource) => $emit('open-modal', byKey(resource.key))"
      @toggle="(resource) => $emit('toggle', byKey(resource.key))"
      @test="(resource) => $emit('test', byKey(resource.key))"
      @action="onAction"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Trash2 } from '@lucide/vue';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import type { ConfigureResource } from '@/components/templates/configure/types';

const props = withDefaults(
  defineProps<{
    subtitle?: string;
    items?: any[];
    /** Titre d'une ligne. */
    itemTitle?: (item: any) => string;
    /** Resume d'une ligne : type, adresse... */
    itemSubtitle?: (item: any) => string;
    /** Mention a cote du titre. */
    itemTag?: (item: any) => string;
    emptyLabel?: string;
    addLabel?: string;
    hasTest?: boolean;
    /** Etat reel d'une ligne (connexion verifiee), a la place de « Actif / Inactif ». */
    itemLive?: (item: any) => { status: string; text: string; detail: string } | null;
    /** Champ qui, vrai sur une ligne, masque Activer et Supprimer (ex. serveur Plex principal). */
    lockedKey?: string;
    /** Actions propres a une ligne (« Monter »…), remontees par `action`. */
    itemActions?: (item: any, index: number) => NonNullable<ConfigureResource['actions']>;
  }>(),
  {
    subtitle: '',
    items: () => [],
    itemTitle: (item: any) => String(item.name ?? ''),
    itemSubtitle: (item: any) => String(item.url ?? ''),
    itemTag: () => '',
    emptyLabel: 'Aucun élément configuré.',
    addLabel: 'Ajouter',
    hasTest: true,
    lockedKey: '',
    itemActions: () => [],
  }
);

const emit = defineEmits<{
  (e: 'open-modal', item?: any): void;
  (e: 'toggle', item: any): void;
  (e: 'remove', item: any): void;
  (e: 'test', item?: any): void;
  (e: 'action', item: any, key: string): void;
}>();

const TONES: Record<string, 'ok' | 'error' | 'off'> = { active: 'ok', error: 'error', inactive: 'off' };
const byKey = (key: string) => props.items.find((item) => String(item.id) === key);

const resources = computed<ConfigureResource[]>(() => props.items.map((item, index) => {
  const live = props.itemLive?.(item) || null;
  const locked = Boolean(props.lockedKey && item[props.lockedKey]);
  const summary = live?.status === 'error' ? live.detail : [props.itemSubtitle(item), live?.detail].filter(Boolean).join(' · ');
  return {
    key: String(item.id),
    label: props.itemTitle(item),
    subtitle: summary,
    tag: item.is_default ? 'Par défaut' : props.itemTag(item),
    enabled: locked ? undefined : Boolean(item.enabled),
    state: live?.text ? { tone: TONES[live.status] || 'off', text: live.text } : undefined,
    testable: props.hasTest,
    actions: [
      ...props.itemActions(item, index),
      ...(locked ? [] : [{ key: 'remove', label: 'Supprimer', icon: Trash2, tone: 'danger' as const, iconOnly: true }]),
    ],
  };
}));

function onAction(resource: ConfigureResource, key: string): void {
  const item = byKey(resource.key);
  if (key === 'remove') emit('remove', item);
  else emit('action', item, key);
}
</script>

<style scoped lang="scss">
.crud-list { display: grid; gap: var(--space-2); }
.crud-list__subtitle { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>

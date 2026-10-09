<template>
  <!-- Socle de tous les gabarits : la page du shell (AppPage), sa rangee d'onglets unique
       et les etats de page communs. Les gabarits metier (Surveiller, Traiter…) le
       composent ; une page n'utilise jamais AppPage directement.
       Recherche, filtres et retours passent tels quels a AppPage ($attrs). -->
  <AppPage v-bind="$attrs" :title="title" :hide-search="hideSearch" :error="state === 'error' ? error : ''" :loading="state === 'loading'" :loading-message="loadingMessage" retry @retry="emit('retry')">
    <!-- La seule rangee d'onglets de la page : une page n'en ajoute pas d'autre. -->
    <template v-if="tabs.length > 1" #tabs>
      <AppSubnav :items="tabs" :active="activeTab" :aria-label="tabsLabel || `Vues de ${title}`" />
    </template>
    <template v-if="$slots.tools" #tools><slot name="tools" /></template>

    <UiEmptyState v-if="state === 'unconfigured'" :title="unconfigured.title" :message="unconfigured.message" :icon="unconfigured.icon">
      <template v-if="unconfigured.actionTo" #action>
        <UiButton :to="unconfigured.actionTo" variant="primary">{{ unconfigured.actionLabel || 'Configurer' }}</UiButton>
      </template>
    </UiEmptyState>
    <UiEmptyState v-else-if="state === 'empty'" :title="empty.title" :message="empty.message" :icon="empty.icon" />
    <slot v-else-if="state === 'ready'" />
  </AppPage>
</template>

<script setup lang="ts">
import AppPage from '@/components/ui/AppPage.vue';
import AppSubnav, { type SubnavItem } from '@/components/ui/AppSubnav.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

/** `ready` montre le contenu ; les autres etats le remplacent, a l'identique partout. */
export type PageState = 'ready' | 'loading' | 'error' | 'unconfigured' | 'empty';

export interface PageMessage {
  title: string;
  message?: string;
  icon?: any;
  /** Etat « non configure » : ou aller brancher le service. */
  actionTo?: string;
  actionLabel?: string;
}

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    title: string;
    /** Onglets de la page : vues d'une meme entree du menu. */
    tabs?: SubnavItem[];
    activeTab?: string;
    tabsLabel?: string;
    state?: PageState;
    error?: string;
    loadingMessage?: string;
    unconfigured?: PageMessage;
    empty?: PageMessage;
    hideSearch?: boolean;
  }>(),
  {
    tabs: () => [],
    activeTab: '',
    tabsLabel: '',
    state: 'ready',
    error: '',
    loadingMessage: 'Chargement…',
    unconfigured: () => ({ title: 'Service non configuré' }),
    empty: () => ({ title: 'Rien à afficher' }),
    hideSearch: true,
  },
);
const emit = defineEmits<{ retry: [] }>();
</script>

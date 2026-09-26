<template>
  <!-- Ces pastilles sont le filtre de la page, pas un tableau de bord. Elles etaient six
       grandes tuiles de meme poids, sur deux rangees : on lisait des chiffres avant la
       liste, et rien ne distinguait ce qui demande une action de ce qui est archive.
       Un vrai `button` apporte l'activation au clavier et `aria-pressed` dit lequel
       filtre la liste. La legende detaillee passe dans `title`. -->
  <section class="kpi-banner" :aria-label="audit ? 'Filtres de l’audit' : 'Filtres des opportunités'">
    <UiChipGroup
      :model-value="activeFilter"
      :options="options"
      :label="audit ? 'Filtres de l’audit' : 'Filtres des opportunités'"
      reselectable
      align="center"
      scroll
      item-class="filter-badge vf-kpi-filter"
      @update:model-value="emit('select', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import UiChipGroup, { type UiChipOption } from '@/components/ui/UiChipGroup.vue';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  Globe,
  MessageSquareOff,
  ScanSearch,
  SlidersHorizontal,
  Volume2,
} from '@lucide/vue';

interface KpiCard {
  filter: string;
  label: string;
  value: number;
  description: string;
  tone: string;
  icon: Component;
}

const props = withDefaults(defineProps<{
  audit?: boolean;
  activeFilter?: string;
  auditCounts?: Record<string, number>;
  eligibleAuditFixCount?: number;
  pendingCount?: number;
  waitingReleaseCount?: number;
  inProgressCount?: number;
  failedCount?: number;
  historyCount?: number;
  ignoredCount?: number;
}>(), {
  audit: false,
  activeFilter: '',
  auditCounts: () => ({}),
  eligibleAuditFixCount: 0,
  pendingCount: 0,
  waitingReleaseCount: 0,
  inProgressCount: 0,
  failedCount: 0,
  historyCount: 0,
  ignoredCount: 0,
});

const emit = defineEmits<{ select: [filter: string] }>();

const cards = computed<KpiCard[]>(() => props.audit ? [
  { filter: 'eligible', label: 'Prêts à aligner', value: props.eligibleAuditFixCount, description: 'Pistes FR secondaires ou ST inactifs', tone: 'kpi-accent', icon: SlidersHorizontal },
  { filter: 'audio_secondary', label: 'Audio FR secondaire', value: props.auditCounts.audio_secondary || 0, description: 'Piste VF présente mais non sélectionnée', tone: 'kpi-warning', icon: Volume2 },
  { filter: 'missing_sub_fr', label: 'Sans sous-titres FR', value: props.auditCounts.missing_sub_fr || 0, description: 'Contenu VO sans aucun sous-titre français', tone: 'kpi-danger', icon: MessageSquareOff },
  { filter: 'vo_only', label: 'VO uniquement', value: props.auditCounts.vo_only || 0, description: 'Aucune piste audio française', tone: 'kpi-muted', icon: Globe },
] : [
  { filter: 'pending', label: 'À traiter', value: props.pendingCount, description: 'Nouvelles opportunités trouvées', tone: 'kpi-accent', icon: Clock },
  { filter: 'waiting_release', label: 'En attente de release', value: props.waitingReleaseCount, description: 'Médias VO sans release VF trouvée', tone: 'kpi-neutral', icon: ScanSearch },
  { filter: 'in_progress', label: 'En cours', value: props.inProgressCount, description: 'Téléchargement & validation', tone: 'kpi-info', icon: Download },
  { filter: 'failed', label: 'Échecs', value: props.failedCount, description: 'Rejets ou erreurs *arr', tone: 'kpi-danger', icon: AlertTriangle },
  { filter: 'history', label: 'Historique', value: props.historyCount, description: 'VF validées ou rejetées', tone: 'kpi-ok', icon: CheckCircle2 },
  { filter: 'ignored', label: 'Ignorées', value: props.ignoredCount, description: 'Séries/films exclus du scan', tone: 'kpi-muted', icon: EyeOff },
]);
const toneMap: Record<string, UiChipOption['tone']> = {
  'kpi-accent': 'accent',
  'kpi-danger': 'danger',
  'kpi-warning': 'warning',
  'kpi-info': 'info',
  'kpi-ok': 'ok',
};
const options = computed(() => cards.value.map((card) => ({
  value: card.filter,
  label: card.label,
  count: card.value,
  icon: card.icon,
  tone: toneMap[card.tone],
  title: card.description,
})));
</script>

<style scoped lang="scss">
.kpi-banner {
  min-width: 0;
}
.kpi-banner :deep(.vf-kpi-filter) {
  width: auto;
  justify-content: flex-start;
  border-radius: var(--radius-pill);
}
</style>

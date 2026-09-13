<template>
  <section class="kpi-banner" :aria-label="audit ? 'Indicateurs clés de l’audit' : 'Indicateurs des opportunités'">
    <!-- Ces tuiles sont le filtre de la page, pas un tableau de bord : un vrai `button`
         apporte l'activation au clavier (Entrée et Espace) et `aria-pressed` dit lequel
         est actif, ce qu'un `role="button"` pose a la main ne faisait pas. -->
    <button
      v-for="card in cards"
      :key="card.filter"
      type="button"
      class="kpi-card"
      :class="{ active: activeFilter === card.filter }"
      :aria-pressed="activeFilter === card.filter"
      @click="emit('select', card.filter)"
    >
      <span class="kpi-icon-wrap" :class="card.tone">
        <component :is="card.icon" :size="20" />
      </span>
      <span class="kpi-body">
        <span class="kpi-label">{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small class="kpi-sub" :title="card.description">{{ card.description }}</small>
      </span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
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
</script>

<style scoped lang="scss">
.kpi-banner {
  display: grid;
  /* 175px pour six tuiles sur 1440 : cinq legendes sur six se coupaient en plein mot
     (« Nouvelles opportuni… », « Médias VO sans rel… »). Elles passent sur deux lignes
     et la tuile s'elargit, quitte a repasser sur deux rangees en dessous de 1280. */
  grid-template-columns: repeat(auto-fit, minmax(212px, 1fr));
  gap: var(--space-3);
  align-items: stretch;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.kpi-card:hover { transform: translateY(-1px); border-color: var(--border-strong); }
.kpi-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--surface-1)); }

.kpi-icon-wrap {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: var(--radius-md);
}

.kpi-accent { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
.kpi-warning { background: rgba(234, 179, 8, 0.14); color: #fde047; }
.kpi-danger { background: rgba(239, 68, 68, 0.14); color: #fca5a5; }
.kpi-info { background: rgba(56, 189, 248, 0.14); color: #7dd3fc; }
.kpi-ok { background: rgba(34, 197, 94, 0.14); color: #86efac; }
.kpi-muted, .kpi-neutral { background: var(--surface-2); color: var(--muted); }

.kpi-body { display: grid; min-width: 0; gap: 1px; }
.kpi-label { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.kpi-body strong { color: var(--text); font-size: var(--fs-xl); line-height: 1.1; }
/* Deux lignes plutot qu'une coupure : la legende explique ce que compte la tuile, elle
   n'est pas decorative. Au-dela, l'attribut `title` prend le relais. */
.kpi-sub {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.3;
}
</style>

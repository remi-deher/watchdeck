<template>
  <!-- Ces pastilles sont le filtre de la page, pas un tableau de bord. Elles etaient six
       grandes tuiles de meme poids, sur deux rangees : on lisait des chiffres avant la
       liste, et rien ne distinguait ce qui demande une action de ce qui est archive.
       Un vrai `button` apporte l'activation au clavier et `aria-pressed` dit lequel
       filtre la liste. La legende detaillee passe dans `title`. -->
  <section class="kpi-banner" :aria-label="audit ? 'Filtres de l’audit' : 'Filtres des opportunités'">
    <button
      v-for="card in cards"
      :key="card.filter"
      type="button"
      class="kpi-chip"
      :class="[card.tone, { active: activeFilter === card.filter, 'is-empty': !card.value }]"
      :aria-pressed="activeFilter === card.filter"
      :title="card.description"
      @click="emit('select', card.filter)"
    >
      <component :is="card.icon" :size="15" aria-hidden="true" />
      <span class="kpi-label">{{ card.label }}</span>
      <strong class="kpi-count">{{ card.value }}</strong>
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
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}

.kpi-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 6px 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-duration-instant) var(--motion-ease-standard), background-color var(--motion-duration-instant) var(--motion-ease-standard), color var(--motion-duration-instant) var(--motion-ease-standard);
}
.kpi-chip svg { flex: none; }
.kpi-chip:hover { border-color: var(--border-strong); color: var(--text); }
.kpi-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.kpi-count {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

/* Ce qui demande une action se signale des qu'il y a quelque chose a faire ; a zero,
   la pastille rentre dans le rang. */
.kpi-accent:not(.is-empty) { color: var(--text); }
.kpi-accent:not(.is-empty) svg { color: var(--accent); }
.kpi-accent:not(.is-empty) .kpi-count { background: var(--accent); color: var(--on-accent); }
.kpi-danger:not(.is-empty) svg { color: var(--red-text); }
.kpi-danger:not(.is-empty) .kpi-count { background: color-mix(in srgb, var(--red) 18%, transparent); color: var(--red-text); }
.kpi-warning:not(.is-empty) svg { color: var(--amber-text); }
.kpi-info:not(.is-empty) svg { color: var(--blue-text); }
.kpi-ok:not(.is-empty) svg { color: var(--green-text); }
.kpi-chip.is-empty .kpi-count { color: var(--muted); }

/* Le filtre actif : meme pastille teintee que l'onglet actif, pour qu'on lise « c'est
   ce qui est affiche » et non un deuxieme niveau d'onglets. */
.kpi-chip.active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--text);
}

/* Sur telephone, une seule ligne qui defile plutot que trois rangees de pastilles. */
@media (max-width: 767.98px) {
  .kpi-banner {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .kpi-banner::-webkit-scrollbar { display: none; }
  .kpi-chip { flex: none; }
}
</style>

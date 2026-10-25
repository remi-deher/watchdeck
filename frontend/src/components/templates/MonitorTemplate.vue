<template>
  <!-- Gabarit « Surveiller » : repond a « est-ce que tout va bien ? », en quatre temps
       toujours dans le meme ordre :
         1. le verdict -- l'etat global, lisible sans rien lire d'autre ;
         2. les indicateurs de sante -- mesurer, pas agir ;
         3. ce qui demande l'attention -- les seuls problemes, chacun avec sa cause et le
            lien qui mene la ou il se regle ;
         4. ou aller ensuite -- les parties de la section et leur etat.
       Pas de liste complete, pas de reglage, pas d'action groupee : ce sont les besoins
       des gabarits Suivre, Traiter et Configurer, vers lesquels celui-ci oriente.
       `details` accueille des panneaux de surveillance complementaires (services,
       taches…), places a cote de l'attention ; `after`, une lecture complementaire sur toute
       la largeur (files, derniers elements). Sur telephone, le verdict et l'attention
       passent d'abord, puis les parties (qui y servent de menu), puis les chiffres. -->
  <div class="monitor" :class="{ 'has-details': $slots.details, 'is-board': board }">
    <!-- Le verdict ne parle que s'il y a quelque chose a dire : quand tout va bien, la
         page commence directement par ce qui tourne et les chiffres. -->
    <MonitorVerdict
      v-if="loading || urgent"
      class="monitor__verdict"
      :urgent="urgent"
      :errors="count('error')"
      :warnings="count('warn')"
      :loading="loading"
      :checking-title="labels.checkingTitle"
      :checking-detail="labels.checkingDetail"
      :ok-title="labels.okTitle"
      :ok-detail="labels.okDetail"
    >
      <MonitorAttention
        v-if="board && urgent && !loading"
        cards
        :items="items"
        :icons="icons"
        :title="labels.attentionTitle"
      />
    </MonitorVerdict>
    <!-- Ce qui tourne maintenant (LiveStrip) : facultatif, une page sans en-cours n'en
         fournit pas. -->
    <div v-if="$slots.live" class="monitor__live"><slot name="live" /></div>
    <MonitorKpis v-if="kpis.length" class="monitor__kpis" :kpis="kpis" :label="labels.kpisLabel" />
    <MonitorAttention
      v-if="!board || (!urgent && (loading || items.length))"
      class="monitor__attention"
      :cards="board"
      :items="items"
      :loading="loading"
      :icons="icons"
      :empty-detail="labels.okDetail"
      :loading-text="labels.checkingTitle"
    />
    <div v-if="$slots.details" class="monitor__details"><slot name="details" /></div>
    <MonitorZones v-if="zones.length" class="monitor__zones" :groups="zones" :label="labels.zonesLabel" />
    <!-- Lecture complementaire, sur toute la largeur, apres les parties : ce qui s'est passe
         ou ce qui arrive (files, derniers elements), quand la page en a. -->
    <div v-if="$slots.after" class="monitor__after"><slot name="after" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MonitorAttention from './monitor/MonitorAttention.vue';
import MonitorKpis from './monitor/MonitorKpis.vue';
import MonitorVerdict from './monitor/MonitorVerdict.vue';
import MonitorZones from './monitor/MonitorZones.vue';
import type { MonitorAttentionItem, MonitorKpi, MonitorLabels, MonitorSeverity, MonitorZoneGroup } from './monitor/types';

export type { MonitorAttentionItem, MonitorKpi, MonitorLabels, MonitorSeverity, MonitorZone, MonitorZoneGroup } from './monitor/types';

const props = withDefaults(
  defineProps<{
    /** Points d'attention ; le verdict en est deduit (erreurs, a surveiller). */
    items: MonitorAttentionItem[];
    kpis?: MonitorKpi[];
    zones?: MonitorZoneGroup[];
    /** Icone par partie (`area` des points d'attention). */
    icons?: Record<string, any>;
    loading?: boolean;
    /**
     * Variante « tableau de bord » : les points d'attention sont des cartes dans le verdict
     * qui les annonce (pas de bloc « À traiter » a part, ni d'etat vide quand tout va bien),
     * la lecture complementaire (`after`) a gauche et les panneaux (`details`) a droite.
     */
    board?: boolean;
    /** Textes propres a la page ; les manquants gardent ceux par defaut des blocs. */
    labels?: MonitorLabels;
  }>(),
  { kpis: () => [], zones: () => [], icons: () => ({}), loading: false, board: false, labels: () => ({}) },
);

const count = (severity: MonitorSeverity) => props.items.filter((item) => item.severity === severity).length;
/* Une information n'est pas un point a traiter : seuls erreurs et avertissements comptent. */
const urgent = computed(() => count('error') + count('warn'));
const labels = computed(() => Object.fromEntries(Object.entries(props.labels).filter(([, value]) => value)) as MonitorLabels);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.monitor {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'verdict' 'live' 'kpis' 'attention' 'zones' 'after';
  gap: var(--space-5) var(--space-4);
  min-width: 0;
}
.monitor.has-details {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'verdict' 'live' 'kpis' 'attention' 'details' 'zones' 'after';
}
.monitor.is-board.has-details {
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  grid-template-areas: 'verdict verdict' 'live live' 'kpis kpis' 'attention attention' 'after details' 'zones zones';
}
.monitor__verdict { grid-area: verdict; }
.monitor__live { grid-area: live; min-width: 0; }
.monitor__kpis { grid-area: kpis; }
.monitor__attention { grid-area: attention; }
.monitor__details {
  grid-area: details;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
  align-content: start;
  gap: var(--space-4);
  min-width: 0;
}
.monitor__zones { grid-area: zones; }
.monitor__after { grid-area: after; display: grid; gap: var(--space-4); min-width: 0; }

@include bp.until(desktop) {
  .monitor.has-details {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'verdict' 'live' 'kpis' 'attention' 'details' 'zones' 'after';
  }
  .monitor.is-board.has-details {
    grid-template-areas: 'verdict' 'live' 'kpis' 'attention' 'after' 'details' 'zones';
  }
}

@include bp.until(shell-medium) {
  .monitor,
  .monitor.has-details {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'verdict' 'attention' 'live' 'zones' 'kpis' 'details' 'after';
    gap: var(--space-4);
  }
  .monitor.is-board.has-details {
    grid-template-areas: 'verdict' 'attention' 'live' 'kpis' 'after' 'details' 'zones';
  }
}
</style>

<template>
  <!-- Une release candidate d'une recherche *arr : badges techniques, rejets, chiffres,
       actions (indexeur, grab), puis détails et comparatif avec le fichier en place. -->
  <li class="vf-upgrade-release" :class="{ rejected, recommended }">
    <header class="release-head">
      <div class="release-title-wrap">
        <div class="release-badges badge-row">
          <span v-if="recommended" class="badge available recommended-badge">
            <Sparkles :size="12" /> Recommandée
          </span>
          <span v-if="technical.resolution" class="badge" :class="{'badge-4k': technical.resolution==='2160p'}">
            {{ technical.resolution }}
          </span>
          <span v-if="technical.french" class="badge available">
            {{ technical.french }}
          </span>
          <span v-if="technical.dolbyVision || technical.hdr" class="badge hdr-badge">
            {{ technical.dolbyVision ? 'DV · HDR' : 'HDR' }}
          </span>
          <span v-if="technical.source" class="badge pending">
            {{ technical.source }}
          </span>
          <span v-if="technical.codec" class="badge pending">
            {{ technical.codec }}
          </span>
          <UiTooltip v-if="release.custom_format_score" text="Score Custom Format"><span class="badge pending score-badge">
            Score: +{{ release.custom_format_score }}
          </span></UiTooltip>
        </div>
        <strong class="vf-upgrade-release-title">{{ release.title }}</strong>
      </div>
      <UiButton icon-only class="copy-button" title="Copier le nom" aria-label="Copier le nom de la release" @click="emit('copy', release.title)"><Copy :size="15" /></UiButton>
    </header>

    <!-- Motif de rejet explicite et lisible directement -->
    <div v-if="rejected" class="release-rejections-box">
      <div class="rejection-box-header">
        <span class="badge danger"><TriangleAlert :size="12" /> Rejeté par {{ arrName }}</span>
      </div>
      <ul class="rejection-reasons-list">
        <li v-for="reason in release.rejections" :key="reason">{{ translateRejection(reason) }}</li>
      </ul>
    </div>

    <dl class="vf-upgrade-release-meta release-primary-meta">
      <div><dt>Qualité</dt><dd>{{ release.quality || technical.resolution || '—' }}</dd></div>
      <div><dt>Taille</dt><dd>{{ release.size ? formatBytes(release.size) : '—' }}</dd></div>
      <div><dt>Indexeur</dt><dd>{{ release.indexer || '—' }}</dd></div>
      <div>
        <dt>Sources</dt>
        <dd>
          <span class="badge seed-badge" :class="(release.seeders ?? 0) > 5 ? 'available' : (release.seeders ?? 0) > 0 ? 'pending_approval' : 'danger'">
            {{ release.protocol === 'usenet' ? 'Usenet' : `${release.seeders || 0} seed${(release.seeders ?? 0) > 1 ? 's' : ''}` }}
          </span>
        </dd>
      </div>
    </dl>

    <div class="vf-upgrade-release-actions">
      <UiButton v-if="release.info_url" size="sm" :href="release.info_url" target="_blank" rel="noopener noreferrer"><template #icon><ExternalLink :size="14" /></template>Indexeur</UiButton>
      <UiButton variant="primary" size="sm" :loading="grabbing" :disabled="grabDisabled" @click="emit('grab', release)"><template #icon><Download :size="14" /></template>{{ grabbing ? 'Envoi…' : 'Grab' }}</UiButton>
    </div>

    <UiCollapsible v-if="hasDetails" class="release-details" :unmount-on-hide="false" trigger-class="collapsible-trigger" content-class="collapsible-content">
      <template #trigger>Détails complémentaires</template>
      <dl class="vf-upgrade-release-meta release-secondary-meta">
        <div><dt>Publiée le</dt><dd>{{ formatDate(release.publish_date, '—') }}</dd></div>
        <div><dt>Score CF</dt><dd>{{ release.custom_format_score ?? 0 }}</dd></div>
        <div v-if="vf"><dt>Confiance VF</dt><dd>{{ release.vf_confidence || 0 }} %</dd></div>
      </dl>
      <div v-if="vf && comparison && showComparison" class="release-comparison">
        <div><span>Actuel</span><strong>{{ technicalSummary(comparison.current) }}</strong></div>
        <ArrowRight :size="16" />
        <div><span>Candidate</span><strong>{{ technicalSummary(comparison.candidate) }}</strong></div>
      </div>
      <ul v-if="vf && comparison?.warnings.length" class="technical-warnings">
        <li v-for="warning in comparison.warnings" :key="warning"><TriangleAlert :size="13" /> {{ warning }}</li>
      </ul>
      <p v-if="release.vf_evidence?.length" class="vf-upgrade-evidence">{{ release.vf_evidence.join(' · ') }}</p>
    </UiCollapsible>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Copy, Download, ExternalLink, Sparkles, TriangleAlert } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCollapsible from '@/components/ui/UiCollapsible.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { formatBytes, formatDate } from '@/utils/format';
import { isRejected, technicalSummary, type ReleaseComparison } from '@/utils/releaseComparison';
import { parseReleaseTitle, translateRejection } from '@/utils/releaseTitle';

const props = withDefaults(
  defineProps<{
    release: any;
    /** Nom du gestionnaire qui a cherché (Radarr, Sonarr). */
    arrName: string;
    /** En tête du tri et non rejetée. */
    recommended?: boolean;
    /** Recherche VF : confiance VF et comparatif avec le fichier en place. */
    vf?: boolean;
    /** Comparatif avec le fichier en place (recherche VF seulement). */
    comparison?: ReleaseComparison | null;
    /** Le fichier en place est connu : le comparatif actuel / candidate a un sens. */
    showComparison?: boolean;
    /** Ce grab est en cours d'envoi. */
    grabbing?: boolean;
    grabDisabled?: boolean;
  }>(),
  { recommended: false, vf: false, comparison: null, showComparison: false, grabbing: false, grabDisabled: false }
);

const emit = defineEmits<{
  (e: 'grab', release: any): void;
  (e: 'copy', title: string | undefined): void;
}>();

const rejected = computed(() => isRejected(props.release));
const technical = computed(() => parseReleaseTitle(props.release.title));
const hasDetails = computed(() => Boolean(
  props.release.publish_date ||
    props.release.custom_format_score ||
    props.release.vf_confidence ||
    props.release.vf_evidence?.length ||
    (props.vf && (props.showComparison || props.comparison?.warnings.length))
));
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.vf-upgrade-release { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px 14px; padding: 13px; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-hover); transition: border-color var(--motion-duration-instant) var(--motion-ease-standard), background var(--motion-duration-instant) var(--motion-ease-standard); }
.vf-upgrade-release.recommended { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); background: color-mix(in srgb, var(--accent) 4%, var(--surface-hover)); }
.vf-upgrade-release.rejected { opacity: .88; border-left: 3px solid var(--danger); }
.release-head, .vf-upgrade-release-actions { display: flex; align-items: center; gap: 7px; }
.release-head { grid-column: 1 / -1; align-items: flex-start; justify-content: space-between; }
.release-title-wrap { display: grid; gap: 6px; min-width: 0; }
.release-badges { gap: 6px; }
.recommended-badge { border-color: var(--accent); color: var(--accent); font-weight: 700; background: color-mix(in srgb, var(--accent) 15%, var(--surface)); }
.badge-4k { border-color: color-mix(in srgb, var(--blue) 60%, transparent); color: var(--blue-text); background: color-mix(in srgb, var(--blue) 12%, transparent); }
.hdr-badge { border-color: color-mix(in srgb, var(--violet) 60%, transparent); color: var(--violet-text); background: color-mix(in srgb, var(--violet) 12%, transparent); }
.score-badge { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
.seed-badge { font-weight: 600; }
.vf-upgrade-release-title { font-size: var(--fs-sm); line-height: 1.4; overflow-wrap: anywhere; word-break: break-word; }
.copy-button { flex: 0 0 auto; }

/* Bloc de rejets clair et immédiat */
.release-rejections-box { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 10%, var(--surface)); border-left: 3px solid var(--danger); }
.rejection-box-header { display: flex; align-items: center; gap: 6px; }
.rejection-reasons-list { margin: 0; padding-left: 18px; color: var(--red-text); font-size: var(--fs-xs); display: grid; gap: 3px; }

.vf-upgrade-release-meta { display: grid; gap: 7px; margin: 0; }
.release-primary-meta { grid-template-columns: repeat(4,minmax(72px,auto)); align-items: center; }
.release-secondary-meta { grid-template-columns: repeat(3,minmax(0,1fr)); }
.vf-upgrade-release-meta > div { display: grid; gap: 2px; font-size: var(--fs-xs); }
.vf-upgrade-release-meta dt { color: var(--muted); }
.vf-upgrade-release-meta dd { margin: 0; font-weight: 650; }
.vf-upgrade-release-actions { align-self: center; justify-content: flex-end; }
.vf-upgrade-release-actions a, .vf-upgrade-release-actions button { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; min-height: 36px; padding: 0 12px; }
.release-[data-state] { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid var(--border); }
.release-[data-state] .collapsible-trigger { width: fit-content; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; cursor: pointer; }
.release-[data-state][data-state="open"] .collapsible-trigger { margin-bottom: 10px; color: var(--text); }
.release-[data-state] > * + * { margin-top: 9px; }
.release-comparison { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; padding: 9px; border-radius: var(--radius-sm); background: var(--surface); }
.release-comparison > div { display: grid; gap: 2px; }
.release-comparison span { color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
.release-comparison strong { font-size: var(--fs-xs); }
.technical-warnings { display: grid; gap: 4px; margin: 0; padding: 0; color: var(--amber-text); font-size: var(--fs-xs); list-style: none; }
.technical-warnings li { display: flex; align-items: center; gap: 5px; }
.vf-upgrade-evidence { margin: 0; color: var(--green-text); font-size: var(--fs-xs); }
@include bp.until(tablet) {
  .vf-upgrade-release { grid-template-columns: 1fr; }
  .release-primary-meta { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .vf-upgrade-release-actions { justify-content: stretch; }
  .vf-upgrade-release-actions > * { flex: 1; justify-content: center; min-height: 42px; }
}
@container panel (max-width: 429px) {
  .release-secondary-meta { grid-template-columns: 1fr 1fr; }
  .release-comparison { grid-template-columns: 1fr; }
  .release-comparison > svg { transform: rotate(90deg); }
}
</style>

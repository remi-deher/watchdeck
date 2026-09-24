<template>
  <!-- La file active, regroupee : interventions d'abord, puis transferts et attente. Sans
       rien en cours sur « Tout », on montre les derniers elements termines. -->
  <section class="download-groups" role="tabpanel">
    <section v-for="group in groups" :key="group.key" class="download-group" :class="group.key">
      <header class="download-group-head">
        <div><component :is="group.icon"/><div><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div></div>
        <span>{{ group.items.length }}</span>
      </header>
      <div class="download-card-grid">
        <article v-for="row in group.items" :key="rowKey(row)" class="download-card rich-card">
          <div class="card-cover-col">
            <div class="card-cover-wrapper">
              <img
                v-if="row.poster_url && !hasPosterError(row)"
                :src="proxyUrl(row.poster_url, { width: 200 }) ?? undefined"
                :alt="row.title"
                class="card-cover-img"
                loading="lazy"
                @error="onPosterError(row)"
              />
              <div class="card-cover-placeholder">
                <Film v-if="row.arr_type==='radarr'" />
                <Tv v-else-if="row.arr_type==='sonarr'" />
                <Download v-else />
              </div>
            </div>
          </div>
          <div class="card-content-col">
            <header>
              <div>
                <strong>{{ row.title }}</strong>
                <div class="card-sub-badges">
                  <small>{{ row.instance||row.download_client||'Téléchargement direct' }}</small>
                  <span v-if="extractQuality(row)" class="badge quality-badge">{{ extractQuality(row) }}</span>
                </div>
              </div>
              <span class="badge" :class="group.key==='intervention'?'failed':'pending'">{{ statusLabel(row) }}</span>
            </header>
            <div class="download-progress">
              <div><span>Progression</span><strong>{{ Math.round(row.progress||0) }}%</strong></div>
              <UiProgress :value="row.progress||0" :label="`Progression de ${row.title}`" />
              <div class="progress-details">
                <small>{{ row.timeleft||'Temps restant indisponible' }}</small>
                <small v-if="row.sizeleft_label">{{ row.sizeleft_label }}</small>
              </div>
            </div>
            <div v-if="row.waiting_reason||row.error" class="download-callout" :class="{error:row.error}">{{ row.error||row.waiting_reason }}</div>
            <div v-if="row.origin_label||row.operational_status_label" class="download-meta">{{ row.origin_label }}<template v-if="row.operational_status_label"> · {{ row.operational_status_label }}</template></div>
            <footer>
              <UiButton v-if="queueDetailPath(row)" size="sm" :to="queueDetailPath(row) ?? '/'">Voir la fiche</UiButton>
              <UiButton v-if="requiresIntervention(row)" size="sm" @click="emit('manual', row)"><template #icon><Link/></template>Associer / importer</UiButton>
              <UiButton v-if="canAct(row)" size="sm" :disabled="actingKeys.has(rowKey(row))" @click="emit('action', row, true, true)"><template #icon><RotateCcw/></template>Relancer</UiButton>
              <UiButton v-if="canAct(row)" variant="danger" size="sm" :disabled="actingKeys.has(rowKey(row))" @click="emit('action', row, false, false)"><template #icon><X/></template>Retirer</UiButton>
            </footer>
          </div>
        </article>
      </div>
    </section>

    <div v-if="showRecent && !groups.length && !loading" class="recent-completed-section">
      <HorizontalRail v-if="history.length" aria-label="Derniers éléments terminés" variant="poster">
        <template #header>
          <div class="section-subtitle">
            <CheckCircle2 />
            <h3>Derniers éléments terminés</h3>
          </div>
        </template>

        <MediaCardShell
          v-for="(row, index) in history.slice(0, 10)"
          :key="row.id"
          :has-action="Boolean(queueDetailPath(row))"
          action-padding="44px"
          elevate-on-hover
          animated
          bordered
          :style="{ '--card-index': index }"
        >
          <template #default="{ revealed, reveal }">
            <component
              :is="queueDetailPath(row) ? 'RouterLink' : 'div'"
              :to="queueDetailPath(row)"
              class="poster-link"
              :aria-label="`${row.title}${row.year ? ' (' + row.year + ')' : ''} - ${historyModeLabel(row)}`"
              @click="onCompletedCardClick($event, row, revealed, reveal)"
            >
              <MediaPoster
                :poster-url="row.poster_url && !hasPosterError(row) ? proxyUrl(row.poster_url, { width: 320 }) : null"
                :alt="`Affiche de ${row.title}`"
                @error="onPosterError(row)"
              >
                <template #badges>
                  <div class="poster-badges completed-badge-group">
                    <span class="badge" :class="historyModeClass(row)">{{ historyModeLabel(row) }}</span>
                    <span v-if="row.instance_name || row.source" class="badge badge-source">{{ row.instance_name || row.source }}</span>
                  </div>
                </template>
                <template #overlay>
                  <div class="poster-overlay completed-card-overlay">
                    <div class="poster-copy">
                      <div class="poster-meta">
                        <span v-if="row.year" class="meta-year">{{ row.year }}</span>
                        <span>{{ mediaTypeLabel(row.media_type) }}</span>
                        <span v-if="row.completed_at" class="meta-date">{{ formatDate(row.completed_at) }}</span>
                      </div>
                      <strong class="completed-title">{{ row.title }}</strong>
                    </div>
                  </div>
                </template>
              </MediaPoster>
            </component>
          </template>

          <template v-if="queueDetailPath(row)" #action>
            <RouterLink :to="queueDetailPath(row) ?? '/'" class="poster-action nav-action" @click.stop>Voir la fiche</RouterLink>
          </template>
        </MediaCardShell>
      </HorizontalRail>
      <p v-else class="empty">Aucun téléchargement récent pour cette vue.</p>
    </div>
    <p v-else-if="!loading && emptyMessage" class="empty">{{ emptyMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { CheckCircle2, Download, Film, Link, RotateCcw, Tv, X } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import HorizontalRail from '@/components/ui/HorizontalRail.vue';
import MediaCardShell from '@/components/media/MediaCardShell.vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import { usePosterErrors } from '@/composables/usePosterErrors';
import { canAct, queueDetailPath, requiresIntervention, rowKey, statusLabel } from '@/downloads/queueRules';
import { extractQuality, historyModeClass, historyModeLabel } from '@/downloads/historyFormat';
import { mediaTypeLabel } from '@/utils/labels';
import { formatDateTime as formatDate } from '@/utils/format';
import { proxyUrl } from '@/utils/mediaImage';

export interface QueueGroup { key: string; title: string; description: string; icon: unknown; items: any[] }

defineProps<{
  groups: QueueGroup[];
  /** Historique filtre : ses premiers elements remplissent la file vide. */
  history: any[];
  /** Montrer les derniers termines quand la file est vide (sous-vue « Tout »). */
  showRecent: boolean;
  /** Message quand la file filtree est vide, hors derniers termines. */
  emptyMessage?: string;
  loading: boolean;
  actingKeys: Set<string>;
}>();
const emit = defineEmits<{
  (e: 'manual', row: any): void;
  (e: 'action', row: any, blocklist: boolean, search: boolean): void;
}>();

const { hasPosterError, onPosterError } = usePosterErrors();

// Au toucher, un premier appui devoile le bouton d'action au lieu de naviguer.
function onCompletedCardClick(e: Event, row: any, revealed: boolean, reveal: () => void): void {
  if (queueDetailPath(row) && !revealed) {
    e.preventDefault();
    reveal();
  }
}
</script>

<style scoped>
.download-groups{display:grid;gap:var(--space-4)}
.download-group{display:grid;gap:var(--space-3)}
.download-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:var(--space-3)}
.download-group-head{display:flex;align-items:center;justify-content:space-between;padding:0 2px}
.download-group-head>div{display:flex;align-items:center;gap:var(--space-3)}
.download-group-head svg{width:19px;color:var(--muted)}
.download-group.intervention .download-group-head svg{color:var(--danger)}
.download-group-head h2{margin:0;font-size:var(--fs-md)}
.download-group-head p{margin:2px 0 0;color:var(--muted);font-size:var(--fs-xs)}
.download-group-head>span{min-width:27px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-pill);text-align:center;font-size:var(--fs-xs);font-weight:700}
.download-card{display:grid;gap:var(--space-3);padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);content-visibility:auto;contain-intrinsic-size:0 120px}
.download-card header,.download-progress>div,.download-card footer{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}
.download-card header>div{display:grid;gap:var(--space-1);min-width:0}
.download-card header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.download-card header small,.download-progress small,.download-meta{color:var(--muted);font-size:var(--fs-xs)}
.download-progress{display:grid;gap:var(--space-2)}
.download-progress span{color:var(--muted);font-size:var(--fs-xs)}
.download-progress strong{font-size:var(--fs-sm)}
.download-callout{padding:8px 10px;border-radius:var(--radius-sm);background:rgba(229,160,13,.09);color:var(--accent);font-size:var(--fs-xs)}
.download-callout.error{background:rgba(239,68,68,.09);color:var(--danger)}
.download-card footer{justify-content:flex-end;flex-wrap:wrap;margin-top:auto}
.download-card footer :deep(.ui-button){font-size:var(--fs-xs)}
.rich-card{display:flex;gap:var(--space-3);align-items:stretch}
.card-cover-col{width:70px;flex-shrink:0}
.card-cover-wrapper{position:relative;width:100%;aspect-ratio:2/3;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center}
.card-cover-img{width:100%;height:100%;object-fit:cover}
.card-cover-placeholder{color:var(--muted)}
.card-cover-placeholder svg{width:22px;height:22px}
.card-content-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-2)}
.card-sub-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.quality-badge{background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent);font-size:var(--fs-xs);padding:2px 6px}
.progress-details{display:flex;justify-content:space-between;align-items:center;gap:6px}

.recent-completed-section{display:grid;gap:var(--space-3);margin-top:var(--space-3)}
.section-subtitle{display:flex;align-items:center;gap:8px;color:var(--success)}
.section-subtitle svg{width:18px;height:18px}
.section-subtitle h3{margin:0;font-size:var(--fs-md);color:var(--text)}
.completed-badge-group{display:flex;gap:5px;flex-wrap:wrap}
.completed-badge-group .badge-source{background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);color:var(--text);border:1px solid rgba(255,255,255,0.15)}
.completed-card-overlay .meta-year{color:#fff;font-weight:700}
.completed-card-overlay .meta-date{color:rgba(255,255,255,0.75);font-size:var(--fs-xs)}
.completed-title{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}

@media(max-width:520px){
  .download-group-head p{display:none}
  .download-card{padding:12px}
  .rich-card{flex-direction:column}
  .card-cover-col{width:100%}
  .card-cover-wrapper{aspect-ratio:16/9}
  .download-card footer{display:grid;grid-template-columns:1fr 1fr}
  .download-card footer :deep(.ui-button){justify-content:center}
}
@media(max-width:767.98px){
  .download-card footer{grid-template-columns:1fr}
  .download-card footer :deep(.ui-button){min-height:44px}
}
</style>

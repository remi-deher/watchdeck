<template>
  <div class="pipeline-wrapper">
    <div class="pipeline-flow">
      <!-- Étape 1 : Demandes -->
      <RouterLink
        to="/library?status=pending_approval"
        class="pipeline-step"
        :class="{ 'has-items': pendingCount > 0 }"
      >
        <div class="step-badge-num">1</div>
        <div class="step-icon-wrap pending">
          <Clock3 aria-hidden="true" />
        </div>
        <div class="step-info">
          <span class="step-label">À approuver</span>
          <strong class="step-value">{{ pendingCount }}</strong>
          <small class="step-detail">Demandes en attente</small>
        </div>
      </RouterLink>

      <div class="pipeline-arrow" aria-hidden="true">
        <ArrowRight />
      </div>

      <!-- Étape 2 : Téléchargements -->
      <RouterLink
        to="/downloads?status=downloading"
        class="pipeline-step"
        :class="{ 'has-items': downloadingCount > 0 }"
      >
        <div class="step-badge-num">2</div>
        <div class="step-icon-wrap downloading">
          <Download aria-hidden="true" />
        </div>
        <div class="step-info">
          <span class="step-label">En téléchargement</span>
          <strong class="step-value">{{ downloadingCount }}</strong>
          <small class="step-detail">Acquisitions actives</small>
        </div>
      </RouterLink>

      <div class="pipeline-arrow" aria-hidden="true">
        <ArrowRight />
      </div>

      <!-- Étape 3 : Imports -->
      <RouterLink
        to="/downloads?status=unmatched"
        class="pipeline-step"
        :class="{ 'has-items': importPendingCount > 0 }"
      >
        <div class="step-badge-num">3</div>
        <div class="step-icon-wrap import-pending">
          <RefreshCw aria-hidden="true" />
        </div>
        <div class="step-info">
          <span class="step-label">À importer</span>
          <strong class="step-value">{{ importPendingCount }}</strong>
          <small class="step-detail">Traitement *arr</small>
        </div>
      </RouterLink>

      <div class="pipeline-arrow" aria-hidden="true">
        <ArrowRight />
      </div>

      <!-- Étape 4 : Disponibles -->
      <RouterLink
        to="/library?status=library&sort=added_desc"
        class="pipeline-step is-available"
      >
        <div class="step-badge-num">4</div>
        <div class="step-icon-wrap available">
          <CheckCircle2 aria-hidden="true" />
        </div>
        <div class="step-info">
          <span class="step-label">Disponibles</span>
          <strong class="step-value">{{ availableCount }}</strong>
          <small class="step-detail">Médiathèque Plex</small>
        </div>
      </RouterLink>
    </div>

    <!-- Alerte latérale : Bloqués / Échecs -->
    <RouterLink
      v-if="blockedCount > 0"
      to="/downloads?status=error"
      class="pipeline-alert is-danger"
    >
      <div class="alert-icon-wrap">
        <AlertTriangle aria-hidden="true" />
      </div>
      <div class="alert-info">
        <span class="alert-label">Anomalies</span>
        <strong class="alert-value">{{ blockedCount }} bloqué{{ blockedCount > 1 ? 's' : '' }}</strong>
        <small class="alert-detail">Intervention requise</small>
      </div>
    </RouterLink>
    <div v-else class="pipeline-alert is-ok">
      <div class="alert-icon-wrap">
        <Check aria-hidden="true" />
      </div>
      <div class="alert-info">
        <span class="alert-label">Santé du flux</span>
        <strong class="alert-value">0 bloqué</strong>
        <small class="alert-detail">Acquisitions fluides</small>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, Download, RefreshCw } from '@lucide/vue';

withDefaults(
  defineProps<{
    pendingCount?: number;
    downloadingCount?: number;
    importPendingCount?: number;
    availableCount?: number | string;
    blockedCount?: number;
  }>(),
  {
    pendingCount: 0,
    downloadingCount: 0,
    importPendingCount: 0,
    availableCount: '-',
    blockedCount: 0,
  }
);
</script>

<style scoped lang="scss">
.pipeline-wrapper {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.pipeline-flow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.pipeline-step {
  position: relative;
  flex: 1;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
}

.pipeline-step:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.step-badge-num {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  opacity: 0.6;
}

.step-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-xs);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  flex-shrink: 0;
}

.step-icon-wrap svg {
  width: 16px;
  height: 16px;
}

.step-icon-wrap.pending {
  color: var(--accent);
}

.step-icon-wrap.downloading {
  color: #38bdf8;
}

.step-icon-wrap.import-pending {
  color: #fb923c;
}

.step-icon-wrap.available {
  color: var(--success);
}

.pipeline-step.has-items {
  border-color: var(--border-hover, var(--border));
}

.pipeline-step.is-available:hover {
  border-color: var(--success);
}

.step-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.step-label {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.step-value {
  font-size: var(--fs-md);
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}

.step-detail {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipeline-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  opacity: 0.4;
  flex-shrink: 0;
}

.pipeline-arrow svg {
  width: 14px;
  height: 14px;
}

.pipeline-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.pipeline-alert.is-danger {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.pipeline-alert.is-danger:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: #ef4444;
  transform: translateY(-1px);
}

.pipeline-alert.is-ok {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.alert-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}

.pipeline-alert.is-danger .alert-icon-wrap {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.pipeline-alert.is-ok .alert-icon-wrap {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--success);
}

.alert-icon-wrap svg {
  width: 16px;
  height: 16px;
}

.alert-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.alert-label {
  font-size: 11px;
  color: var(--muted);
}

.alert-value {
  font-size: var(--fs-sm);
  font-weight: 700;
  line-height: 1.2;
}

.pipeline-alert.is-danger .alert-value {
  color: #ef4444;
}

.alert-detail {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 1024px) {
  .pipeline-wrapper {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .pipeline-flow {
    flex-direction: column;
    align-items: stretch;
  }
  .pipeline-arrow {
    transform: rotate(90deg);
    padding: 2px 0;
  }
}
</style>

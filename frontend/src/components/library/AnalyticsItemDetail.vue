<template>
  <!-- Fiche technique d'un fichier du catalogue analyse : media, fichier, audience. -->
  <div class="analytics-item">
    <section class="drawer-section">
      <h3>Média</h3>
      <dl class="detail-grid">
        <div><dt>Type</dt><dd>{{ mediaTypeLabel(item.media_type) }}</dd></div>
        <div><dt>Bibliothèque</dt><dd>{{ item.library || '—' }}</dd></div>
        <div><dt>Studio</dt><dd>{{ item.studio || '—' }}</dd></div>
        <div><dt>Année</dt><dd>{{ item.year || '—' }}</dd></div>
        <div><dt>Ajouté le</dt><dd>{{ formatDate(item.added_at) }}</dd></div>
        <div><dt>Durée</dt><dd>{{ duration(item.duration_ms) }}</dd></div>
      </dl>
    </section>
    <section class="drawer-section">
      <h3>Fichier</h3>
      <dl class="detail-grid">
        <div><dt>Poids</dt><dd>{{ bytes(item.size_bytes) }}</dd></div>
        <div><dt>Conteneur</dt><dd>{{ item.container || '—' }}</dd></div>
        <div><dt>Vidéo</dt><dd>{{ item.video_resolution || '—' }} · {{ item.video_codec || '—' }}</dd></div>
        <div><dt>Audio</dt><dd>{{ item.audio_codec || '—' }}<template v-if="item.audio_channels"> · {{ item.audio_channels }} canaux</template></dd></div>
        <div><dt>Pistes audio</dt><dd>{{ (item.audio_languages || []).join(', ') || 'aucune' }}</dd></div>
        <div><dt>Sous-titres</dt><dd>{{ (item.subtitle_types || item.subtitle_languages || []).join(', ') || 'aucun' }}</dd></div>
      </dl>
    </section>
    <section class="drawer-section">
      <h3>Audience</h3>
      <dl class="detail-list">
        <div><dt>Lectures</dt><dd>{{ item.play_count || 0 }}</dd></div>
        <div><dt>Temps visionné</dt><dd>{{ duration(item.watch_time_ms) }}</dd></div>
        <div><dt>Spectateurs</dt><dd>{{ (item.viewers || []).join(', ') || 'personne' }}</dd></div>
        <div><dt>Dernier visionnage</dt><dd>{{ item.last_viewed_at ? formatDate(item.last_viewed_at) : 'jamais' }}</dd></div>
      </dl>

      <!-- La fiche disait combien de fois un media avait ete vu, jamais quand. -->
      <ol v-if="(item.views || []).length" class="view-log">
        <li v-for="(view, index) in item.views" :key="`${view.at}-${index}`">
          <span>{{ view.user || 'Utilisateur Plex' }}</span>
          <time :datetime="view.at">{{ formatDate(view.at) }}</time>
          <strong>{{ duration(view.watched_ms) }}</strong>
        </li>
      </ol>
      <p v-else class="view-log-empty">Aucun visionnage enregistré pour ce fichier.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { mediaTypeLabel } from '@/utils/labels';
import {
  formatDateTime as formatDate,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
} from '@/utils/format';

defineProps<{ item: Record<string, any> }>();
</script>

<style scoped lang="scss">
.drawer-section { margin-top: 22px; }
.drawer-section:first-child { margin-top: 8px; }
.drawer-section h3 { margin: 0 0 12px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.detail-grid div, .detail-list div { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-2); }
.detail-grid dt, .detail-list dt { color: var(--muted); font-size: var(--fs-xs); }
.detail-grid dd, .detail-list dd { margin: 4px 0 0; font-weight: 700; }
.detail-list { display: grid; gap: var(--space-2); margin: 0; }
.view-log { display: grid; gap: 2px; margin: var(--space-3) 0 0; padding: 0; list-style: none; }
.view-log li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: var(--fs-sm);
}
.view-log li:last-child { border-bottom: 0; }
.view-log span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.view-log time { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.view-log strong { font-variant-numeric: tabular-nums; }
.view-log-empty { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 520px) { .detail-grid { grid-template-columns: 1fr; } }
</style>

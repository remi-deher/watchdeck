<template>
  <div class="settings-merged system-version">
    <section class="panel">
      <UiSectionHeader eyebrow="Application" title="Version en cours d'exécution">
        <template #meta>
          <span v-if="statusBadge" class="status-badge" :class="`status-${statusBadge.tone}`">{{ statusBadge.label }}</span>
        </template>
        <template #actions>
          <UiButton size="sm" :loading="loading" @click="load"><template #icon><RefreshCw/></template>Actualiser</UiButton>
        </template>
      </UiSectionHeader>
      <UiFeedback v-if="error" type="error" title="Impossible de récupérer les informations de version" :message="error"/>
      <template v-else-if="info">
        <dl class="version-grid">
          <div><dt>Branche</dt><dd><span class="branch-badge" :class="`branch-${info.branch}`">{{ info.branch }}</span></dd></div>
          <div><dt>Version</dt><dd>{{ info.version }}</dd></div>
          <div>
            <dt>Commit</dt>
            <dd class="commit-cell">
              <a v-if="info.repo_url" class="mono" :href="`${info.repo_url}/commit/${info.git_sha}`" target="_blank" rel="noopener noreferrer">{{ shortSha(info.git_sha) }}</a>
              <span v-else class="mono">{{ shortSha(info.git_sha) }}</span>
              <button v-if="isRealSha(info.git_sha)" class="icon-button" type="button" title="Copier le SHA complet" aria-label="Copier le SHA complet" @click="copySha(info.git_sha)">
                <Check v-if="copied" :size="14"/><Copy v-else :size="14"/>
              </button>
            </dd>
          </div>
          <div><dt>Build</dt><dd :title="formatDate(info.build_date)">{{ formatRelative(info.build_date) }}</dd></div>
          <div><dt>Image Docker</dt><dd>{{ info.docker_repositories.join(', ') }}</dd></div>
        </dl>
        <UiFeedback
          v-if="info.main_comparison"
          type="info"
          :message="mainComparisonMessage(info.main_comparison)"
        />
        <UiFeedback
          v-if="info.latest_release && !info.is_latest"
          type="warning"
          title="Une nouvelle version est disponible"
          :message="`${info.latest_release.tag_name} a été publiée${info.latest_release.published_at ? ' le ' + formatDate(info.latest_release.published_at) : ''}. Vous exécutez ${info.version}.`"
        />
        <UiFeedback
          v-else-if="info.commit_matches_release === false"
          type="error"
          title="Version désalignée"
          message="La version annoncée correspond à la dernière release GitHub, mais le commit de l'image Docker en cours d'exécution ne correspond pas à celui du tag de cette release."
        />
        <UiFeedback
          v-else-if="info.is_latest && info.commit_matches_release"
          type="success"
          message="Vous exécutez la dernière version publiée, et le commit correspond exactement au tag de release."
        />
        <UiFeedback v-else-if="!info.latest_release" type="info" message="Dernière release GitHub introuvable (pas de connexion à l'API GitHub, ou aucune release publiée)."/>
        <p v-if="info.release_checked_at" class="checked-at">Dernière vérification GitHub : {{ formatRelative(info.release_checked_at) }}</p>
      </template>
    </section>

    <section v-if="info?.latest_release" class="panel">
      <UiSectionHeader eyebrow="Release notes" :title="info.latest_release.name || info.latest_release.tag_name">
        <template #meta>
          <span v-if="info.latest_release.published_at" :title="formatDate(info.latest_release.published_at)">{{ formatRelative(info.latest_release.published_at) }}</span>
          <a :href="info.latest_release.html_url" target="_blank" rel="noopener noreferrer">Voir sur GitHub<ExternalLink/></a>
        </template>
      </UiSectionHeader>
      <div class="release-body" v-html="renderedReleaseNotes"/>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, Copy, ExternalLink, RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiButton from '@/components/ui/UiButton.vue';

interface LatestRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  body: string | null;
  commit_sha: string | null;
}

interface MainComparison {
  ahead_by: number | null;
  behind_by: number | null;
}

interface VersionInfo {
  version: string;
  git_sha: string;
  build_date: string;
  branch: string;
  repo_url: string | null;
  docker_repositories: string[];
  latest_release: LatestRelease | null;
  is_latest: boolean;
  commit_matches_release: boolean | null;
  main_comparison: MainComparison | null;
  release_checked_at: string | null;
}

const info = ref<VersionInfo | null>(null);
const loading = ref(false);
const error = ref('');
const copied = ref(false);

function isRealSha(sha: string): boolean {
  return !!sha && sha !== 'unknown';
}
function shortSha(sha: string): string {
  return isRealSha(sha) ? sha.slice(0, 7) : sha;
}
function mainComparisonMessage(comparison: MainComparison): string {
  const ahead = comparison.ahead_by ?? '?';
  const behind = comparison.behind_by ?? '?';
  return `${ahead} commit(s) d'avance sur main, ${behind} commit(s) de retard.`;
}
function formatDate(value: string): string {
  if (!value || value === 'unknown') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('fr-FR');
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
];
const relativeFormatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

function formatRelative(value: string | null): string {
  if (!value || value === 'unknown') return value ?? '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) return 'à l\'instant';
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (absSeconds >= secondsInUnit) {
      return relativeFormatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return formatDate(value);
}

async function copySha(sha: string): Promise<void> {
  await navigator.clipboard.writeText(sha);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}

type BadgeTone = 'success' | 'warning' | 'error' | 'info';
const statusBadge = computed<{ label: string; tone: BadgeTone } | null>(() => {
  if (!info.value) return null;
  const v = info.value;
  if (v.latest_release && !v.is_latest) return { label: 'Mise à jour disponible', tone: 'warning' };
  if (v.commit_matches_release === false) return { label: 'Désaligné', tone: 'error' };
  if (v.is_latest && v.commit_matches_release) return { label: 'À jour', tone: 'success' };
  if (!v.latest_release) return { label: 'Inconnu', tone: 'info' };
  return null;
});

// Petit rendu Markdown -> HTML, volontairement minimal (juste ce que produit le
// changelog genere par git-cliff : titres ###, listes a puces, gras, code inline,
// liens). Le texte source est integralement echappe AVANT toute generation de
// balise, donc aucun HTML/JS du corps de la release ne peut jamais s'executer,
// meme si `body` contenait un jour du contenu non fiable.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const html: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeList();
  return html.join('\n');
}

const renderedReleaseNotes = computed(() =>
  info.value?.latest_release?.body ? renderMarkdown(info.value.latest_release.body) : '<p>Aucune note de version.</p>',
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    info.value = await api<VersionInfo>('/api/system/version');
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.system-version { display: grid; gap: var(--space-4); }
.version-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin: var(--space-3) 0 0; }
.version-grid dt { margin: 0 0 4px; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
.version-grid dd { margin: 0; font-size: var(--fs-md); }
.version-grid dd.mono, .version-grid dd .mono { font-family: var(--font-mono, monospace); }
.commit-cell { display: flex; align-items: center; gap: var(--space-2); }
.icon-button { display: inline-flex; align-items: center; justify-content: center; padding: 2px; border: none; background: transparent; color: var(--muted); cursor: pointer; border-radius: var(--radius-sm); }
.icon-button:hover { color: var(--text); background: var(--surface-2); }
.branch-badge { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-sm); font-weight: 700; text-transform: uppercase; }
.branch-badge.branch-main { color: var(--success); background: rgba(34,197,94,.13); }
.branch-badge.branch-test { color: var(--accent); background: rgba(229,160,13,.13); }
.branch-badge.branch-dev { color: #60a5fa; background: rgba(96,165,250,.13); }
.status-badge { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); font-size: var(--fs-sm); font-weight: 700; }
.status-badge.status-success { color: var(--success); background: rgba(34,197,94,.13); }
.status-badge.status-warning { color: var(--accent); background: rgba(229,160,13,.13); }
.status-badge.status-error { color: var(--danger, #ef4444); background: rgba(239,68,68,.13); }
.status-badge.status-info { color: var(--muted); background: var(--surface-2); }
.ui-feedback { margin-top: var(--space-3); }
.checked-at { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--fs-xs); }
.release-body { max-height: 420px; margin: var(--space-3) 0 0; padding: var(--space-3); overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.5; }
.release-body :deep(h3), .release-body :deep(h4) { margin: var(--space-3) 0 var(--space-2); font-size: var(--fs-md); }
.release-body :deep(h3:first-child), .release-body :deep(h4:first-child) { margin-top: 0; }
.release-body :deep(ul) { margin: 0 0 var(--space-2); padding-left: 1.3em; }
.release-body :deep(p) { margin: 0 0 var(--space-2); }
.release-body :deep(code) { padding: 1px 5px; border-radius: var(--radius-sm); background: var(--surface-1); font-family: var(--font-mono, monospace); font-size: .9em; }
</style>

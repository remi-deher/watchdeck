<template>
  <div class="settings-merged system-version">
    <UiFeedback v-if="error" type="error" title="Impossible de récupérer les informations de version" :message="error" retry @retry="load"/>
    <template v-else-if="info">
      <!-- Le verdict d'abord : à jour, mise à jour disponible, ou image différente du tag. -->
      <section class="version-verdict" :class="`is-${verdict.tone}`" aria-live="polite">
        <div>
          <h2>{{ verdict.title }}</h2>
          <p>{{ verdict.detail }}</p>
        </div>
        <UiButton size="sm" :loading="checking" @click="checkNow"><template #icon><RefreshCw/></template>Vérifier maintenant</UiButton>
        <small v-if="info.release_checked_at" class="version-checked">GitHub vérifié {{ formatRelative(info.release_checked_at) }}</small>
      </section>

      <!-- Watchdeck ne se met pas à jour tout seul : on dit comment, là où on en a besoin. -->
      <section v-if="verdict.tone !== 'success' && verdict.tone !== 'info'" class="panel version-update">
        <h3>Mettre à jour</h3>
        <p>Watchdeck ne se met pas à jour tout seul : tirez la nouvelle image puis redémarrez.</p>
        <UiSegmentedControl v-model="installKind" ariaLabel="Type d’installation" :options="[{ value: 'compose', label: 'Docker Compose' }, { value: 'truenas', label: 'TrueNAS' }]" />
        <pre class="version-command"><code>{{ installCommand }}</code></pre>
        <UiButton size="sm" @click="copy(installCommand, 'command')"><Check v-if="copied === 'command'" :size="14"/><Copy v-else :size="14"/>{{ copied === 'command' ? 'Copié' : 'Copier' }}</UiButton>
      </section>

      <section class="panel">
        <h3 class="version-h3">Ce qui tourne</h3>
        <dl class="version-grid">
          <div><dt>Version</dt><dd>{{ info.version }}</dd></div>
          <div><dt>Branche</dt><dd><span class="branch-badge" :class="`branch-${info.branch}`">{{ info.branch }}</span></dd></div>
          <div>
            <dt>Commit</dt>
            <dd class="commit-cell">
              <a v-if="info.repo_url" class="mono" :href="`${info.repo_url}/commit/${info.git_sha}`" target="_blank" rel="noopener noreferrer">{{ shortSha(info.git_sha) }}</a>
              <span v-else class="mono">{{ shortSha(info.git_sha) }}</span>
              <UiButton variant="ghost" size="sm" icon-only v-if="isRealSha(info.git_sha)" title="Copier le SHA complet" aria-label="Copier le SHA complet" @click="copy(info.git_sha, 'sha')">
                <Check v-if="copied === 'sha'" :size="14"/><Copy v-else :size="14"/>
              </UiButton>
            </dd>
          </div>
          <div><dt>Construite</dt><dd :title="formatDate(info.build_date)">{{ formatRelative(info.build_date) }}</dd></div>
          <div><dt>Image</dt><dd>{{ info.docker_repositories.join(', ') }}</dd></div>
        </dl>
        <p v-if="info.main_comparison" class="version-comparison">{{ mainComparisonMessage(info.main_comparison) }}</p>
      </section>

      <section v-if="releases.length" class="panel">
        <h3 class="version-h3">{{ newer.length ? 'Nouveautés depuis votre version' : `Notes de ${releases[0].tag_name}` }}</h3>
        <CollapsibleRoot v-for="(release, index) in releases" :key="release.tag_name" class="version-release" :default-open="index === 0">
          <CollapsibleTrigger class="version-release__head">
            <strong>{{ release.name || release.tag_name }}</strong>
            <small v-if="release.published_at" :title="formatDate(release.published_at)">{{ formatRelative(release.published_at) }}</small>
            <ChevronDown class="version-release__chevron" aria-hidden="true"/>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="release-body" v-html="renderMarkdown(release.body || 'Aucune note de version.')"/>
            <a v-if="release.html_url" class="version-release__link" :href="release.html_url" target="_blank" rel="noopener noreferrer">Voir sur GitHub<ExternalLink/></a>
          </CollapsibleContent>
        </CollapsibleRoot>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatDateTimeSeconds, parseApiDate } from '@/utils/format';
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Check, ChevronDown, Copy, ExternalLink, RefreshCw } from '@lucide/vue';
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
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
  releases_since?: LatestRelease[];
}

const versionQuery = useQuery({
  queryKey: ['settings', 'system-version'],
  queryFn: ({ signal }) => api<VersionInfo>('/api/system/version', { signal }),
});
const info = computed(() => versionQuery.data.value ?? null);
const loading = computed(() => versionQuery.isFetching.value);
const error = computed(() => (versionQuery.error.value ? humanizeError(versionQuery.error.value) : ''));
const copied = ref<string | null>(null);
const queryClient = useQueryClient();
const checking = ref(false);
/* « Vérifier maintenant » : le serveur oublie son cache et repart chez GitHub. */
async function checkNow(): Promise<void> {
  checking.value = true;
  try {
    queryClient.setQueryData(['settings', 'system-version'], await api<VersionInfo>('/api/system/version?refresh=true'));
  } finally {
    checking.value = false;
  }
}
const newer = computed(() => info.value?.releases_since || []);
/* Toutes les versions publiées depuis la vôtre ; à jour, seulement les notes de la dernière. */
const releases = computed<LatestRelease[]>(() => (newer.value.length ? newer.value : info.value?.latest_release ? [info.value.latest_release] : []));
const verdict = computed<{ tone: 'success' | 'warning' | 'error' | 'info'; title: string; detail: string }>(() => {
  const v = info.value;
  if (!v) return { tone: 'info', title: '', detail: '' };
  if (v.latest_release && !v.is_latest) {
    const count = newer.value.length;
    return {
      tone: 'warning',
      title: `Mise à jour disponible : ${v.latest_release.tag_name}`,
      detail: `Vous exécutez ${v.version}${count ? ` · ${count} version${count > 1 ? 's' : ''} publiée${count > 1 ? 's' : ''} depuis` : ''}${v.latest_release.published_at ? ` · dernière ${formatRelative(v.latest_release.published_at)}` : ''}.`,
    };
  }
  if (v.commit_matches_release === false) {
    return { tone: 'error', title: `Image différente de la release ${v.version}`, detail: 'Le numéro annonce la dernière release, mais le commit de l’image ne correspond pas à celui du tag. Retirer l’image corrige souvent l’écart.' };
  }
  if (v.is_latest) return { tone: 'success', title: 'Watchdeck est à jour', detail: `Vous exécutez ${v.version}, la dernière version publiée${v.commit_matches_release ? ', et son commit correspond au tag' : ''}.` };
  return { tone: 'info', title: `Version ${v.version}`, detail: 'Dernière release GitHub introuvable : pas de connexion à GitHub, ou aucune release publiée.' };
});
const installKind = ref<'compose' | 'truenas'>('compose');
const installCommand = computed(() => (installKind.value === 'compose'
  ? 'docker compose pull && docker compose up -d'
  : 'midclt call -j app.pull_images watchdeck \'{"redeploy": true}\''));

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
  const date = parseApiDate(value);
  return Number.isNaN(date.getTime()) ? value : formatDateTimeSeconds(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
];
const relativeFormatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

function formatRelative(value: string | null): string {
  if (!value || value === 'unknown') return value ?? '';
  const date = parseApiDate(value);
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

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    setTimeout(() => { copied.value = null; }, 1500);
  } catch {
    // Presse-papiers refusé : le texte reste sélectionnable à l'écran.
  }
}


// Petit rendu Markdown -> HTML, volontairement minimal (juste ce que produit le
// changelog genere par git-cliff : titres ###, listes a puces, gras, code inline,
// liens). Le texte source est integralement echappe AVANT toute generation de
// balise, donc aucun HTML/JS du corps de la release ne peut jamais s'executer,
// meme si `body` contenait un jour du contenu non fiable.
function escapeHtml(s: string): string {
  // Guillemets compris : un lien Markdown finit dans un attribut href="...", qu'un `"`
  // non echappe permettrait de refermer pour y ajouter un attribut (onmouseover...).
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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


function load(): void {
  void versionQuery.refetch();
}
</script>

<style scoped lang="scss">
.system-version { display: grid; gap: var(--space-4); }
.version-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin: var(--space-3) 0 0; }
.version-grid dt { margin: 0 0 4px; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
.version-grid dd { margin: 0; font-size: var(--fs-md); }
.version-grid dd.mono, .version-grid dd .mono { font-family: var(--font-mono, monospace); }
.commit-cell { display: flex; align-items: center; gap: var(--space-2); }
.branch-badge { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-sm); font-weight: 700; text-transform: uppercase; }
.branch-badge.branch-main { color: var(--green-text); background: color-mix(in srgb, var(--green) 13%, transparent); }
.branch-badge.branch-test { color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
.branch-badge.branch-dev { color: var(--blue-text); background: color-mix(in srgb,var(--blue) 13%,transparent); }
.status-badge { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); font-size: var(--fs-sm); font-weight: 700; }
.status-badge.status-success { color: var(--green-text); background: color-mix(in srgb, var(--green) 13%, transparent); }
.status-badge.status-warning { color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
.status-badge.status-error { color: var(--red-text); background: color-mix(in srgb, var(--red) 13%, transparent); }
.status-badge.status-info { color: var(--muted); background: var(--surface-2); }
.ui-feedback { margin-top: var(--space-3); }
.checked-at { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--fs-xs); }
.release-body { max-height: 420px; margin: var(--space-3) 0 0; padding: var(--space-3); overflow: auto; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.5; }
.release-body :deep(h3), .release-body :deep(h4) { margin: var(--space-3) 0 var(--space-2); font-size: var(--fs-md); }
.release-body :deep(h3:first-child), .release-body :deep(h4:first-child) { margin-top: 0; }
.release-body :deep(ul) { margin: 0 0 var(--space-2); padding-left: 1.3em; }
.release-body :deep(p) { margin: 0 0 var(--space-2); }
.release-body :deep(code) { padding: 1px 5px; border-radius: var(--radius-sm); background: var(--surface-1); font-family: var(--font-mono, monospace); font-size: .9em; }
.version-verdict { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); }
.version-verdict > div { flex: 1 1 16rem; min-width: 0; }
.version-verdict h2 { margin: 0 0 2px; font-size: var(--fs-md); }
.version-verdict p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.version-verdict.is-success { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.version-verdict.is-warning { border-color: color-mix(in srgb, var(--amber) 45%, var(--border)); background: color-mix(in srgb, var(--amber) 7%, var(--surface)); }
.version-verdict.is-error { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }
.version-checked { color: var(--muted); font-size: var(--fs-xs); }
.version-update { display: grid; gap: var(--space-2); justify-items: start; }
.version-update h3, .version-h3 { margin: 0 0 var(--space-2); font-size: var(--fs-md); }
.version-update p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.version-command { width: 100%; max-width: 100%; margin: 0; padding: var(--space-3); overflow-x: auto; border-radius: var(--inset-radius); background: var(--surface-2); font-size: var(--fs-sm); }
.version-comparison { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--fs-sm); }
.version-release { border: 1px solid var(--border); border-radius: var(--inset-radius); }
.version-release + .version-release { margin-top: var(--space-2); }
.version-release__head { display: flex; width: 100%; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.version-release__head small { color: var(--muted); }
.version-release__chevron { width: 16px; height: 16px; margin-left: auto; transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
.version-release__head[data-state='open'] .version-release__chevron { transform: rotate(180deg); }
.version-release .release-body { margin: 0 var(--space-3) var(--space-2); }
.version-release__link { display: inline-flex; gap: 4px; align-items: center; margin: 0 var(--space-3) var(--space-3); font-size: var(--fs-sm); }
.version-release__link svg { width: 14px; height: 14px; }
</style>

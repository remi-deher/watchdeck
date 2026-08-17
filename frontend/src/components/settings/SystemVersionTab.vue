<template>
  <div class="settings-merged system-version">
    <section class="panel">
      <UiSectionHeader eyebrow="Application" title="Version en cours d'exécution">
        <template #actions>
          <UiButton size="sm" :loading="loading" @click="load"><template #icon><RefreshCw/></template>Actualiser</UiButton>
        </template>
      </UiSectionHeader>
      <UiFeedback v-if="error" type="error" title="Impossible de récupérer les informations de version" :message="error"/>
      <template v-else-if="info">
        <dl class="version-grid">
          <div><dt>Branche</dt><dd><span class="branch-badge" :class="`branch-${info.branch}`">{{ info.branch }}</span></dd></div>
          <div><dt>Version</dt><dd>{{ info.version }}</dd></div>
          <div><dt>Commit</dt><dd class="mono">{{ shortSha(info.git_sha) }}</dd></div>
          <div><dt>Build</dt><dd>{{ formatDate(info.build_date) }}</dd></div>
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
      </template>
    </section>

    <section v-if="info?.latest_release" class="panel">
      <UiSectionHeader eyebrow="Release notes" :title="info.latest_release.name || info.latest_release.tag_name">
        <template #meta><a :href="info.latest_release.html_url" target="_blank" rel="noopener noreferrer">Voir sur GitHub<ExternalLink/></a></template>
      </UiSectionHeader>
      <pre class="release-body">{{ info.latest_release.body || 'Aucune note de version.' }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ExternalLink, RefreshCw } from '@lucide/vue';
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
  docker_repositories: string[];
  latest_release: LatestRelease | null;
  is_latest: boolean;
  commit_matches_release: boolean | null;
  main_comparison: MainComparison | null;
}

const info = ref<VersionInfo | null>(null);
const loading = ref(false);
const error = ref('');

function shortSha(sha: string): string {
  return sha && sha !== 'unknown' ? sha.slice(0, 7) : sha;
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
.version-grid dd.mono { font-family: var(--font-mono, monospace); }
.branch-badge { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-sm); font-weight: 700; text-transform: uppercase; }
.branch-badge.branch-main { color: var(--success); background: rgba(34,197,94,.13); }
.branch-badge.branch-test { color: var(--accent); background: rgba(229,160,13,.13); }
.branch-badge.branch-dev { color: #60a5fa; background: rgba(96,165,250,.13); }
.ui-feedback { margin-top: var(--space-3); }
.release-body { max-height: 420px; margin: var(--space-3) 0 0; padding: var(--space-3); overflow: auto; white-space: pre-wrap; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.5; }
</style>

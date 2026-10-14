<template>
  <!-- De la page la moins risquée à la plus risquée : sauvegarder, importer, puis la zone
       dangereuse, qui remplace toute l'instance. -->
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-backup>
      <ConfigureField label="Sauvegarde complète" help="Dump PostgreSQL, clé de chiffrement, fichiers hors base et export JSON de repli. Seule méthode qui restaure tout à l'identique, compte admin et historiques compris.">
        <UiButton variant="primary" href="/api/backup/full"><ShieldAlert/>Télécharger</UiButton>
      </ConfigureField>
      <ConfigureField label="Export JSON" help="Fichier lisible et réimportable : utilisateurs, paramètres, demandes, instances *arr, clients, fournisseurs et modèles d'email. Journaux et caches y figurent pour référence mais ne sont jamais réimportés.">
        <UiButton :href="includeSecrets?'/api/export?include_secrets=true':'/api/export'"><Download/>Exporter en JSON</UiButton>
      </ConfigureField>
      <ConfigureField label="Inclure les identifiants dans l'export" help="Sans cette option, les jetons Plex/*arr et les clés de notification sont omis de l'export JSON : pratique pour partager une configuration.">
        <ToggleSwitch v-model="includeSecrets" title="Inclure les identifiants" />
      </ConfigureField>
      <ConfigureField label="Dump de la base" help="Dump PostgreSQL brut, à restaurer avec docker compose --profile operations run --rm restore (voir le README).">
        <UiButton href="/api/backup/db"><HardDriveDownload/>Backup de la base</UiButton>
      </ConfigureField>
    </template>

    <template #section-import>
      <ConfigureField label="Fichier JSON" stacked>
        <div class="data-line">
          <input ref="jsonInput" type="file" accept=".json" aria-label="Fichier JSON à importer">
          <UiButton :disabled="busy" @click="importJson"><Upload/>Fusionner les données</UiButton>
        </div>
      </ConfigureField>
    </template>

    <template #section-danger>
      <ConfigureField label="Restaurer une sauvegarde complète" help="Remplace toute l'instance par le contenu de l'archive. Une sauvegarde de sécurité est prise juste avant." stacked>
        <input ref="fullBackupInput" type="file" accept=".zip" aria-label="Archive de sauvegarde complète" @change="onFullBackupFileChange">
        <template v-if="fullBackupSelected">
          <p class="warning-text">Cette action remplace ENTIÈREMENT la base de données et la configuration actuelles par celles de l'archive. Rien n'est fusionné : tout ce qui existe aujourd'hui sur cette instance (réglages, utilisateurs, demandes, historiques) sera perdu, hormis une sauvegarde de sécurité automatique prise juste avant. L'application redémarre ensuite.</p>
          <div class="data-line">
            <input v-model="fullRestoreConfirmation" class="mono" placeholder="REMPLACER" aria-label="Tapez REMPLACER pour confirmer">
            <UiButton variant="primary" class="danger-button" :disabled="busy||fullRestoreConfirmation!=='REMPLACER'" @click="restoreFullBackup"><ShieldAlert/>Tout remplacer</UiButton>
          </div>
        </template>
        <p v-if="restoreRestarting" class="hint">Restauration terminée, l'application redémarre. Cette page va se recharger automatiquement.</p>
      </ConfigureField>
    </template>

    <template #section-deleted>
      <ConfigureField
        v-for="entry in deletedLog"
        :key="entry.id"
        :label="entry.title"
        :help="`${mediaTypeLabel(entry.media_type)} · supprimé le ${formatDate(entry.deleted_at)}${entry.deleted_by ? ` par ${entry.deleted_by}` : ''}`"
      >
        <UiButton :disabled="busy" @click="forgetEntry(entry.id)">Oublier</UiButton>
      </ConfigureField>
      <p v-if="!deletedLog.length" class="hint">Aucun média dans ce journal.</p>
    </template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { formatDate } from '@/utils/format';
import { mediaTypeLabel } from '@/utils/labels';
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Download, HardDriveDownload, ShieldAlert, Upload } from '@lucide/vue';
import { Archive, FileUp, History } from '@lucide/vue';
import { api } from '@/api';
import { load, success, fail } from '@/settingsForm';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';

const page = useSettingsPage();
const includeSecrets = ref(false);
const queryClient = useQueryClient();
const jsonInput = ref<HTMLInputElement | null>(null);
const fullBackupInput = ref<HTMLInputElement | null>(null), fullRestoreConfirmation = ref(''), restoreRestarting = ref(false), fullBackupSelected = ref(false);
function onFullBackupFileChange(): void {
  fullBackupSelected.value = Boolean(fullBackupInput.value?.files?.[0]);
  fullRestoreConfirmation.value = '';
}

const deletedLogQuery = useQuery({ queryKey: ['settings', 'deleted-log'], queryFn: () => api<any[]>('/api/requests/deleted-log').catch(() => []) });
const deletedLog = computed(() => deletedLogQuery.data.value || []);
const sections = computed(() => [
  { key: 'backup', title: 'Sauvegarder', description: 'Ces fichiers peuvent contenir des secrets : gardez-les hors du dépôt et des espaces partagés.', icon: Archive, keywords: ['backup', 'export', 'dump', 'postgresql', 'json'] },
  { key: 'import', title: 'Importer un export JSON', description: 'Fusionne un export précédent dans cette instance : les données sont ajoutées ou mises à jour, rien n\'est effacé.', icon: FileUp, keywords: ['import', 'fusionner'] },
  { key: 'danger', title: 'Zone dangereuse', description: 'Remplace toute l\'instance par une sauvegarde complète.', icon: ShieldAlert, keywords: ['restaurer', 'remplacer', 'restauration'] },
  { key: 'deleted', title: `Médias supprimés${deletedLog.value.length ? ` (${deletedLog.value.length})` : ''}`, description: 'Supprimés délibérément par un admin : toute nouvelle demande pour l\'un d\'eux reste en attente d\'approbation, même avec l\'auto-approbation.', icon: History, keywords: ['supprimés', 'oublier', 'journal'] },
]);

const forgetMutation = useMutation({
  mutationFn: (id: number) => api(`/api/requests/deleted-log/${id}`, { method: 'DELETE' }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'deleted-log'] }),
});
async function forgetEntry(id: number): Promise<void> {
  try { await forgetMutation.mutateAsync(id); } catch (e) { fail(e); }
}

async function upload(path: string, file: File, extra: Record<string, any> = {}): Promise<any> {
  const body = new FormData();
  body.append('file', file);
  for (const [key, value] of Object.entries(extra)) body.append(key, value);
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}
const uploadMutation = useMutation({
  mutationFn: ({ path, file, extra }: { path: string; file: File; extra?: Record<string, any> }) => upload(path, file, extra),
  retry: 0,
});
const busy = computed(() => forgetMutation.isPending.value || uploadMutation.isPending.value);
async function importJson(): Promise<void> {
  const file = jsonInput.value?.files?.[0];
  if (!file) return;
  try {
    const data = await uploadMutation.mutateAsync({ path: '/api/import', file });
    success(`Import terminé : ${data.stats.users_upserted} utilisateurs.`);
    await load();
  } catch (e) { fail(e); }
}
async function restoreFullBackup(): Promise<void> {
  const file = fullBackupInput.value?.files?.[0];
  if (!file || fullRestoreConfirmation.value !== 'REMPLACER') return;
  try {
    await uploadMutation.mutateAsync({ path: '/api/backup/full/restore', file, extra: { confirm: fullRestoreConfirmation.value } });
    restoreRestarting.value = true;
    setTimeout(() => location.assign('/login'), 8000);
  } catch (e) { fail(e); }
}
</script>
<style scoped lang="scss">
.data-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.data-line input {
  flex: 1 1 240px;
  min-width: 0;
}
</style>

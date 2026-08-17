<template>
  <div class="settings-grid">
    <div class="settings-cards span-two">
      <SettingsCard title="Export et sauvegarde" subtitle="Deux formats distincts : un export JSON portable, et un dump complet de la base." :icon="HardDriveDownload" status="neutral" :collapsible="false">
        <label class="check"><input v-model="includeSecrets" type="checkbox"> Inclure les identifiants</label>
        <small class="check-hint">Sans cette case, les tokens Plex/*arr et cles de notification sont omis de l'export JSON — pratique pour partager une config sans exposer de secrets.</small>
        <div class="actions">
          <a class="secondary" :href="includeSecrets?'/api/export?include_secrets=true':'/api/export'"><Download/>Exporter en JSON</a>
          <a class="secondary" href="/api/backup/db"><HardDriveDownload/>Backup complet</a>
        </div>
        <p class="warning-text">Ces fichiers peuvent contenir des secrets.</p>
        <p class="hint">"Exporter en JSON" produit un fichier lisible et portable (utilisateurs, parametres, demandes, instances *arr, clients de telechargement, fournisseurs et modeles d'email) reutilisable avec "Importer un export JSON" ci-dessous. Les journaux et donnees regenerables (bibliotheque, historiques, cache) sont inclus pour reference mais jamais reimportes. "Backup complet" produit un dump PostgreSQL brut, destine a une restauration via <code>docker compose --profile operations run --rm restore</code> (voir le README).</p>
      </SettingsCard>

      <SettingsCard title="Importer un export JSON" subtitle="Fusionne un export JSON precedent dans cette instance, sans rien supprimer." :icon="Upload" status="neutral" :collapsible="false">
        <input ref="jsonInput" type="file" accept=".json">
        <div class="actions">
          <button class="secondary" :disabled="busy" @click="importJson"><Upload/>Fusionner les donnees</button>
        </div>
        <p class="hint">Les utilisateurs et donnees du fichier sont ajoutes ou mis a jour (upsert) par-dessus l'existant — rien n'est efface. Utile pour restaurer un export JSON ou fusionner deux instances.</p>
      </SettingsCard>

      <SettingsCard title="Reprise apres sinistre" subtitle="Sauvegarde complete (base + cles + configuration) et restauration a l'identique." :icon="ShieldAlert" status="neutral" :collapsible="false">
        <div class="actions">
          <a class="secondary" href="/api/backup/full"><ShieldAlert/>Telecharger la sauvegarde complete</a>
        </div>
        <p class="hint">Archive unique contenant le dump PostgreSQL complet, la cle de chiffrement et les autres fichiers hors base, plus un export JSON de repli. C'est la seule methode qui restaure absolument tout a l'identique (y compris le compte admin et les historiques) — l'export JSON ci-dessus en est volontairement une version partielle.</p>

        <input ref="fullBackupInput" type="file" accept=".zip" @change="onFullBackupFileChange">
        <template v-if="fullBackupSelected">
          <p class="warning-text">Cette action remplace ENTIEREMENT la base de donnees et la configuration actuelles par celles de l'archive. Rien n'est fusionne : tout ce qui existe aujourd'hui sur cette instance (reglages, utilisateurs, demandes, historiques) sera perdu, hormis une sauvegarde de securite automatique prise juste avant. L'application redemarre ensuite.</p>
          <label>Confirmation<input v-model="fullRestoreConfirmation" class="mono" placeholder="REMPLACER"></label>
          <button class="primary danger-button" :disabled="busy||fullRestoreConfirmation!=='REMPLACER'" @click="restoreFullBackup"><ShieldAlert/>Tout remplacer</button>
        </template>
        <p v-if="restoreRestarting" class="hint">Restauration terminee, l'application redemarre. Cette page va se recharger automatiquement.</p>
      </SettingsCard>

      <SettingsCard title="Ancienne base SQLite" subtitle="Migration ponctuelle depuis une installation Plex RSS Monitor / Plexarr / Watchdeck pre-PostgreSQL." :icon="DatabaseZap" status="neutral" :collapsible="false">
        <input ref="sqliteInput" type="file" accept=".db,.sqlite,.sqlite3" @change="resetInspection">
        <div class="actions">
          <button class="secondary" :disabled="busy" @click="inspectSqlite"><Search/>Inspecter</button>
        </div>
        <div v-if="inspection" class="migration-summary">
          <strong>{{ inspection.total_rows.toLocaleString() }} lignes</strong>
          <span>{{ inspection.populated_tables }} tables · integrite {{ inspection.integrity }}</span>
          <div class="table-badges">
            <span v-for="(count,name) in populatedTables" :key="name" class="badge">{{ name }} : {{ count.toLocaleString() }}</span>
          </div>
        </div>
        <template v-if="inspection">
          <p class="warning-text">Une sauvegarde PostgreSQL sera creee avant le remplacement.</p>
          <label>Confirmation<input v-model="confirmation" class="mono" placeholder="REMPLACER"></label>
          <button class="primary danger-button" :disabled="busy||confirmation!=='REMPLACER'" @click="migrateSqlite"><DatabaseZap/>Remplacer</button>
        </template>
      </SettingsCard>

      <SettingsCard title="Medias supprimes" :icon="Trash2" status="neutral" :collapsible="false">
        <p>
          Ces medias ont ete deliberement supprimes par un admin. Toute nouvelle demande
          pour l'un d'eux (watchlist, requete manuelle) sera forcee en attente
          d'approbation, meme si l'auto-approbation est activee.
        </p>
        <p v-if="!deletedLog.length">Aucun media dans ce journal.</p>
        <div v-for="entry in deletedLog" :key="entry.id" class="detail-row">
          <div>
            <strong>{{ entry.title }}</strong><br>
            <small>{{ mediaTypeLabel(entry.media_type) }} · supprime le {{ formatDate(entry.deleted_at) }}{{ entry.deleted_by ? ` par ${entry.deleted_by}` : '' }}</small>
          </div>
          <button class="secondary" :disabled="busy" @click="forgetEntry(entry.id)">Oublier</button>
        </div>
      </SettingsCard>
    </div>
  </div>
</template>
<script setup lang="ts">
import { formatDate } from '@/utils/format';
import { mediaTypeLabel } from '@/utils/labels';
import { computed, onMounted, ref } from 'vue';
import { DatabaseZap, Download, HardDriveDownload, Search, ShieldAlert, Trash2, Upload } from '@lucide/vue';
import { api } from '@/api';
import { load, success, fail } from '@/settingsForm';
import SettingsCard from './SettingsCard.vue';

const busy = ref(false), includeSecrets = ref(false);
const jsonInput = ref<HTMLInputElement | null>(null), sqliteInput = ref<HTMLInputElement | null>(null), inspection = ref<any>(null), confirmation = ref('');
const fullBackupInput = ref<HTMLInputElement | null>(null), fullRestoreConfirmation = ref(''), restoreRestarting = ref(false), fullBackupSelected = ref(false);
function onFullBackupFileChange(): void {
  fullBackupSelected.value = Boolean(fullBackupInput.value?.files?.[0]);
  fullRestoreConfirmation.value = '';
}
const populatedTables = computed((): Record<string, number> => Object.fromEntries(
  Object.entries(inspection.value?.tables || {})
    .map(([name, count]): [string, number] => [name, Number(count)])
    .filter(([, count]) => count > 0)
));

const deletedLog = ref<any[]>([]);
async function loadDeletedLog(): Promise<void> {
  deletedLog.value = await api('/api/requests/deleted-log').catch(() => []);
}
async function forgetEntry(id: number): Promise<void> {
  busy.value = true;
  try {
    await api(`/api/requests/deleted-log/${id}`, { method: 'DELETE' });
    await loadDeletedLog();
  } catch (e) { fail(e); } finally { busy.value = false; }
}
onMounted(loadDeletedLog);

async function upload(path: string, file: File, extra: Record<string, any> = {}): Promise<any> {
  const body = new FormData();
  body.append('file', file);
  for (const [key, value] of Object.entries(extra)) body.append(key, value);
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}
async function importJson(): Promise<void> {
  const file = jsonInput.value?.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const data = await upload('/api/import', file);
    success(`Import termine : ${data.stats.users_upserted} utilisateurs.`);
    await load();
  } catch (e) { fail(e); } finally { busy.value = false; }
}
async function restoreFullBackup(): Promise<void> {
  const file = fullBackupInput.value?.files?.[0];
  if (!file || fullRestoreConfirmation.value !== 'REMPLACER') return;
  busy.value = true;
  try {
    await upload('/api/backup/full/restore', file, { confirm: fullRestoreConfirmation.value });
    restoreRestarting.value = true;
    setTimeout(() => location.assign('/login'), 8000);
  } catch (e) { fail(e); } finally { busy.value = false; }
}
function resetInspection(): void { inspection.value = null; confirmation.value = ''; }
async function inspectSqlite(): Promise<void> {
  const file = sqliteInput.value?.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    inspection.value = await upload('/api/migration/sqlite/inspect', file);
    success('Base SQLite valide.');
  } catch (e) { fail(e); } finally { busy.value = false; }
}
async function migrateSqlite(): Promise<void> {
  const file = sqliteInput.value?.files?.[0];
  if (!file || confirmation.value !== 'REMPLACER') return;
  busy.value = true;
  try {
    const data = await upload('/api/migration/sqlite', file, { confirm: confirmation.value });
    success(`Migration terminee : ${data.report.copied_rows.toLocaleString()} lignes.`);
    setTimeout(() => location.assign('/dashboard'), 1500);
  } catch (e) { fail(e); } finally { busy.value = false; }
}
</script>

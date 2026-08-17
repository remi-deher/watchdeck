<template>
  <ModalShell :open="open" title="Ajouter un torrent" subtitle="Envoyer un torrent ou un lien Magnet vers un client configuré." @close="emit('close')">
    <div class="add-torrent-tabs" role="tablist" aria-label="Source du torrent">
      <button class="tab-btn" :class="{ active: mode === 'url' }" type="button" role="tab" :aria-selected="mode === 'url'" @click="mode = 'url'">
        <Link /> Lien Magnet / URL
      </button>
      <button class="tab-btn" :class="{ active: mode === 'file' }" type="button" role="tab" :aria-selected="mode === 'file'" @click="mode = 'file'">
        <Upload /> Fichier .torrent
      </button>
    </div>

    <form class="add-torrent-form" @submit.prevent="submit">
      <div v-if="clients.length > 1" class="form-group">
        <label for="torrent-client">Client torrent cible</label>
        <select id="torrent-client" v-model="selectedClientId">
          <option v-for="cl in clients" :key="cl.id" :value="cl.id">{{ cl.name }} ({{ cl.client_type }})</option>
        </select>
      </div>

      <!-- Mode URL / Magnet -->
      <div v-if="mode === 'url'" class="form-group">
        <label for="torrent-url">Lien Magnet ou URL .torrent</label>
        <textarea
          id="torrent-url"
          v-model="torrentUrl"
          rows="3"
          placeholder="magnet:?xt=urn:btih:... ou http://..."
          required
        ></textarea>
      </div>

      <!-- Mode Fichier .torrent -->
      <div v-else class="form-group">
        <label>Fichier .torrent</label>
        <div
          class="file-dropzone"
          :class="{ 'has-file': !!selectedFile }"
          @dragover.prevent
          @drop.prevent="handleFileDrop"
          @click="fileInput?.click()"
        >
          <input ref="fileInput" type="file" accept=".torrent" class="sr-only" @change="handleFileSelect" />
          <Upload v-if="!selectedFile" />
          <FileText v-else />
          <span>{{ selectedFile ? selectedFile.name : 'Glissez un fichier .torrent ou cliquez pour parcourir' }}</span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="torrent-cat">Catégorie</label>
          <input id="torrent-cat" v-model="category" list="torrent-category-options" type="text" placeholder="Choisir ou créer une catégorie" autocomplete="off" />
          <datalist id="torrent-category-options"><option v-for="item in metadata.categories" :key="item.name" :value="item.name" /></datalist>
        </div>
        <div class="form-group">
          <label for="torrent-tags">Tags</label>
          <input id="torrent-tags" v-model="tags" list="torrent-tag-options" type="text" placeholder="Choisir ou saisir des tags séparés par des virgules" autocomplete="off" />
          <datalist id="torrent-tag-options"><option v-for="item in metadata.tags" :key="item" :value="item" /></datalist>
        </div>
      </div>

      <button v-if="metadata.mutable" type="button" class="secondary metadata-toggle" @click="showMetadataManager = !showMetadataManager"><Tags />{{ showMetadataManager ? 'Masquer la gestion' : 'Gérer les catégories et tags' }}</button>
      <section v-if="showMetadataManager && metadata.mutable" class="metadata-manager">
        <div v-for="kind in metadataKinds" :key="kind.key" class="metadata-kind">
          <header><strong>{{ kind.label }}</strong><span>{{ kind.items.length }}</span></header>
          <div class="metadata-create"><input v-model="newMetadata[kind.key]" :placeholder="`Nouvelle ${kind.singular.toLowerCase()}`" @keyup.enter.prevent="createMetadata(kind.key)" /><button type="button" class="secondary" :disabled="metadataBusy || !newMetadata[kind.key].trim()" @click="createMetadata(kind.key)"><Plus />Créer</button></div>
          <div class="metadata-list">
            <div v-for="item in kind.items" :key="item" class="metadata-item">
              <input v-if="editing.kind===kind.key&&editing.name===item" v-model="editing.value" @keyup.enter.prevent="renameMetadata" />
              <span v-else>{{ item }}</span>
              <button v-if="editing.kind===kind.key&&editing.name===item" type="button" class="icon-button" title="Enregistrer" @click="renameMetadata"><Check /></button>
              <button v-else type="button" class="icon-button" title="Renommer" @click="startRename(kind.key,item)"><Pencil /></button>
              <button type="button" class="icon-button danger" :title="pendingDelete.kind===kind.key&&pendingDelete.name===item?'Confirmer la suppression':'Supprimer'" @click="requestDelete(kind.key,item)"><Trash2 /></button>
            </div>
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>

      <div class="form-actions">
        <button type="button" class="secondary text-xs" :disabled="busy" @click="emit('close')">Annuler</button>
        <button type="submit" class="primary text-xs" :disabled="busy || !canSubmit">
          {{ busy ? 'Ajout en cours...' : 'Ajouter le torrent' }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Check, FileText, Link, Pencil, Plus, Tags, Trash2, Upload } from '@lucide/vue';
import { api } from '@/api';
import ModalShell from '@/components/ui/ModalShell.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    clients?: any[];
    initialFile?: File | null;
  }>(),
  {
    open: false,
    clients: () => [],
    initialFile: null,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'added'): void;
}>();

const mode = ref('url');
const selectedClientId = ref<string | number | null>(null);
const torrentUrl = ref('');
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const category = ref('');
const tags = ref('');
const busy = ref(false);
const errorMessage = ref('');
const metadata = reactive<{ categories: Array<{ name: string }>; tags: string[]; mutable: boolean }>({ categories: [], tags: [], mutable: false });
const metadataBusy = ref(false);
const showMetadataManager = ref(false);
const newMetadata = reactive<Record<string, string>>({ category: '', tag: '' });
const editing = reactive({ kind: '', name: '', value: '' });
const pendingDelete = reactive({ kind: '', name: '' });
const metadataKinds = computed(() => [
  { key: 'category', label: 'Catégories', singular: 'Catégorie', items: metadata.categories.map(item => item.name) },
  { key: 'tag', label: 'Tags', singular: 'Tag', items: metadata.tags },
]);

watch(
  () => props.clients,
  cls => {
    if (cls.length && !selectedClientId.value) {
      selectedClientId.value = cls[0].id;
    }
  },
  { immediate: true }
);

watch([() => props.open, selectedClientId], ([isOpen, clientId]) => {
  if (isOpen && clientId) loadMetadata();
}, { immediate: true });

async function loadMetadata(): Promise<void> {
  try {
    const payload = await api(`/api/downloads/clients/${selectedClientId.value}/metadata`);
    metadata.categories = payload.categories || [];
    metadata.tags = payload.tags || [];
    metadata.mutable = !!payload.mutable;
  } catch (e: any) {
    errorMessage.value = e.message;
  }
}

function canonicalValue(value: string, values: string[]): string {
  const clean = value.trim();
  return values.find(item => item.toLocaleLowerCase('fr') === clean.toLocaleLowerCase('fr')) || clean;
}

async function mutateMetadata(kind: string, action: string, name: string, newName?: string): Promise<boolean> {
  metadataBusy.value = true;
  errorMessage.value = '';
  try {
    await api(`/api/downloads/clients/${selectedClientId.value}/metadata`, { method: 'POST', body: JSON.stringify({ kind, action, name, new_name: newName || undefined }) });
    await loadMetadata();
    return true;
  } catch (e: any) { errorMessage.value = e.message; return false; }
  finally { metadataBusy.value = false; }
}

async function createMetadata(kind: string): Promise<void> {
  const values = kind === 'category' ? metadata.categories.map(item => item.name) : metadata.tags;
  const input = newMetadata[kind].trim();
  if (!input) return;
  const existing = values.find(item => item.toLocaleLowerCase('fr') === input.toLocaleLowerCase('fr'));
  if (!existing) await mutateMetadata(kind, 'create', input);
  if (kind === 'category') category.value = existing || input;
  else tags.value = normalizeTags([tags.value, existing || input].filter(Boolean).join(','));
  newMetadata[kind] = '';
}

function startRename(kind: string, name: string): void { Object.assign(editing, { kind, name, value: name }); }
async function renameMetadata(): Promise<void> {
  const value = editing.value.trim();
  if (!value || value === editing.name) { Object.assign(editing, { kind: '', name: '', value: '' }); return; }
  await mutateMetadata(editing.kind, 'rename', editing.name, value);
  Object.assign(editing, { kind: '', name: '', value: '' });
}
function requestDelete(kind: string, name: string): void {
  if (pendingDelete.kind === kind && pendingDelete.name === name) {
    mutateMetadata(kind, 'delete', name);
    Object.assign(pendingDelete, { kind: '', name: '' });
  } else Object.assign(pendingDelete, { kind, name });
}

function normalizeTags(value: string): string {
  const existing = metadata.tags;
  const seen = new Set();
  return value.split(',').map(item => canonicalValue(item, existing)).filter(item => {
    const key = item.toLocaleLowerCase('fr');
    if (!item || seen.has(key)) return false;
    seen.add(key); return true;
  }).join(', ');
}

async function ensureMetadataValues(): Promise<void> {
  if (!metadata.mutable) return;
  const categoryName = category.value.trim();
  if (categoryName && !metadata.categories.some(item => item.name.toLocaleLowerCase('fr') === categoryName.toLocaleLowerCase('fr'))) {
    if (!await mutateMetadata('category', 'create', categoryName)) throw new Error(errorMessage.value || 'Création de la catégorie impossible');
  }
  const existingTags = new Set(metadata.tags.map(item => item.toLocaleLowerCase('fr')));
  for (const tag of tags.value.split(',').map(item => item.trim()).filter(Boolean)) {
    if (!existingTags.has(tag.toLocaleLowerCase('fr'))) {
      if (!await mutateMetadata('tag', 'create', tag)) throw new Error(errorMessage.value || 'Création du tag impossible');
      existingTags.add(tag.toLocaleLowerCase('fr'));
    }
  }
}

watch(
  () => props.initialFile,
  file => {
    if (file) {
      selectedFile.value = file;
      mode.value = 'file';
    }
  },
  { immediate: true }
);

const canSubmit = computed(() => {
  if (mode.value === 'url') return !!torrentUrl.value.trim();
  return !!selectedFile.value;
});

function handleFileSelect(e: Event): void {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
  }
}

function handleFileDrop(e: DragEvent): void {
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    if (file.name.endsWith('.torrent')) {
      selectedFile.value = file;
    }
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    category.value = canonicalValue(category.value, metadata.categories.map(item => item.name));
    tags.value = normalizeTags(tags.value);
    await ensureMetadataValues();
    if (mode.value === 'url') {
      await api('/api/downloads/add', {
        method: 'POST',
        body: JSON.stringify({
          client_id: selectedClientId.value,
          torrent_url_or_magnet: torrentUrl.value.trim(),
          category: category.value.trim() || undefined,
          tags: tags.value.trim() || undefined,
        }),
      });
    } else {
      const formData = new FormData();
      formData.append('file', selectedFile.value as File);
      if (selectedClientId.value) formData.append('client_id', String(selectedClientId.value));
      if (category.value.trim()) formData.append('category', category.value.trim());
      if (tags.value.trim()) formData.append('tags', tags.value.trim());

      const res = await fetch('/api/downloads/add-file', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Échec de l\'envoi du fichier torrent');
      }
    }
    emit('added');
    emit('close');
  } catch (e: any) {
    errorMessage.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.add-torrent-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin-bottom: 14px;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.add-torrent-tabs::-webkit-scrollbar { display: none; }
.tab-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
@media (max-width: 640px) {
  .tab-btn { min-height: 44px; }
}
.tab-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}
.tab-btn.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  font-weight: 700;
}
.tab-btn svg {
  width: 14px;
  height: 14px;
}
.add-torrent-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.form-group label {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary, var(--text));
}
.form-group input,
.form-group select,
.form-group textarea {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-xs);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
.file-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: var(--fs-xs);
  color: var(--muted);
  text-align: center;
}
.file-dropzone:hover,
.file-dropzone.has-file {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
  color: var(--text);
}
.file-dropzone svg {
  width: 24px;
  height: 24px;
  color: var(--accent);
}
.error-msg {
  color: var(--danger);
  font-size: var(--fs-xs);
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.metadata-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;align-self:flex-start;min-height:38px}.metadata-toggle svg,.metadata-create svg{width:15px;height:15px}
.metadata-manager{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}
.metadata-kind{display:grid;align-content:start;gap:8px;min-width:0}.metadata-kind>header{display:flex;align-items:center;justify-content:space-between}.metadata-kind>header span{color:var(--muted);font-size:var(--fs-xs)}
.metadata-create{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.metadata-create input,.metadata-item input{min-width:0;width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)}.metadata-create button{display:inline-flex;align-items:center;gap:5px;padding:0 9px}
.metadata-list{display:grid;gap:4px;max-height:190px;overflow-y:auto;overscroll-behavior:contain}.metadata-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:4px;min-height:36px;padding:3px 4px 3px 9px;border-radius:var(--radius-sm);background:var(--surface)}.metadata-item>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-xs)}.metadata-item .icon-button{width:30px;height:30px;padding:0}.metadata-item .icon-button svg{width:14px;height:14px}
@media(max-width:640px){.metadata-manager{grid-template-columns:1fr}.metadata-toggle{align-self:stretch}.metadata-list{max-height:150px}}
</style>

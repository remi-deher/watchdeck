<template>
  <!-- Categorie et tags d'un ou plusieurs torrents, pre-remplis depuis le premier. -->
  <ModalShell :open="!!targets" title="Modifier Catégorie & Tags" subtitle="Mettre à jour le classement des torrents sélectionnés." @close="emit('close')">
    <form class="meta-form" @submit.prevent="emit('save', category.trim(), tags.trim())">
      <div class="form-group">
        <label for="meta-category">Catégorie</label>
        <input id="meta-category" v-model="category" type="text" placeholder="Ex: radarr, sonarr, films" />
      </div>
      <div class="form-group">
        <label for="meta-tags">Tags (séparés par des virgules)</label>
        <input id="meta-tags" v-model="tags" type="text" placeholder="Ex: watchdeck, vff, 1080p" />
      </div>
      <div class="form-actions">
        <UiButton :disabled="busy" @click="emit('close')">Annuler</UiButton>
        <UiButton variant="primary" type="submit" :disabled="busy">Enregistrer</UiButton>
      </div>
    </form>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';

const props = defineProps<{ targets: any[] | null; busy?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', category: string, tags: string): void }>();

const category = ref('');
const tags = ref('');

watch(() => props.targets, (rows) => {
  if (!rows?.length) return;
  category.value = rows[0].category || '';
  tags.value = rows[0].tags || '';
}, { immediate: true });
</script>

<style scoped>
.meta-form{display:grid;gap:var(--space-3)}
.form-group{display:grid;gap:6px}
.form-group label{font-size:var(--fs-xs);font-weight:600}
.form-group input{width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)}
.form-actions{display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
</style>

<template>
  <PageShell title="Releases" :description="request?.title||'Recherche Sonarr / Radarr'" :error="error" retry @retry="load">
    <p v-if="rootFolder" class="root-folder-info"><FolderOpen :size="14" /> Dossier racine : <code>{{ rootFolder }}</code></p>
    <section class="panel release-list">
      <template v-for="(release,index) in releases" :key="release.guid">
        <div v-if="index===firstEnglish" class="release-divider">Résultats anglais / non VF</div>
        <article class="release-row" :class="{french:release.is_french}">
          <div><strong>{{ release.title }}</strong><span>{{ release.indexer||'Indexeur' }} - {{ release.quality||release.protocol||'-' }}</span><small v-if="release.rejections?.length">{{ release.rejections.join(', ') }}</small></div>
          <div class="release-stats"><span>{{ formatSize(release.size) }}</span><span>{{ release.seeders||0 }} seeds</span><span>CF {{ release.custom_format_score||0 }}</span></div>
          <UiButton variant="ghost" icon-only :loading="grabbing===release.guid" title="Grab" aria-label="Grab" @click="grab(release)"><Download /></UiButton>
        </article>
      </template>
      <UiEmptyState v-if="!loading&&releases.length===0" message="Aucune release disponible." />
    </section>
  </PageShell>
</template>
<script setup lang="ts">import { computed,onMounted,ref } from "vue";import { Download,FolderOpen } from "@lucide/vue";import { useRoute } from "vue-router";import { api } from "@/api";import UiButton from '@/components/ui/UiButton.vue';import UiEmptyState from '@/components/ui/UiEmptyState.vue';
interface Release { guid: string; title?: string; indexer?: string; quality?: string; protocol?: string; size?: number; seeders?: number; custom_format_score?: number; rejections?: string[]; is_french?: boolean; indexer_id?: number | string; }
interface MediaRequest { id: number | string; title?: string; media_type: string; arr_instance_id?: number | string; }
const route=useRoute(),request=ref<MediaRequest|null>(null),releases=ref<Release[]>([]),loading=ref(false),grabbing=ref<string|null>(null),error=ref(''),rootFolder=ref('');
const firstEnglish=computed(()=>releases.value.findIndex(r=>!r.is_french));
function formatSize(v?: number): string {if(!v)return'-';return `${(v/1024/1024/1024).toFixed(1)} Go`}
async function load(): Promise<void> {loading.value=true;error.value='';rootFolder.value='';try{request.value=await api(`/api/requests/${route.params.requestId}`);const p=new URLSearchParams({media_type:request.value!.media_type,request_id:String(request.value!.id)});const [rel,folder]=await Promise.all([api(`/api/arr/releases?${p}`),api(`/api/arr/root-folder?${p}`).catch(()=>null)]);releases.value=rel;rootFolder.value=folder?.root_folder_path||''}catch(e:any){error.value=e.message;releases.value=[]}finally{loading.value=false}}
async function grab(release: Release): Promise<void> {if(grabbing.value)return;grabbing.value=release.guid;const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;error.value='';try{await api('/api/arr/grab',{method:'POST',body:JSON.stringify({media_type:request.value!.media_type,guid:release.guid,indexer_id:release.indexer_id,instance_id:request.value!.arr_instance_id,request_id:request.value!.id})});if(tab)tab.location.href='/downloads'}catch(e:any){if(tab)tab.close();error.value=e.message}finally{grabbing.value=null}}
onMounted(load);</script>
<style scoped lang="scss">
.root-folder-info{display:flex;align-items:center;gap:6px;margin:0 0 var(--space-3);color:var(--muted);font-size:var(--fs-sm)}.root-folder-info code{color:var(--text);font-family:inherit}.release-list{padding:0;overflow:hidden}.release-row{display:grid;grid-template-columns:minmax(0,1fr) auto 40px;gap:var(--space-4);align-items:center;min-height:72px;padding:12px 14px;border-bottom:1px solid var(--border)}.release-row.french{background:rgba(229,160,13,.07)}.release-row strong,.release-row span,.release-row small{display:block}.release-row small{color:var(--red-text)}.release-stats{display:grid;grid-template-columns:repeat(3,minmax(64px,auto));gap:var(--space-3);text-align:right}.release-divider{padding:10px 14px;color:var(--muted);background:var(--bg);border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-size:var(--fs-sm)}
</style>

<template>
  <a href="#main-content" class="skip-link">Aller au contenu principal</a>
  <div class="shell" :class="{ 'shell--bar': !isWide }">
    <!-- Une seule navigation, deux orientations : rail à gauche ou barre en bas. -->
    <AppNav
      :orientation="isWide ? 'rail' : 'bar'"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      @open-palette="palette?.open()"
    />
    <CommandPalette ref="palette" :is-admin="isAdmin" :can-moderate="canModerate" />

    <main id="main-content" class="main" tabindex="-1">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <component :is="Component" :key="viewRoute.path" />
      </RouterView>
    </main>
    <div id="route-announcer" class="sr-only" role="status" aria-live="polite">{{ routeAnnouncement }}</div>
    <ToastStack :toasts="toasts" @dismiss="dismissToast"/>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from 'vue-router';
import { api } from "@/api";
import { clearCache, syncCacheOwner } from "@/cache";
import { connectRealtime } from "@/events";
import ToastStack from "@/components/ui/ToastStack.vue";
import AppNav from "@/components/layout/AppNav.vue";
import CommandPalette from "@/components/layout/CommandPalette.vue";
import { playbackStartsFromEvent, playbackTitle } from "@/playbackToast";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useVisualViewport } from "@/composables/useVisualViewport";
import { reportClientCapabilities } from "@/clientCapabilities";
import { canModerateSession, isAdminSession, loadSession } from "@/composables/useSession";
const session=ref<any>(null);
const palette=ref<{open:()=>void}|null>(null);
useVisualViewport();
const route=useRoute();
const isAdmin=computed(()=>isAdminSession(session.value));
const canModerate=computed(()=>canModerateSession(session.value));
// Le seuil unique du shell : au-dela, la navigation est un rail ; en deca, une barre.
const isWide=useMediaQuery('(min-width: 768px)');
const toasts=ref<any[]>([]);
const seenPlaybackEvents=new Set<string>();
const toastTimers=new Map<string, ReturnType<typeof setTimeout>>();
function dismissToast(id: string | number): void {toasts.value=toasts.value.filter(toast=>toast.id!==id);clearTimeout(toastTimers.get(String(id)));toastTimers.delete(String(id))}
function showPlaybackToasts(event: any): void {
  const started=playbackStartsFromEvent(event);
  for(const session of started){
    const fingerprint=`${event.detail.id||''}:${session.session_id||session.id||playbackTitle(session)}`;
    if(seenPlaybackEvents.has(fingerprint))continue;
    seenPlaybackEvents.add(fingerprint);
    const id=`playback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toasts.value=[...toasts.value.slice(-3),{id,type:'playback',title:`${session.user_name||'Un utilisateur'} lance une lecture`,message:playbackTitle(session),image:session.thumb_url||''}];
    toastTimers.set(id,setTimeout(()=>dismissToast(id),7000));
  }
}
// Un import complet a remplace toute la base : tout ce que cet onglet affiche, et tout ce
// qu'il a mis en cache, reference des lignes qui n'existent plus. On purge et on recharge
// plutot que de laisser l'utilisateur agir sur des donnees fantomes.
function onMigrationCompleted(): void {clearCache();window.location.reload()}
// Sans ce toast, un nouveau service worker installe restait silencieux : l'utilisateur
// continuait a utiliser une version perimee de l'app sans jamais etre invite a recharger.
function onSwUpdateAvailable(): void {
  if(toasts.value.some(toast=>toast.type==='update'))return;
  toasts.value=[...toasts.value,{id:'sw-update',type:'update',title:'Nouvelle version disponible',message:'Rechargez pour mettre à jour Watchdeck.'}];
}
const routeAnnouncement=ref('');
let isFirstNavigation=true;
watch(()=>route.fullPath,async()=>{
  // La premiere "navigation" est le chargement initial de la page : le focus y est
  // deja au bon endroit et il n'y a rien a annoncer.
  if(isFirstNavigation){isFirstNavigation=false;return}
  await nextTick();
  document.getElementById('main-content')?.focus({preventScroll:true});
  const title=typeof route.meta.title==='string'?route.meta.title:'';
  routeAnnouncement.value=title?`Page ${title} chargée`:'Page chargée';
});
onMounted(async()=>{
  window.addEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.addEventListener('watchdeck:migration.completed',onMigrationCompleted);window.addEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);session.value=await loadSession();syncCacheOwner(session.value);if(session.value){connectRealtime();window.requestAnimationFrame(()=>void reportClientCapabilities())}});
onUnmounted(()=>{window.removeEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.removeEventListener('watchdeck:migration.completed',onMigrationCompleted);window.removeEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);toastTimers.forEach(clearTimeout)});
</script>


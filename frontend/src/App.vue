<template>
  <AppShell :is-admin="isAdmin" :can-moderate="canModerate">
    <RouteErrorBoundary>
      <RouterView v-slot="{ Component }">
        <!-- Vue Router reutilise naturellement une vue quand plusieurs chemins pointent
             vers le meme composant. Ne pas la clef-er par chemin permet notamment a
             /discover de devenir /discover/explore sans detruire le champ de recherche
             apres la premiere lettre. -->
        <component :is="Component" />
      </RouterView>
    </RouteErrorBoundary>
  </AppShell>
  <ToastStack :toasts="allToasts" @dismiss="dismissAnyToast"/>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { clearCache, syncCacheOwner } from "@/cache";
import { connectRealtime } from "@/events";
import ToastStack from "@/components/ui/ToastStack.vue";
import AppShell from "@/components/layout/AppShell.vue";
import RouteErrorBoundary from "@/components/ui/RouteErrorBoundary.vue";
import { playbackStartsFromEvent, playbackTitle } from "@/playbackToast";
import { useVisualViewport } from "@/composables/useVisualViewport";
import { reportClientCapabilities } from "@/clientCapabilities";
import { canModerateSession, isAdminSession, loadSession } from "@/composables/useSession";
import { useToast } from "@/composables/useToast";
const session=ref<any>(null);
useVisualViewport();
const isAdmin=computed(()=>isAdminSession(session.value));
const canModerate=computed(()=>canModerateSession(session.value));
const toasts=ref<any[]>([]);
const seenPlaybackEvents=new Set<string>();
const toastTimers=new Map<string, ReturnType<typeof setTimeout>>();
function dismissToast(id: string | number): void {toasts.value=toasts.value.filter(toast=>toast.id!==id);clearTimeout(toastTimers.get(String(id)));toastTimers.delete(String(id))}
/* Deux sources de notifications cohabitent : celles que cette racine fabrique elle-meme
   (lecture Plex, nouvelle version) et celles que n'importe quel composant declare via
   `useToast`. La pile n'affichait que les premieres, si bien qu'un `addToast` appele
   ailleurs dans l'application ne produisait rien du tout. Les identifiants du store
   partage sont prefixes pour ne jamais entrer en collision avec ceux d'ici. */
const { toasts: sharedToasts, dismissToast: dismissSharedToast } = useToast();
const allToasts=computed(()=>[
  ...toasts.value,
  ...sharedToasts.value.map(toast=>({...toast,id:`shared-${toast.id}`})),
]);
function dismissAnyToast(id: string | number): void {
  const key=String(id);
  if(key.startsWith('shared-')){dismissSharedToast(Number(key.slice(7)));return}
  dismissToast(id);
}
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
onMounted(async()=>{
  window.addEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.addEventListener('watchdeck:migration.completed',onMigrationCompleted);window.addEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);session.value=await loadSession();syncCacheOwner(session.value);if(session.value){connectRealtime();window.requestAnimationFrame(()=>void reportClientCapabilities())}});
onUnmounted(()=>{window.removeEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.removeEventListener('watchdeck:migration.completed',onMigrationCompleted);window.removeEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);toastTimers.forEach(clearTimeout)});
</script>


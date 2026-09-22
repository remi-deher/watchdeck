<template>
  <AppShell :is-admin="isAdmin" :can-moderate="canModerate">
    <RouteErrorBoundary>
      <!-- Quand la fiche d'un media s'ouvre depuis une grille, c'est la page de depart
           qui reste rendue ici : la grille ne disparait pas, elle passe dessous. La
           fiche, elle, est posee par-dessus (voir `MediaOverlay`). Sans adresse de
           depart -- lien colle, favori, actualisation -- `routeDeFond` vaut `null` et
           la fiche s'affiche en pleine page, comme n'importe quelle autre. -->
      <RouterView v-slot="{ Component }" :route="routeDeFond ?? undefined">
        <!-- Vue Router reutilise naturellement une vue quand plusieurs chemins pointent
             vers le meme composant. Ne pas la clef-er par chemin permet notamment a
             /discover de devenir /discover/explore sans detruire le champ de recherche
             apres la premiere lettre.
             Pas de `<Transition>` ici, malgre le `page-shift` qui dort dans
             `_motion.scss` : plusieurs vues -- la fiche media, entre autres -- ont une
             racine multiple, et Vue ne sait pas animer un fragment. Il avertit, puis
             laisse la vue sortante dans le document, qui se superpose a la nouvelle.
             L'arrivee du contenu passe donc par la composition echelonnee de
             `page-motion`, et l'ouverture d'une fiche par la surface ci-dessous. -->
        <component :is="Component" />
      </RouterView>
    </RouteErrorBoundary>
  </AppShell>

  <MediaOverlay :open="surfaceOuverte" @close="fermerSurface">
    <MediaDetailView v-if="surfaceOuverte" :key="$route.fullPath" />
  </MediaOverlay>
  <AppToast />
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { clearCache, syncCacheOwner } from "@/cache";
import { connectRealtime } from "@/events";
import AppShell from "@/components/layout/AppShell.vue";
import MediaOverlay from "@/components/media/MediaOverlay.vue";
import MediaDetailView from "@/views/MediaDetailView.vue";
import AppToast from '@/components/ui/AppToast.vue';
import { useMediaOverlay } from "@/composables/useMediaOverlay";
import RouteErrorBoundary from "@/components/ui/RouteErrorBoundary.vue";
import { playbackStartsFromEvent, playbackTitle } from "@/playbackToast";
import { useVisualViewport } from "@/composables/useVisualViewport";
import { reportClientCapabilities } from "@/clientCapabilities";
import { canModerateSession, isAdminSession, loadSession } from "@/composables/useSession";
import { useToast } from "@/composables/useToast";
/* La fiche media se pose au-dessus de la page d'ou l'on vient plutot que de la
   remplacer -- voir `useMediaOverlay` pour le pourquoi. */
const { actif: surfaceOuverte, routeDeFond, fermer: fermerSurface } = useMediaOverlay();

const session=ref<any>(null);
useVisualViewport();
const isAdmin=computed(()=>isAdminSession(session.value));
const canModerate=computed(()=>canModerateSession(session.value));
const seenPlaybackEvents=new Set<string>();
const { addToast } = useToast();
let swUpdateToastShown=false;
function showPlaybackToasts(event: any): void {
  const started=playbackStartsFromEvent(event);
  for(const session of started){
    const fingerprint=`${event.detail.id||''}:${session.session_id||session.id||playbackTitle(session)}`;
    if(seenPlaybackEvents.has(fingerprint))continue;
    seenPlaybackEvents.add(fingerprint);
    addToast({type:'info',title:`${session.user_name||'Un utilisateur'} lance une lecture`,message:playbackTitle(session),image:session.thumb_url||'',duration:7000});
  }
}
// Un import complet a remplace toute la base : tout ce que cet onglet affiche, et tout ce
// qu'il a mis en cache, reference des lignes qui n'existent plus. On purge et on recharge
// plutot que de laisser l'utilisateur agir sur des donnees fantomes.
function onMigrationCompleted(): void {clearCache();window.location.reload()}
// Sans ce toast, un nouveau service worker installe restait silencieux : l'utilisateur
// continuait a utiliser une version perimee de l'app sans jamais etre invite a recharger.
function onSwUpdateAvailable(): void {
  if(swUpdateToastShown)return;
  swUpdateToastShown=true;
  addToast({type:'info',title:'Nouvelle version disponible',message:'Rechargez pour mettre à jour Watchdeck.',duration:0,action:{label:'Recharger',run:()=>window.location.reload()}});
}
onMounted(async()=>{
  window.addEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.addEventListener('watchdeck:migration.completed',onMigrationCompleted);window.addEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);session.value=await loadSession();syncCacheOwner(session.value);if(session.value){connectRealtime();window.requestAnimationFrame(()=>void reportClientCapabilities())}});
onUnmounted(()=>{window.removeEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.removeEventListener('watchdeck:migration.completed',onMigrationCompleted);window.removeEventListener('watchdeck:sw-update-available',onSwUpdateAvailable)});
</script>


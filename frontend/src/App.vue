<template>
  <!-- Connexion, installation, confidentialite : ni shell, ni session, ni temps reel. -->
  <RouterView v-if="pagePublique" />
  <template v-else>
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
             Le contenu est visible dès le montage ; usePageExit assure le fondu
             de navigation, et la surface ci-dessous anime l'ouverture d'une fiche. -->
        <!-- Page de fond restauree apres un rechargement : ses vues paresseuses ne sont
             pas encore chargees (voir `vuesDeRoutePretes`), on attend qu'elles le soient. -->
        <RouteScope v-if="fondPret" :route="routeDeFond">
          <component :is="Component" />
        </RouteScope>
      </RouterView>
    </RouteErrorBoundary>
  </AppShell>

  <MediaOverlay :open="surfaceOuverte" :aria-label="libelleSurface" @close="fermerSurface" @after-leave="ficheAffichee = null">
    <!-- La fiche reste rendue, figee sur SA route, pendant que la surface s'en va : sans
         cela son contenu disparaissait a l'instant ou l'on fermait, et c'etait une
         surface vide qui glissait -- demontee, de surcroit, dans l'image meme ou
         l'animation devait commencer.
         La surface rend la vue de la route, quelle qu'elle soit : fiche media, session de
         lecture, torrent, utilisateur... Toute route ouverte avec une page de depart
         (voir `ouvrirFiche`) s'y pose ; ouverte directement, elle s'affiche en pleine page. -->
    <RouteScope v-if="ficheAffichee" :route="ficheAffichee.route">
      <RouterView v-slot="{ Component }" :route="ficheAffichee.route">
        <component :is="Component" :key="ficheAffichee.cle" />
      </RouterView>
    </RouteScope>
  </MediaOverlay>
  </template>
  <AppToast />
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRoute, type RouteLocationNormalizedLoaded } from "vue-router";
import { syncCacheOwner } from "@/cache";
import { useQueryClient } from "@tanstack/vue-query";
import { synchroniserProprietaire } from "@/offline/stockage";
import { connectRealtime } from "@/events";
import AppShell from "@/components/layout/AppShell.vue";
import MediaOverlay from "@/components/media/MediaOverlay.vue";
import AppToast from '@/components/ui/AppToast.vue';
import { useMediaOverlay, vuesDeRoutePretes } from "@/composables/useMediaOverlay";
import RouteErrorBoundary from "@/components/ui/RouteErrorBoundary.vue";
import RouteScope from "@/components/layout/RouteScope.vue";
import { playbackStartsFromEvent, playbackTitle } from "@/playbackToast";
import { useVisualViewport } from "@/composables/useVisualViewport";
import { reportClientCapabilities } from "@/clientCapabilities";
import { canModerateSession, isAdminSession, loadSession } from "@/composables/useSession";
import { useToast } from "@/composables/useToast";
/* La fiche media se pose au-dessus de la page d'ou l'on vient plutot que de la
   remplacer -- voir `useMediaOverlay` pour le pourquoi. */
const { actif: surfaceOuverte, routeDeFond, fermer: fermerSurface } = useMediaOverlay();
const fondPret = computed(() => vuesDeRoutePretes(routeDeFond.value));
const routeCourante = useRoute();
/* Nom de la surface pour les lecteurs d'ecran : le titre de la route (« Média »,
   « Session de lecture »...). */
const libelleSurface = computed(() => String(ficheAffichee.value?.route.meta?.title || 'Détail'));
const ficheAffichee = shallowRef<{ route: RouteLocationNormalizedLoaded; cle: string } | null>(null);
/* Cle de la fiche : son adresse, de sorte que passer d'une fiche a une autre la remonte
   a neuf. Exception, les lectures consecutives d'une session : on passe de l'une a l'autre
   depuis le bas de la fiche, et la remonter la vidait le temps du chargement, donc la
   fenetre revenait tout en haut. Elle garde son instance, et sa place. */
const CHEMIN_SESSION = '/activity/session/:sessionId';
const cleDeFiche = (route: RouteLocationNormalizedLoaded) =>
  route.matched[route.matched.length - 1]?.path === CHEMIN_SESSION ? CHEMIN_SESSION : route.fullPath;
watch(
  () => [surfaceOuverte.value, cleDeFiche(routeCourante), routeCourante.fullPath] as const,
  ([ouverte, cle]) => {
    // Tant que la surface est ouverte, elle suit la route (passage d'une fiche a l'autre) ;
    // a la fermeture, on garde la derniere fiche jusqu'a la fin de la sortie.
    if (ouverte) ficheAffichee.value = { route: { ...routeCourante } as RouteLocationNormalizedLoaded, cle };
  },
  { immediate: true },
);

/* Avant la premiere navigation, la route n'est pas encore resolue : on se fie a l'adresse
   de chargement. Les pages publiques sont toujours ouvertes par un chargement complet
   (le serveur les aiguille), et les quitter recharge la page. */
const PUBLIC_PATHS = new Set(['/login', '/setup', '/privacy']);
const chargementPublic = PUBLIC_PATHS.has(window.location.pathname.replace(/\/+$/, '') || '/');
const pagePublique = computed(() => (routeCourante.matched.length ? routeCourante.meta.public === true : chargementPublic));

const queryClient = useQueryClient();
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
// Sans ce toast, un nouveau service worker installe restait silencieux : l'utilisateur
// continuait a utiliser une version perimee de l'app sans jamais etre invite a recharger.
function onSwUpdateAvailable(): void {
  if(swUpdateToastShown)return;
  swUpdateToastShown=true;
  addToast({type:'info',title:'Nouvelle version disponible',message:'Rechargez pour mettre à jour Watchdeck.',duration:0,action:{label:'Recharger',run:()=>window.location.reload()}});
}
onMounted(async()=>{
  if(chargementPublic)return;
  window.addEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.addEventListener('watchdeck:sw-update-available',onSwUpdateAvailable);session.value=await loadSession();syncCacheOwner(session.value);void synchroniserProprietaire(queryClient,session.value);if(session.value){connectRealtime();window.requestAnimationFrame(()=>void reportClientCapabilities())}});
onUnmounted(()=>{window.removeEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.removeEventListener('watchdeck:sw-update-available',onSwUpdateAvailable)});
</script>


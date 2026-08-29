<template>
  <a href="#main-content" class="skip-link">Aller au contenu principal</a>
  <div class="shell" :class="{'sidebar-collapsed':collapsed,'discover-shell':Boolean(activeSpace)&&activeSpace?.slug!=='library'}">
    <!-- Espace à arbre dynamique (Téléchargements, Paramètres) : sa propre sidebar. -->
    <component
      :is="activeSpace.component"
      v-if="activeSpace?.component"
      :collapsed="collapsed"
      @toggle="toggleSidebar"
    />
    <!-- Espace déclaratif : SpaceSidebar rend les trois surfaces depuis spaces.js. -->
    <SpaceSidebar
      v-else-if="activeSpace"
      :slug="activeSpace.slug"
      :ariaLabel="activeSpace.ariaLabel || 'Navigation'"
      :brand-icon="activeSpace.brandIcon"
      :nav="activeSpace.nav"
      :app-link-to="activeSpace.appLinkTo"
      :show-app-link="!activeSpace.adminOnlyAppLink || isAdmin"
      :mobile-menu-title="activeSpace.mobileMenuTitle || 'Menu'"
      :is-admin="activeSpace.slug === 'library' ? canModerate : isAdmin"
      :collapsed="collapsed"
      @toggle="toggleSidebar"
    />
    <template v-else>
    <!-- Desktop Sidebar -->
    <aside class="sidebar desktop-only" :class="{collapsed}" aria-label="Navigation principale" :aria-expanded="!collapsed">
      <div class="brand">
        <span class="brand-name">Watchdeck</span>
        <button class="sidebar-toggle" type="button" :aria-label="collapsed ? 'Afficher le menu' : 'Réduire le menu'" :title="collapsed ? 'Afficher le menu' : 'Réduire le menu'" @click="toggleSidebar">
          <PanelLeftOpen v-if="collapsed"/><PanelLeftClose v-else/>
        </button>
      </div>
      
      <div class="menu-section">
        <span class="menu-label">Principal</span>
        <RouterLink v-if="isAdmin" to="/dashboard" title="Dashboard"><Gauge />Dashboard</RouterLink>
        <RouterLink to="/discover" title="Decouvrir"><Compass />Decouvrir</RouterLink>
        <RouterLink v-if="canModerate" :to="libraryHomeTarget" title="Bibliotheque"><Library />Bibliotheque</RouterLink>
        <RouterLink to="/calendar" title="Calendrier"><CalendarDays />Calendrier</RouterLink>
        <RouterLink v-if="isAdmin" to="/downloads" title="Telechargements"><Download />Telechargements</RouterLink>
        <RouterLink v-if="isAdmin" to="/activity" title="Activité &amp; Insights"><Activity />Activité &amp; Insights</RouterLink>
        <RouterLink v-if="isAdmin" to="/users" title="Administration"><Wrench />Administration</RouterLink>
        <RouterLink v-if="canModerate && !isAdmin" to="/issues" title="Problèmes signalés"><MessageSquareWarning />Problèmes signalés</RouterLink>
      </div>

      <div class="menu-section mt-auto">
        <span class="menu-label">Compte</span>
        <RouterLink to="/profile" title="Profil"><UserRound />Profil</RouterLink>
        <a href="/privacy" title="Confidentialite"><ShieldCheck />Confidentialite</a>
        <a href="/logout" title="Deconnexion" @click="clearCache"><LogOut />Deconnexion</a>
      </div>
    </aside>

    <!-- Mobile Navigation Bar -->
    <nav class="mobile-nav-bar mobile-only" aria-label="Navigation principale">
      <RouterLink v-if="isAdmin" to="/dashboard" @click="closeMoreMenu"><Gauge /><span>Dashboard</span></RouterLink>
      <RouterLink to="/discover" @click="closeMoreMenu"><Compass /><span>Decouvrir</span></RouterLink>
      <RouterLink v-if="canModerate" :to="libraryHomeTarget" @click="closeMoreMenu"><Library /><span>Bibliotheque</span></RouterLink>
      <RouterLink to="/calendar" @click="closeMoreMenu"><CalendarDays /><span>Calendrier</span></RouterLink>
      <button type="button" class="more-nav-btn" :class="{ active: isMoreOpen }" aria-label="Ouvrir le menu principal" aria-controls="mobile-more-menu" :aria-expanded="isMoreOpen" @click="toggleMoreMenu">
        <Menu />
        <span>Plus</span>
      </button>
    </nav>

    <!-- Mobile More Menu Overlay -->
    <MobileMoreSheet :open="isMoreOpen" sheet-id="mobile-more-menu" title="Menu" @close="closeMoreMenu">
            <div class="menu-section">
              <span class="menu-label">Principal</span>
              <RouterLink v-if="isAdmin" to="/downloads" @click="closeMoreMenu"><Download />Telechargements</RouterLink>
              <RouterLink v-if="isAdmin" to="/activity" @click="closeMoreMenu"><Activity />Activité &amp; Insights</RouterLink>
              <RouterLink v-if="isAdmin" to="/users" @click="closeMoreMenu"><Wrench />Administration</RouterLink>
              <RouterLink v-if="canModerate && !isAdmin" to="/issues" @click="closeMoreMenu"><MessageSquareWarning />Problèmes signalés</RouterLink>
            </div>

            <div class="menu-section">
              <span class="menu-label">Compte</span>
              <RouterLink to="/profile" @click="closeMoreMenu"><UserRound />Profil</RouterLink>
              <a href="/privacy"><ShieldCheck />Confidentialite</a>
              <a href="/logout" @click="clearCache"><LogOut />Deconnexion</a>
            </div>
    </MobileMoreSheet>
    </template>

    <main id="main-content" class="main" tabindex="-1">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <component :is="Component" :key="viewRoute.path" />
      </RouterView>
    </main>
    <ToastStack :toasts="toasts" @dismiss="dismissToast"/>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from 'vue-router';
import { Activity, CalendarDays, Compass, Download, Gauge, Library, LogOut, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserRound, Wrench, Menu } from "@lucide/vue";
import { api } from "@/api";
import { clearCache, syncCacheOwner } from "@/cache";
import { connectRealtime } from "@/events";
import ToastStack from "@/components/ui/ToastStack.vue";
import SpaceSidebar from "@/components/layout/SpaceSidebar.vue";
import MobileMoreSheet from "@/components/layout/MobileMoreSheet.vue";
import { playbackStartsFromEvent, playbackTitle } from "@/playbackToast";
import { useSpaceSidebar } from "@/composables/useSpaceSidebar";
import { useVisualViewport } from "@/composables/useVisualViewport";
import { reportClientCapabilities } from "@/clientCapabilities";
import { canModerateSession, isAdminSession, loadSession } from "@/composables/useSession";
const session=ref<any>(null);
useVisualViewport();
const route=useRoute();
const isAdmin=computed(()=>isAdminSession(session.value));
const canModerate=computed(()=>canModerateSession(session.value));
// L'espace courant, son etat replie et sa bascule viennent tous de spaces.js : la sidebar
// a monter, la cle localStorage et la classe du shell en decoulent (voir useSpaceSidebar).
const {activeSpace,collapsed,toggle:toggleSidebar}=useSpaceSidebar(route);
// Le lien global est affiche lorsque l'utilisateur se trouve hors de l'espace
// Bibliotheque. Il constitue donc une nouvelle entree et doit toujours viser le hub
// Accueil. Les retours navigateur depuis une fiche restent, eux, intacts et conservent
// la grille ainsi que sa position de defilement.
const libraryHomeTarget={path:'/library',query:{hub:'1'}};
const isMoreOpen=ref(false);
const toasts=ref<any[]>([]);
const seenPlaybackEvents=new Set<string>();
const toastTimers=new Map<string, ReturnType<typeof setTimeout>>();
function toggleMoreMenu(): void {isMoreOpen.value=!isMoreOpen.value}
function closeMoreMenu(): void {isMoreOpen.value=false}
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
watch(()=>route.fullPath,closeMoreMenu);
onMounted(async()=>{
  window.addEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.addEventListener('watchdeck:migration.completed',onMigrationCompleted);session.value=await loadSession();syncCacheOwner(session.value);if(session.value){connectRealtime();window.requestAnimationFrame(()=>void reportClientCapabilities())}});
onUnmounted(()=>{window.removeEventListener('watchdeck:activity.updated',showPlaybackToasts as EventListener);window.removeEventListener('watchdeck:migration.completed',onMigrationCompleted);toastTimers.forEach(clearTimeout)});
</script>


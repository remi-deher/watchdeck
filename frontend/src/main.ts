import { createApp } from 'vue';
import { vListMotion } from '@/motion/vListMotion';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { brancherStockage } from '@/offline/stockage';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import { installerSortieDePage } from '@/composables/usePageExit';
import { WatchdeckPreset } from '@/theme/watchdeck';
import { createQueryClient } from '@/queryClient';
import { settingsPinia } from '@/settingsForm';
import App from './App.vue';
// Import statique volontaire : App.vue monte deja la fiche par-dessus la page, elle
// est donc dans le bundle initial et un import() ici ne decouperait rien.
import MediaDetailView from './views/MediaDetailView.vue';
import { isAdminSession, isModeratorSession, loadSession } from './composables/useSession';
import AppPage from '@/components/ui/AppPage.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import FilterSidebar from './components/ui/FilterSidebar.vue';
import StatusBadge from './components/ui/StatusBadge.vue';
import UiFeedback from './components/ui/UiFeedback.vue';
import FormSaveBar from './components/ui/FormSaveBar.vue';
import { registerServiceWorker } from './pwa';
import { recoverFromStaleAssets } from './assetRecovery';
import './styles.scss';

const DashboardView = () => import('./views/DashboardView.vue');
const DiscoverView = () => import('./views/DiscoverView.vue');
const DownloadsView = () => import('./views/DownloadsView.vue');
const ActivityView = () => import('./views/ActivityView.vue');
const LibraryAnalyticsView = () => import('./views/LibraryAnalyticsView.vue');
const LibraryView = () => import('./views/LibraryView.vue');
const VfUpgradesView = () => import('./views/VfUpgradesView.vue');
const CalendarView = () => import('./views/CalendarView.vue');
const UsersView = () => import('./views/UsersView.vue');
const NotificationsView = () => import('./views/NotificationsView.vue');
const SettingsView = () => import('./views/SettingsView.vue');
const ReleaseSearchView = () => import('./views/ReleaseSearchView.vue');
const ProfileView = () => import('./views/ProfileView.vue');
const LogsView = () => import('./views/LogsView.vue');
const IssuesView = () => import('./views/IssuesView.vue');
const PersonDetailView = () => import('./views/PersonDetailView.vue');

registerServiceWorker();

if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event: any) => {
    event.preventDefault();
  // Cet evenement est deja specifique aux chunks Vite : certains navigateurs ne
  // fournissent aucun message, ou seulement « Unable to preload CSS ».
    void recoverFromStaleAssets(event.payload, true);
  });
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/discover' },
  { path: '/dashboard', component: DashboardView, meta: { title: 'Accueil' } },
  { path: '/discover/source/:kind/:id', component: DiscoverView, meta: { title: 'Explorer' } },
  { path: '/discover/shows', component: DiscoverView, meta: { title: 'Séries' } },
  { path: '/discover/movies', component: DiscoverView, meta: { title: 'Films' } },
  { path: '/discover/explore', component: DiscoverView, meta: { title: 'Explorer' } },
  { path: '/discover/requests', component: DiscoverView, meta: { title: 'Mes demandes' } },
  { path: '/discover/calendar', redirect: '/calendar' },
  { path: '/discover/media/:kind/:id', component: MediaDetailView, meta: { title: 'Média' } },
  { path: '/discover/person/:id', component: PersonDetailView, meta: { title: 'Personne' } },
  { path: '/discover', component: DiscoverView, meta: { title: 'Explorer' } },
  { path: '/downloads', component: DownloadsView, meta: { title: 'Acquisition' } },
  { path: '/activity', component: ActivityView, meta: { title: 'Activité & Insights' } },
  { path: '/analytics', component: LibraryAnalyticsView, meta: { title: 'Analytique bibliothèque' } },
  { path: '/requests', redirect: (to) => ({ path: '/library', query: to.query }) },
  { path: '/library', component: LibraryView, meta: { title: 'Bibliothèque' } },
  { path: '/vf-upgrades', component: VfUpgradesView, meta: { title: 'Améliorations VF' } },
  { path: '/issues', component: IssuesView, meta: { title: 'Problèmes signalés' } },
  { path: '/calendar', component: CalendarView, meta: { title: 'Calendrier' } },
  { path: '/users', component: UsersView, meta: { title: 'Administration' } },
  { path: '/users/:userId', component: UsersView, meta: { title: 'Administration' } },
  { path: '/notifications', component: NotificationsView, meta: { title: 'Notifications' } },
  { path: '/logs', component: LogsView, meta: { title: 'Journaux' } },
  // Un chemin par section : partageable, marquable en favori, et coherent avec le reste
  // de l'application. Le parametre `?tab=` reste accepte et redirige (voir SettingsView).
  { path: '/settings', component: SettingsView, meta: { title: 'Configuration' } },
  { path: '/settings/services/:section?', component: SettingsView, meta: { title: 'Services' } },
  { path: '/settings/automation/:section?', component: SettingsView, meta: { title: 'Automatisation' } },
  { path: '/settings/operations/:section?', component: SettingsView, meta: { title: 'Exploitation' } },
  { path: '/settings/notifications/:section?', component: SettingsView, meta: { title: 'Notifications' } },
  { path: '/settings/system/:section?', component: SettingsView, meta: { title: 'Système' } },
  { path: '/maintenance', redirect: '/settings/automation/scheduled-tasks' },
  { path: '/profile', component: ProfileView, meta: { title: 'Profil' } },
  { path: '/releases/:requestId', component: ReleaseSearchView, meta: { title: 'Recherche de version' } },
  { path: '/library/media/:kind/:id', component: MediaDetailView, meta: { title: 'Média' } },
  { path: '/media/:kind/:id', component: MediaDetailView, meta: { title: 'Média' } },
  { path: '/:pathMatch(.*)*', redirect: '/discover' },
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    /* Rester sur place quand seule la requete change : ces navigations-la sont des
       `router.replace` emis par la page elle-meme pour refleter ses filtres dans l'URL,
       pas un changement de page. Les renvoyer en haut arrachait l'utilisateur a
       l'endroit qu'il etait en train de lire. */
    if (to.path === from.path) return false;
    /* Une fiche posee par-dessus une page ne deplace pas cette page : la renvoyer en haut
       faisait sauter la grille visible sous le fond assombri, et la fermeture devait
       ensuite la faire redescendre. */
    if ((history.state as Record<string, unknown> | null)?.__overlayBackground) return false;
    return { top: 0 };
  },
});

if (import.meta.env.PROD) {
  router.onError((error) => { void recoverFromStaleAssets(error); });
}

/* Le passage d'une destination a l'autre s'accompagne d'une sortie breve : sans elle,
   l'ancien ecran disparaissait et le nouveau etait simplement la. Voir `usePageExit`
   pour la raison qui interdit une `<Transition>` autour du `<RouterView>`. */
installerSortieDePage(router);

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · Watchdeck` : 'Watchdeck';
});

const PLAIN_USER_ALLOWED_PREFIXES = ['/discover', '/calendar', '/profile', '/media', '/releases'];
router.beforeEach(async (to) => {
  const session = await loadSession();
  const originalPath = to.redirectedFrom?.path ?? to.path;
  if (originalPath === '/') {
    const landing = isAdminSession(session) ? '/dashboard' : '/discover';
    if (to.path !== landing) return landing;
    return true;
  }
  if (to.path.startsWith('/media/') && to.params.kind && to.params.id) {
    const isMod = isAdminSession(session) || isModeratorSession(session);
    const targetBase = isMod && to.params.kind !== 'discover' ? '/library/media' : '/discover/media';
    const qs = to.fullPath.includes('?') ? '?' + to.fullPath.split('?')[1] : '';
    return `${targetBase}/${to.params.kind}/${to.params.id}${qs}`;
  }
  if (session && !isAdminSession(session) && !isModeratorSession(session)) {
    if (!PLAIN_USER_ALLOWED_PREFIXES.some((prefix) => to.path.startsWith(prefix))) return '/discover';
  }
  return true;
});

createApp(App)
  .directive('list-motion', vListMotion)
  .component('AppPage', AppPage)
  .component('AppSubnav', AppSubnav)
  .component('FilterSidebar', FilterSidebar)
  .component('StatusBadge', StatusBadge)
  .component('UiFeedback', UiFeedback)
  .component('FormSaveBar', FormSaveBar)
  .use(settingsPinia)
  .use(VueQueryPlugin, { queryClient: createQueryClient(), clientPersister: brancherStockage })
  .use(PrimeVue, {
    ripple: false,
    theme: {
      preset: WatchdeckPreset,
      options: {
        darkModeSelector: ':root',
        cssLayer: false,
      },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .use(router)
  .mount('#app');

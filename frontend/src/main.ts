import { createApp } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import App from './App.vue';
import { isAdminSession, isModeratorSession, loadSession } from './composables/useSession';
import PageHeader from './components/ui/PageHeader.vue';
import PageShell from './components/ui/PageShell.vue';
import PageSearchHeader from './components/ui/PageSearchHeader.vue';
import FilterSidebar from './components/ui/FilterSidebar.vue';
import StatusBadge from './components/ui/StatusBadge.vue';
import UiFeedback from './components/ui/UiFeedback.vue';
import FilterBar from './components/ui/FilterBar.vue';
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
const MediaDetailView = () => import('./views/MediaDetailView.vue');
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
  { path: '/dashboard', component: DashboardView },
  { path: '/discover/source/:kind/:id', component: DiscoverView },
  { path: '/discover/shows', component: DiscoverView },
  { path: '/discover/movies', component: DiscoverView },
  { path: '/discover/explore', component: DiscoverView },
  { path: '/discover/requests', component: DiscoverView },
  { path: '/discover/calendar', component: CalendarView },
  { path: '/discover/media/:kind/:id', component: MediaDetailView },
  { path: '/discover/person/:id', component: PersonDetailView },
  { path: '/discover', component: DiscoverView },
  { path: '/downloads', component: DownloadsView },
  { path: '/activity', component: ActivityView },
  { path: '/analytics', component: LibraryAnalyticsView },
  { path: '/requests', redirect: (to) => ({ path: '/library', query: to.query }) },
  { path: '/library', component: LibraryView },
  { path: '/vf-upgrades', component: VfUpgradesView },
  { path: '/issues', component: IssuesView },
  { path: '/calendar', component: CalendarView },
  { path: '/users', component: UsersView },
  { path: '/users/:userId', component: UsersView },
  { path: '/notifications', component: NotificationsView },
  { path: '/logs', component: LogsView },
  { path: '/settings', component: SettingsView },
  { path: '/maintenance', redirect: { path: '/settings', query: { tab: 'scheduled-tasks' } } },
  { path: '/profile', component: ProfileView },
  { path: '/releases/:requestId', component: ReleaseSearchView },
  { path: '/library/media/:kind/:id', component: MediaDetailView },
  { path: '/media/:kind/:id', component: MediaDetailView },
  { path: '/:pathMatch(.*)*', redirect: '/discover' },
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 };
  },
});

if (import.meta.env.PROD) {
  router.onError((error) => { void recoverFromStaleAssets(error); });
}

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
  .component('PageHeader', PageHeader)
  .component('PageShell', PageShell)
  .component('PageSearchHeader', PageSearchHeader)
  .component('FilterSidebar', FilterSidebar)
  .component('StatusBadge', StatusBadge)
  .component('UiFeedback', UiFeedback)
  .component('FilterBar', FilterBar)
  .component('FormSaveBar', FormSaveBar)
  .use(router)
  .mount('#app');

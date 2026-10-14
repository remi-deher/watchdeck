<template>
  <!-- Fiche d'un utilisateur : dans la feuille depuis la liste Administration, en pleine page
       par son adresse. Les actions vivent dans l'en-tete (gabarit Fiche), les parties du
       compte en onglets ; la creation passe par le gabarit Creer (voir UsersView). -->
  <SheetPage
    headless
    eyebrow="Administration"
    :title="editing ? displayName(editing) : 'Utilisateur'"
    :loading="!editing && !loadError"
    :error="loadError"
  >
    <DetailTemplate
      v-if="editing"
      :variant="enSurface ? 'sheet' : 'card'"
      eyebrow="Utilisateur"
      :title="displayName(editing)"
      :icon="UserRound"
      :meta="[handle, sourceLabel(resolveSource(editing))].filter(Boolean)"
      :badges="badges"
      :actions="actions"
      :alert="alert"
      :tabs="TABS"
      :tab="tab"
      :facts="facts"
      @update:tab="tab = $event"
      @action="onAction"
    >
      <template v-for="part in TABS" :key="part.key" #[`tab-${part.key}`]>
        <UserEditor
          :ref="(el) => { if (part.key === tab) editorRef = el }"
          :tab="part.key"
          :editing="editing"
          :form="form"
          :users="users"
          :busy="busy"
          :editor-error="editorError"
          :seer-enabled="seerEnabled"
          :seer-mode="seerMode"
          :seer-candidates="seerCandidates"
          @set-password="setPassword"
          @link-seer="linkSeer"
          @save="saveUser"
          @user-action="userAction"
          @unlink-seer="unlinkSeer"
          @merge="mergeUser"
        />
      </template>
    </DetailTemplate>
  </SheetPage>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { queryKeys } from '@/queryKeys';
import { api } from '@/api';
import ConfirmModal from '@/components/ConfirmModal.vue';
import SheetPage from '@/components/layout/SheetPage.vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import { Download, MailCheck, Power, ShieldOff, ShieldCheck, Trash2, UserRound } from '@lucide/vue';
import { accountHandle, resolveSource, roleLabel, sourceLabel } from '@/utils/userLabels';
import { formatDateShort } from '@/utils/format';
import UserEditor from '@/components/users/UserEditor.vue';
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';
import { accountName } from '@/utils/userLabels';

const route = useRoute(), router = useRouter();
const queryClient = useQueryClient();
const { actif: enSurface, fermer } = useMediaOverlay();
const { addToast } = useToast();

const userId = computed(() => String(route.params.userId || ''));

/* La liste sert a la fusion (choisir l'autre compte) : meme lecture, meme cache que la
   page Administration. */
const usersQuery = useQuery({
  queryKey: queryKeys.users.list,
  queryFn: ({ signal }) => api('/api/users', { signal }),
  select: (data) => (Array.isArray(data) ? data : []),
  staleTime: 30_000,
});
const users = computed(() => usersQuery.data.value || []);

const editing = ref(null);
const loadError = ref('');
const busy = ref(false), editorError = ref('');
const seerEnabled = ref(false), seerMode = ref(null), seerCandidates = ref([]);
const editorRef = ref(null);
const TABS = [
  { key: 'profile', label: 'Profil' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'linked', label: 'Comptes liés' },
  { key: 'activity', label: 'Activité' },
  { key: 'diagnostic', label: 'Diagnostic' },
];
const tab = ref('profile');
const actionError = ref('');
const { dialog: confirmDialog, resolveConfirm, runConfirmed, askConfirm } = useConfirmedAction({ busy, error: editorError });

const defaults = { plex_user_id: '', display_name: '', custom_name: '', plex_email: '', notification_email: '', enabled: true, notify_admin: true, notify_on_request: true, notify_on_available: true, notify_digest: false, notify_newsletter: false, notify_vf_movie: true, notify_vf_series: true, discord_webhook_url: '', telegram_chat_id: '', seer_active: null, source: null, role: 'user', can_login: true, auto_approve: false, always_require_approval: false, quota_movie_limit: null, quota_show_limit: null, sonarr_instance_id: null, radarr_instance_id: null, movie_notify_language: null, series_notify_language: null, series_notify_granularity: 'jalons' };
const form = reactive({ ...defaults });

const displayName = (user) => accountName(user || {});
function fillForm(user) { Object.assign(form, defaults, Object.fromEntries(Object.keys(defaults).map(key => [key, user?.[key] ?? defaults[key]]))); }
function notify(message) { addToast({ type: 'success', title: 'Administration', message }); }

/** Relit la liste de la page de fond apres une action. */
async function refreshList() { actionError.value = ''; await queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); }

async function loadUser() {
  editorError.value = ''; loadError.value = '';
  try { editing.value = await api(`/api/users/${userId.value}`); fillForm(editing.value); }
  catch (e) { loadError.value = e.message || 'Cet utilisateur est introuvable.'; }
}
watch(() => route.path, () => { tab.value = 'profile'; void loadUser(); editorRef.value?.resetTab(); }, { immediate: true });

/* Fermer la fiche : dans la feuille, on revient a la liste ; en pleine page, on y va. */
function close() {
  if (enSurface.value) fermer();
  else void router.push('/users');
}

async function saveUser() {
  busy.value = true; editorError.value = '';
  try {
    await api(`/api/users/${editing.value.id}`, { method: 'PUT', body: JSON.stringify(form) });
    await refreshList(); notify('Utilisateur enregistré.');
    await loadUser();
  } catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}
async function setPassword(password) {
  try { await api(`/api/users/${editing.value.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }); notify('Mot de passe modifié.'); }
  catch (e) { editorError.value = e.message; }
}
async function deleteUser() {
  await runConfirmed(async () => { await api(`/api/users/${editing.value.id}`, { method: 'DELETE' }); await refreshList(); close(); },
    { title: `Supprimer « ${displayName(editing.value)} » ?`, message: 'Ses demandes et son historique sont supprimés avec lui. Cette action est définitive.', confirmLabel: 'Supprimer le compte', danger: true }, { reload: false });
}
async function userAction(action) {
  busy.value = true;
  try { await api(`/api/users/${editing.value.id}/${action}`, { method: 'POST' }); await loadUser(); }
  catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}
async function unlinkSeer() { await api(`/api/users/${editing.value.id}/seer-link`, { method: 'DELETE' }); await loadUser(); await loadSeerCandidates(); }

/* Effet immediat, comme l'interrupteur de la liste : couper un compte n'est pas une
   modification de profil qu'on met en brouillon jusqu'a « Enregistrer ». */
async function setEnabled(value) {
  busy.value = true;
  try { await api(`/api/users/${editing.value.id}/enabled`, { method: 'PUT', body: JSON.stringify({ enabled: value }) }); await loadUser(); await refreshList(); }
  catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}

/* Pas d'endpoint unitaire pour `can_login` : celui des actions groupees fait le travail
   et porte deja la validation. */
async function setCanLogin(value) {
  busy.value = true;
  try { await api('/api/users/bulk/permissions', { method: 'PUT', body: JSON.stringify({ user_ids: [editing.value.id], can_login: value }) }); await loadUser(); await refreshList(); }
  catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}

async function linkSeer(seerUserId) {
  busy.value = true;
  try {
    await api(`/api/users/${editing.value.id}/seer-link`, { method: 'PUT', body: JSON.stringify({ seer_user_id: Number(seerUserId) }) });
    notify('Compte Seer rattaché.');
    await loadUser(); await refreshList(); await loadSeerCandidates();
  } catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}

/* Liste des comptes Seer proposables : l'API attend un identifiant numerique, la
   choisir par nom evite de le faire saisir a la main. */
async function loadSeerCandidates() {
  if (!seerEnabled.value) { seerCandidates.value = []; return; }
  try { seerCandidates.value = (await api('/api/seer/users')).seer_users || []; }
  catch { seerCandidates.value = []; }
}
async function testEmail() { const data = await api(`/api/users/${editing.value.id}/test-email`, { method: 'POST' }); notify(`Email envoyé à ${data.recipient}`); }

/* Un compte disparait pour de bon et le sens de la fusion se lit mal : la confirmation
   montre qui est conserve et qui est supprime, avec leurs demandes. */
const requestsLabel = (user) => { const n = user.stats?.total ?? user.request_count ?? 0; return `${n} demande${n > 1 ? 's' : ''}`; };
async function mergeUser({ otherId, keep }) {
  const other = users.value.find(user => String(user.id) === String(otherId));
  if (!other) return;
  const keeper = keep === 'this' ? editing.value : other;
  const removed = keep === 'this' ? other : editing.value;
  const keeperName = displayName(keeper);
  const removedName = displayName(removed);

  // Une seule confirmation, qui montre le sens de la fusion : qui est conservé, qui disparaît.
  const confirmed = await askConfirm({
    title: 'Fusionner deux comptes ?',
    message: 'Les demandes, préférences et historique du compte supprimé sont rattachés au compte conservé. Cette opération est irréversible.',
    confirmLabel: `Fusionner et supprimer « ${removedName} »`,
    danger: true,
    items: [
      { key: 'keep', label: `Conservé : ${keeperName}`, detail: requestsLabel(keeper) },
      { key: 'remove', label: `Supprimé : ${removedName}`, detail: requestsLabel(removed) },
    ],
  });
  if (!confirmed) return;

  busy.value = true;
  try {
    await api(`/api/users/${removed.id}/merge-into/${keeper.id}`, { method: 'POST' });
    notify(`Comptes fusionnés dans « ${keeperName} ».`);
    await refreshList();
    if (keep === 'this') await loadUser(); else close();
  } catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}

/* En-tete de la fiche : l'etat du compte en badges, ses actions (effet immediat) en haut. */
const handle = computed(() => accountHandle(editing.value || {}));
const badges = computed(() => [
  { key: 'role', label: roleLabel(editing.value.role), tone: editing.value.role === 'admin' ? 'success' : editing.value.role === 'moderator' ? 'info' : 'neutral' },
  { key: 'enabled', label: editing.value.enabled ? 'Compte actif' : 'Compte désactivé', tone: editing.value.enabled ? 'success' : 'warning' },
  { key: 'login', label: editing.value.can_login ? 'Connexion autorisée' : 'Connexion bloquée', tone: editing.value.can_login ? 'neutral' : 'danger' },
]);
const alert = computed(() => (!editing.value.enabled
  ? { tone: 'warning', message: 'Ce compte est désactivé : ses demandes sont ignorées.' }
  : !editing.value.can_login ? { tone: 'warning', message: 'La connexion de ce compte est bloquée.' } : null));
const actions = computed(() => [
  { key: 'toggle-enabled', label: editing.value.enabled ? 'Désactiver le compte' : 'Activer le compte', icon: Power, disabled: busy.value },
  { key: 'toggle-login', label: editing.value.can_login ? 'Bloquer la connexion' : 'Autoriser la connexion', icon: editing.value.can_login ? ShieldOff : ShieldCheck, disabled: busy.value },
  { key: 'export', label: 'Exporter les données', icon: Download, href: `/api/users/${editing.value.id}/data-export` },
  { key: 'test-email', label: 'Tester l’email', icon: MailCheck, disabled: busy.value },
  { key: 'delete', label: 'Supprimer', icon: Trash2, danger: true },
]);
const facts = computed(() => [
  { label: 'Demandes', value: String(editing.value.stats?.total ?? 0) },
  { label: 'Dernière demande', value: editing.value.last_requested_at ? formatDateShort(editing.value.last_requested_at) : '—' },
].filter((fact) => fact.value !== undefined));
function onAction(key) {
  if (key === 'toggle-enabled') void setEnabled(!editing.value.enabled);
  else if (key === 'toggle-login') void setCanLogin(!editing.value.can_login);
  else if (key === 'test-email') void testEmail();
  else if (key === 'delete') void deleteUser();
}

/* L'etat de Seer conditionne l'affichage de ses actions. */
async function loadSeerState() {
  try {
    const settings = await api('/api/settings');
    seerEnabled.value = Boolean(settings.seer_enabled);
    seerMode.value = settings.seer_mode || null;
    await loadSeerCandidates();
  } catch {
    seerEnabled.value = false;
  }
}
void loadSeerState();
</script>

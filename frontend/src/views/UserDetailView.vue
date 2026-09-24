<template>
  <!-- Fiche d'un utilisateur (ou creation, sur /users/new) : dans la feuille depuis la liste
       Administration, en pleine page par son adresse. Toutes les actions de la fiche
       vivent ici ; la liste n'a plus qu'a ouvrir la bonne adresse. -->
  <SheetPage
    eyebrow="Administration"
    :title="creating ? 'Nouvel utilisateur' : (editing ? displayName(editing) : 'Utilisateur')"
    :loading="!creating && !editing && !loadError"
    :error="loadError"
  >
    <UserEditor
      v-if="editing"
      ref="editorRef"
      :editing="editing"
      :creating="creating"
      :form="form"
      :users="users"
      :busy="busy"
      :editor-error="editorError"
      :seer-enabled="seerEnabled"
      :seer-mode="seerMode"
      :seer-candidates="seerCandidates"
      @set-enabled="setEnabled"
      @set-can-login="setCanLogin"
      @link-seer="linkSeer"
      @save="saveUser"
      @delete="deleteUser"
      @test-email="testEmail"
      @user-action="userAction"
      @unlink-seer="unlinkSeer"
      @merge="mergeUser"
      @set-password="setPassword"
    />
  </SheetPage>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import ConfirmModal from '@/components/ConfirmModal.vue';
import SheetPage from '@/components/layout/SheetPage.vue';
import UserEditor from '@/components/users/UserEditor.vue';
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { etatDeSurfaceCourant, useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';
import { accountName } from '@/utils/userLabels';

const route = useRoute(), router = useRouter();
const queryClient = useQueryClient();
const { actif: enSurface, fermer } = useMediaOverlay();
const { addToast } = useToast();

const userId = computed(() => String(route.params.userId || ''));
const creating = computed(() => route.path === '/users/new');

/* La liste sert a la fusion (choisir l'autre compte) : meme lecture, meme cache que la
   page Administration. */
const usersQuery = useQuery({
  queryKey: ['users', 'list'],
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
const actionError = ref('');
const { dialog: confirmDialog, resolveConfirm, runConfirmed, askConfirm } = useConfirmedAction({ busy, error: editorError });

const defaults = { plex_user_id: '', display_name: '', custom_name: '', plex_email: '', notification_email: '', enabled: true, notify_admin: true, notify_on_request: true, notify_on_available: true, notify_digest: false, notify_vf_movie: true, notify_vf_series: true, discord_webhook_url: '', telegram_chat_id: '', seer_active: null, source: null, role: 'user', can_login: true, auto_approve: false, sonarr_instance_id: null, radarr_instance_id: null, movie_notify_language: null, series_notify_language: null, series_notify_granularity: 'jalons' };
const form = reactive({ ...defaults });

const displayName = (user) => accountName(user || {});
function fillForm(user) { Object.assign(form, defaults, Object.fromEntries(Object.keys(defaults).map(key => [key, user?.[key] ?? defaults[key]]))); }
function notify(message) { addToast({ type: 'success', title: 'Administration', message }); }

/** Relit la liste de la page de fond apres une action. */
async function refreshList() { actionError.value = ''; await queryClient.invalidateQueries({ queryKey: ['users'] }); }

async function loadUser() {
  editorError.value = ''; loadError.value = '';
  if (creating.value) { editing.value = {}; fillForm(null); editorRef.value?.resetTab(); return; }
  try { editing.value = await api(`/api/users/${userId.value}`); fillForm(editing.value); }
  catch (e) { loadError.value = e.message || 'Cet utilisateur est introuvable.'; }
}
watch(() => route.path, () => { void loadUser(); editorRef.value?.resetTab(); }, { immediate: true });

/* Fermer la fiche : dans la feuille, on revient a la liste ; en pleine page, on y va. */
function close() {
  if (enSurface.value) fermer();
  else void router.push('/users');
}
/* Apres une creation, la fiche devient celle du compte cree -- a sa place dans
   l'historique, sans nouvelle entree. */
function showUser(id) {
  void router.replace({ path: `/users/${id}`, state: etatDeSurfaceCourant() });
}

async function saveUser() {
  busy.value = true; editorError.value = '';
  try {
    const path = creating.value ? '/api/users' : `/api/users/${editing.value.id}`;
    const saved = await api(path, { method: creating.value ? 'POST' : 'PUT', body: JSON.stringify(form) });
    const initialPassword = creating.value ? editorRef.value?.initialPassword : null;
    if (creating.value && form.source === 'local' && initialPassword) {
      await api(`/api/users/${saved.id}/password`, { method: 'POST', body: JSON.stringify({ password: initialPassword }) });
    }
    await refreshList(); notify('Utilisateur enregistré.');
    if (creating.value) showUser(saved.id); else await loadUser();
  } catch (e) { editorError.value = e.message; } finally { busy.value = false; }
}
async function setPassword(password) {
  try { await api(`/api/users/${editing.value.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }); notify('Mot de passe modifié.'); }
  catch (e) { editorError.value = e.message; }
}
async function deleteUser() {
  await runConfirmed(async () => { await api(`/api/users/${editing.value.id}`, { method: 'DELETE' }); await refreshList(); close(); },
    { title: 'Supprimer cet utilisateur ?', message: `${displayName(editing.value)} sera supprimé définitivement.`, confirmLabel: 'Supprimer', danger: true }, { reload: false });
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

/* Deux confirmations, parce qu'un compte disparait pour de bon et que le sens de la
   fusion se lit mal : la premiere nomme qui est supprime, la seconde redemande. */
async function mergeUser({ otherId, keep }) {
  const other = users.value.find(user => String(user.id) === String(otherId));
  if (!other) return;
  const keeper = keep === 'this' ? editing.value : other;
  const removed = keep === 'this' ? other : editing.value;
  const keeperName = displayName(keeper);
  const removedName = displayName(removed);

  const first = await askConfirm({
    title: `Supprimer « ${removedName} » ?`,
    message: `Ses demandes, préférences et historique seront rattachés à « ${keeperName} », puis le compte « ${removedName} » sera supprimé. Cette opération est irréversible.`,
    confirmLabel: 'Continuer',
    danger: true,
  });
  if (!first) return;

  const second = await askConfirm({
    title: 'Confirmer la fusion',
    message: `Dernière vérification : « ${keeperName} » est conservé, « ${removedName} » disparaît définitivement.`,
    confirmLabel: `Fusionner et supprimer « ${removedName} »`,
    danger: true,
  });
  if (!second) return;

  busy.value = true;
  try {
    await api(`/api/users/${removed.id}/merge-into/${keeper.id}`, { method: 'POST' });
    notify(`Comptes fusionnés dans « ${keeperName} ».`);
    await refreshList();
    if (keep === 'this') await loadUser(); else close();
  } catch (e) { editorError.value = e.message; } finally { busy.value = false; }
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

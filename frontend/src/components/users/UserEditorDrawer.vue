<template>
  <DrawerShell wide eyebrow="Administration" :title="creating?'Nouvel utilisateur':displayName(editing)" :error="editorError" @close="$emit('close')">
    <!-- L'etat du compte etait affiche ici en badges inertes, et modifiable ailleurs
         dans le formulaire du Profil : deux representations du meme fait, dont une
         seule agissait. Les deux interrupteurs prennent effet immediatement, comme
         celui de la liste -- un compte qu'on coupe ne se met pas en brouillon. -->
    <section v-if="!creating" class="user-drawer-summary">
      <label class="user-state-toggle" :class="{ on: editing.enabled }">
        <input type="checkbox" :checked="editing.enabled" :disabled="busy" @change="$emit('set-enabled', !editing.enabled)">
        <span class="user-state-dot" :class="{ active: editing.enabled }"></span>
        <span>
          <strong>{{ editing.enabled ? 'Compte actif' : 'Compte désactivé' }}</strong>
          <small>{{ editing.enabled ? 'Ses demandes sont traitées' : 'Ses demandes sont ignorées' }}</small>
        </span>
      </label>

      <label class="user-state-toggle" :class="{ on: editing.can_login }">
        <input type="checkbox" :checked="editing.can_login" :disabled="busy" @change="$emit('set-can-login', !editing.can_login)">
        <span class="user-state-dot" :class="{ active: editing.can_login }"></span>
        <span>
          <strong>{{ editing.can_login ? 'Connexion autorisée' : 'Connexion bloquée' }}</strong>
          <small>{{ editing.can_login ? 'Peut ouvrir une session' : 'Ne peut pas se connecter' }}</small>
        </span>
      </label>

      <span class="user-summary-meta">
        <span class="badge" :class="editing.role==='admin'?'available':editing.role==='moderator'?'sent_to_arr':'pending'">{{ roleLabel(editing.role) }}</span>
        <small>{{ sourceLabel(resolveSource(editing)) }}</small>
      </span>
    </section>
    <AppSubnav variant="tabs" :active="editorTab" @update:active="editorTab = $event" :items="editorTabItems" aria-label="Sections de l’utilisateur" />

    <section v-if="editorTab==='profile'" class="drawer-section form-section">
      <label v-if="creating" class="check local-account-toggle"><input v-model="isLocalAccount" type="checkbox" @change="onLocalAccountToggle"> Compte local (sans Plex)</label>
      <div class="settings-grid two">
        <label>{{ isLocalAccount?"Identifiant de connexion":"ID Plex" }}<input v-model="form.plex_user_id" :disabled="!creating && editing.source!=='local'" :placeholder="isLocalAccount?'ex. jdupont':''"></label>
        <label>Nom affiche<input v-model="form.display_name"></label>
        <label>Nom d'usage<input v-model="form.custom_name"></label>
        <label>Email Plex<input v-model="form.plex_email" type="email"></label>
        <label>Email de notification<input v-model="form.notification_email"></label>
        <label>Role<select v-model="form.role"><option value="user">Utilisateur</option><option value="moderator">Modérateur</option><option value="admin">Administrateur</option></select></label>
        <!-- « Traiter les demandes » et « Autoriser la connexion » vivent desormais en
             haut de la fiche, avec effet immediat : les garder ici en aurait fait des
             champs de formulaire concurrents, portant deja un autre nom pour le meme
             etat (« Compte actif »). -->
        <label class="check"><input v-model="form.auto_approve" type="checkbox"> Auto-approuver ses demandes</label>
      </div>
      <label v-if="creating && isLocalAccount">Mot de passe initial<input v-model="initialPassword" type="password" minlength="8" autocomplete="new-password"></label>
      <div class="actions">
        <UiButton variant="primary" :loading="busy" @click="$emit('save')"><template #icon><Save/></template>Enregistrer</UiButton>
        <UiButton v-if="!creating && editing.id" :href="`/api/users/${editing.id}/data-export`" :download="`watchdeck-donnees-${editing.plex_user_id||editing.id}.json`" title="Exporter les données de cette personne (RGPD, droit d'accès)"><template #icon><Download/></template>Exporter les données</UiButton>
        <UiButton v-if="!creating" variant="danger" @click="$emit('delete')"><template #icon><Trash2/></template>Supprimer</UiButton>
      </div>

      <div v-if="!creating" class="password-section" :class="{muted:Boolean(editing.plex_account_uuid)}">
        <h3><KeyRound/>Mot de passe</h3>
        <p v-if="editing.plex_account_uuid" class="password-hint">Ce compte se connecte via Plex — le mot de passe reste modifiable mais n'est pas la méthode de connexion active.</p>
        <div class="password-row">
          <input v-model="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Nouveau mot de passe">
          <UiButton size="sm" :disabled="newPassword.length<8" :loading="busy" @click="submitPassword"><template #icon><KeyRound/></template>Définir</UiButton>
        </div>
      </div>

      <div v-if="!creating" class="notification-history">
        <div class="panel-head"><h3>Derniers envois</h3><span>{{ editing.notification_history?.length||0 }}</span></div>
        <article v-for="log in (editing.notification_history||[]).slice(0,8)" :key="log.id" class="detail-row"><div><strong>{{ notificationLabel(log) }}</strong><span>{{ log.channel }} · {{ formatDateTime(log.sent_at) }}<template v-if="log.media_title"> · {{ log.media_title }}</template></span><small v-if="log.error_msg" class="error-text">{{ log.error_msg }}</small></div><span class="badge" :class="log.success?'available':'failed'">{{ log.success?'Envoyée':'Échec' }}</span></article>
        <UiEmptyState v-if="!editing.notification_history?.length" title="Aucune notification enregistrée" compact />
      </div>
    </section>

    <section v-else-if="editorTab==='notifications'" class="drawer-section form-section">
      <div class="notif-group">
        <h3><Mail/>Emails</h3>
        <div class="settings-grid two">
          <label class="check"><input v-model="form.notify_on_request" type="checkbox"> Nouvelle demande</label>
          <small class="check-hint">Email envoyé à cette personne quand une de ses demandes est enregistrée.</small>
          <label class="check"><input v-model="form.notify_on_available" type="checkbox"> Disponibilité</label>
          <small class="check-hint">Email envoyé quand un média qu'elle a demandé devient disponible dans Plex.</small>
          <label class="check"><input v-model="form.notify_digest" type="checkbox"> Récapitulatif quotidien (digest)</label>
          <small class="check-hint">Reçoit un résumé une fois par jour au lieu d'un email par événement — nécessite que le digest soit activé globalement (Paramètres → Notifications → Règles).</small>
          <label class="check"><input v-model="form.notify_admin" type="checkbox"> Copier l'administrateur</label>
          <small class="check-hint">Ajoute l'adresse email admin en copie sur les notifications envoyées à cette personne.</small>
        </div>
      </div>

      <div class="notif-group">
        <h3><Languages/>Disponibilité VF</h3>
        <p class="hint">Faut-il notifier cette personne quand un média qu'elle a demandé passe en VF ?</p>
        <div class="settings-grid two">
          <label class="check"><input v-model="form.notify_vf_movie" type="checkbox"> Films</label>
          <label class="check"><input v-model="form.notify_vf_series" type="checkbox"> Séries</label>
          <label>Fréquence pour les séries
            <select v-model="form.series_notify_granularity">
              <option value="minimal">Une seule fois, à la fin</option>
              <option value="jalons">Début et fin de saison</option>
              <option value="tout">Chaque épisode</option>
            </select>
          </label>
        </div>
      </div>

      <div class="notif-group">
        <h3><Send/>Canaux personnels</h3>
        <p class="hint">Optionnel — si renseigné, les notifications push de cette personne partent vers ce webhook/chat personnel plutôt que le canal Discord/Telegram global configuré dans les Paramètres.</p>
        <div class="settings-grid two">
          <label>Webhook Discord personnel<input v-model="form.discord_webhook_url" placeholder="https://discord.com/api/webhooks/..."></label>
          <label>Chat ID Telegram personnel<input v-model="form.telegram_chat_id" placeholder="ex. 123456789"></label>
        </div>
      </div>

      <div class="actions">
        <UiButton variant="primary" :loading="busy" @click="$emit('save')"><template #icon><Save/></template>Enregistrer</UiButton>
        <UiButton v-if="!creating" :disabled="busy" @click="$emit('test-email')" title="Envoie un email de test à l'adresse configurée pour cette personne"><template #icon><MailCheck/></template>Tester l'email</UiButton>
      </div>
    </section>

    <!-- Un seul endroit pour tout ce qui rattache ce compte a un autre : la liaison
         Seer vivait sous un onglet « Seer », la fusion aussi -- alors que reunir deux
         comptes Watchdeck n'a rien a voir avec Seer. -->
    <section v-else-if="editorTab==='linked'" class="drawer-section linked-accounts">
      <dl class="user-identity-facts">
        <div><dt>Origine du compte</dt><dd>{{ sourceLabel(resolveSource(editing)) }}</dd></div>
        <div v-if="editing.display_name"><dt>Pseudo d’origine</dt><dd>{{ editing.display_name }}</dd></div>
        <div><dt>Identifiant technique</dt><dd><code>{{ editing.plex_user_id || '—' }}</code></dd></div>
      </dl>

      <!-- ---------- Compte Seer ---------- -->
      <template v-if="seerEnabled">
        <div class="panel-head"><h3>Compte Seer</h3><span class="badge">{{ seerLinkLabel(editing) }}</span></div>
        <p class="drawer-hint">{{ seerModeHint }}</p>

        <template v-if="editing.seer_user_id">
          <div class="actions">
            <button class="secondary" @click="$emit('user-action','seer-complete')"><RefreshCw/>Compléter depuis Seer</button>
            <button class="secondary danger" @click="$emit('unlink-seer')"><Unlink/>Dissocier</button>
          </div>
        </template>
        <template v-else>
          <!-- Le choix se fait par nom. L'API attend un identifiant numerique : le faire
               saisir a la main etait le seul recours offert jusqu'ici. -->
          <label>Compte Seer correspondant
            <select v-model="seerTarget" :disabled="!seerCandidates.length">
              <option value="">{{ seerCandidates.length ? 'Choisir un compte Seer…' : 'Aucun compte Seer disponible' }}</option>
              <option v-for="candidate in seerCandidates" :key="candidate.id" :value="candidate.id" :disabled="candidate.linked">
                {{ seerCandidateLabel(candidate) }}
              </option>
            </select>
          </label>
          <div class="actions">
            <button class="secondary" :disabled="!seerTarget" @click="$emit('link-seer', seerTarget)"><Link/>Lier ce compte Seer</button>
            <button class="secondary" @click="$emit('user-action','seer-automatch')"><RefreshCw/>Chercher automatiquement</button>
          </div>
        </template>
      </template>

      <!-- ---------- Fusion ---------- -->
      <div class="panel-head danger-head"><h3>Fusionner avec un autre compte</h3></div>
      <p class="drawer-hint">
        Une même personne existe parfois en plusieurs comptes — un compte Plex et un compte
        Seer, ou une entrée créée par le flux RSS. La fusion réunit demandes, préférences et
        historique sur un seul compte&nbsp;; <strong>l’autre est supprimé définitivement</strong>.
      </p>

      <label>Autre compte
        <select v-model="mergeTarget">
          <option value="">Choisir un compte…</option>
          <option v-for="user in mergeCandidates" :key="user.id" :value="user.id">{{ mergeCandidateLabel(user) }}</option>
        </select>
      </label>

      <!-- On peut aussi designer l'autre compte par son identifiant Plex : c'est ainsi
           qu'on retrouve l'entree creee par le flux RSS pour une personne deja connue. -->
      <label>ou par identifiant Plex
        <input v-model="mergeByPlexId" placeholder="ex. 86dd231816e161be" spellcheck="false">
      </label>
      <p v-if="mergeByPlexId && !plexIdMatch" class="drawer-hint warn">Aucun compte ne porte cet identifiant.</p>
      <p v-else-if="plexIdMatch" class="drawer-hint">Correspond à <strong>{{ displayName(plexIdMatch) }}</strong>.</p>

      <!-- Les deux sens sont montres cote a cote, avec leur consequence : « Fusionner cet
           utilisateur dans X » ne disait pas lequel des deux disparaissait. -->
      <fieldset v-if="resolvedMergeTarget" class="merge-direction">
        <legend>Quel compte conserver&nbsp;?</legend>
        <label class="merge-choice" :class="{ selected: mergeKeep === 'this' }">
          <input v-model="mergeKeep" type="radio" value="this">
          <span>
            <strong>Conserver {{ displayName(editing) }}</strong>
            <small>Les demandes de {{ displayName(resolvedMergeTarget) }} sont rattachées ici, puis ce compte-là est supprimé.</small>
          </span>
        </label>
        <label class="merge-choice" :class="{ selected: mergeKeep === 'other' }">
          <input v-model="mergeKeep" type="radio" value="other">
          <span>
            <strong>Conserver {{ displayName(resolvedMergeTarget) }}</strong>
            <small>Les demandes de {{ displayName(editing) }} y sont rattachées, puis <em>ce</em> compte est supprimé et la fiche se ferme.</small>
          </span>
        </label>
      </fieldset>

      <button
        class="secondary danger"
        :disabled="!resolvedMergeTarget || !mergeKeep"
        @click="$emit('merge', { otherId: resolvedMergeTarget.id, keep: mergeKeep })"
      ><Merge/>Fusionner les deux comptes</button>
    </section>

    <section v-else-if="editorTab==='activity'" class="drawer-section">
      <section class="metric-grid compact-metrics">
        <MetricCard v-for="(value,key) in editing.stats||{}" :key="key" :label="String(key)" :value="value??'-'"/>
      </section>
      <div class="user-activity-timeline"><article v-for="event in activityTimeline" :key="event.key" :class="['activity-event',event.type]"><span class="activity-marker"></span><div><strong>{{ event.title }}</strong><span>{{ event.label }}</span><small>{{ formatDateTime(event.date) }}</small></div><span v-if="event.status" class="badge" :class="event.type==='notification_failed'?'failed':'pending'">{{ event.status }}</span></article></div>
      <UiEmptyState v-if="!editing.activity?.recent?.length" title="Aucune activité récente" compact />
    </section>

    <section v-else class="drawer-section">
      <article v-for="effect in editing.diagnostic?.effects||[]" :key="effect.key" class="detail-row">
        <div><strong>{{ effect.label }}</strong><span>{{ effect.detail }}</span></div>
        <span class="badge" :class="effect.ok?'available':'failed'">{{ effect.ok?'OK':'Attention' }}</span>
      </article>
      <UiEmptyState v-if="!editing.diagnostic" title="Aucun diagnostic disponible" compact />
    </section>
  </DrawerShell>
</template>

<script setup lang="ts">
import MetricCard from '@/components/ui/MetricCard.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { accountName, resolveSource, roleLabel, seerLinkLabel, sourceLabel } from '@/utils/userLabels';
import { Download, KeyRound, Languages, Link, Mail, MailCheck, Merge, RefreshCw, Save, Send, Trash2, Unlink } from '@lucide/vue';
import DrawerShell from '@/components/DrawerShell.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

const props = withDefaults(
  defineProps<{
    editing: Record<string, any>;
    creating?: boolean;
    form: Record<string, any>;
    users?: any[];
    busy?: boolean;
    editorError?: string;
    seerEnabled?: boolean;
    seerMode?: string | null;
    seerCandidates?: any[];
  }>(),
  {
    creating: false,
    users: () => [],
    busy: false,
    editorError: '',
    seerEnabled: false,
    seerMode: null,
    seerCandidates: () => [],
  }
);
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save'): void;
  (e: 'delete'): void;
  (e: 'test-email'): void;
  (e: 'user-action', action: string): void;
  (e: 'unlink-seer'): void;
  (e: 'link-seer', seerUserId: number | string): void;
  (e: 'set-enabled', value: boolean): void;
  (e: 'set-can-login', value: boolean): void;
  (e: 'merge', payload: { otherId: number | string; keep: string }): void;
  (e: 'set-password', password: string): void;
}>();

/* L'onglet Seer disparait quand Seer est desactive : il n'offrait que des actions
   vouees a l'echec. */
/* « Comptes liés » reunit tout ce qui rattache ce compte a un autre. Il reste visible
   meme Seer desactive : la fusion, elle, n'a jamais dependu de Seer. */
const editorTabs = computed(() => ['profile', 'notifications', 'linked', 'activity', 'diagnostic']);
const editorTabItems = computed(() => editorTabs.value.map((key: string) => ({ key, label: editorLabel(key) })));
const editorTab = ref('profile');
const mergeTarget = ref('');
const mergeByPlexId = ref('');
const mergeKeep = ref('');
const seerTarget = ref('');

/* Le compte « autre » peut etre designe de deux manieres : par son nom, ou par son
   identifiant Plex -- c'est ainsi qu'on retrouve l'entree creee par le flux RSS. */
const mergeCandidates = computed(() => props.users.filter((user: any) => user.id !== props.editing.id));
const plexIdMatch = computed(() => {
  const needle = mergeByPlexId.value.trim().toLowerCase();
  if (!needle) return null;
  return mergeCandidates.value.find((user: any) => (user.plex_user_id || '').toLowerCase() === needle) || null;
});
const resolvedMergeTarget = computed(
  () => plexIdMatch.value || mergeCandidates.value.find((user: any) => String(user.id) === String(mergeTarget.value)) || null
);

function mergeCandidateLabel(user: any): string {
  const origin = sourceLabel(resolveSource(user));
  return `${displayName(user)} — ${origin}`;
}
function seerCandidateLabel(candidate: any): string {
  const name = candidate.display_name || candidate.plex_username || candidate.email;
  if (candidate.linked) return `${name} — déjà rattaché`;
  return candidate.email && candidate.email !== name ? `${name} (${candidate.email})` : name;
}
const isLocalAccount = ref(false);
const initialPassword = ref('');
const newPassword = ref('');

function onLocalAccountToggle(): void {
  props.form.source = isLocalAccount.value ? 'local' : null;
}
// Le formulaire est repeuple par fillForm() du parent a chaque ouverture (creation ou
// edition) : on aligne la case a cocher sur la source deja chargee plutot que de la
// piloter uniquement via le toggle (sinon ouvrir un compte local existant l'affiche
// decochee).
watch(() => props.form.source, value => { isLocalAccount.value = value === 'local'; }, { immediate: true });

function submitPassword(): void {
  emit('set-password', newPassword.value);
  newPassword.value = '';
}

const displayName = (user: any) => accountName(user || {});
/* Meme vocabulaire que les Reglages : en mode observateur, Seer est lu, pas pilote. */
const seerModeHint = computed(() => props.seerMode === 'actor'
  ? 'Seer traite aussi les demandes de ce compte.'
  : 'Seer est consulté en lecture seule : ce compte n’y est jamais modifié.');
function editorLabel(value: string): string {
  return ({
    profile: 'Profil',
    notifications: 'Notifications',
    linked: 'Comptes liés',
    activity: 'Activité',
    diagnostic: 'Diagnostic',
  } as Record<string, string>)[value];
}
function notificationLabel(log: any): string {return ({request:'Demande enregistrée',available:'Média disponible',vf_available:'VF disponible'} as Record<string, string>)[log.event]||String(log.event||'Notification').replaceAll('_',' ')}
const activityTimeline=computed(()=>{
  const requests=(props.editing.activity?.recent||[]).map((row: any)=>({key:`request-${row.id}`,type:'request',date:row.requested_at,title:row.title,label:`Demande ${row.role==='co_requester'?'partagée':'principale'} · ${row.source}`,status:row.status}));
  const available=(props.editing.activity?.recent||[]).filter((row: any)=>row.available_at).map((row: any)=>({key:`available-${row.id}`,type:'available',date:row.available_at,title:row.title,label:'Média devenu disponible',status:'Disponible'}));
  const notifications=(props.editing.notification_history||[]).map((log: any)=>({key:`notification-${log.id}`,type:log.success?'notification':'notification_failed',date:log.sent_at,title:log.media_title||notificationLabel(log),label:`${notificationLabel(log)} · ${log.channel}`,status:log.success?'Envoyée':'Échec'}));
  return [...requests,...available,...notifications].filter(event=>event.date).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,20)
});

defineExpose({
  resetTab: () => {
    editorTab.value = 'profile';
    mergeTarget.value = '';
    mergeByPlexId.value = '';
    mergeKeep.value = '';
    seerTarget.value = '';
    newPassword.value = '';
    initialPassword.value = '';
  },
  initialPassword,
});
</script>
<style scoped lang="scss">
.user-drawer-summary{display:flex;align-items:center;gap: var(--space-2);padding:11px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.user-drawer-summary>div{display:flex;align-items:center;gap: var(--space-2);margin-right:auto}.user-drawer-summary>div>div{display:grid;gap: var(--space-1)}.user-drawer-summary small{color:var(--muted);font-size:var(--fs-xs)}.user-state-dot{width:9px;height:9px;border-radius:50%;background:var(--muted)}.user-state-dot.active{background:var(--success)}.notification-history{display:grid;gap: var(--space-2);margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}.notification-history h3{margin:0;font-size:var(--fs-md)}.notification-history small{display:block;margin-top:3px}.user-activity-timeline{display:grid}.activity-event{position:relative;display:grid;grid-template-columns:14px 1fr auto;gap: var(--space-2);padding-bottom:15px}.activity-event::before{content:'';position:absolute;top:12px;bottom:0;left:5px;width:2px;background:var(--border)}.activity-event:last-child::before{display:none}.activity-marker{position:relative;z-index:1;width:12px;height:12px;margin-top:3px;border:2px solid var(--accent);border-radius:50%;background:var(--surface)}.activity-event.available .activity-marker,.activity-event.notification .activity-marker{border-color:var(--success)}.activity-event.notification_failed .activity-marker{border-color:var(--danger)}.activity-event>div{display:grid;gap: var(--space-1)}.activity-event span,.activity-event small{color:var(--muted);font-size:var(--fs-xs)}.activity-event strong{font-size:var(--fs-sm)}@media(max-width:520px){.user-drawer-summary{align-items:flex-start;flex-wrap:wrap}.user-drawer-summary>div{width:100%}.activity-event{grid-template-columns:14px 1fr}.activity-event>.badge{grid-column:2;justify-self:start}}
.local-account-toggle{margin-bottom:14px}
.password-section{display:grid;gap: var(--space-2);margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
.password-section h3{display:flex;align-items:center;gap: var(--space-2);margin:0;font-size:var(--fs-md)}
.password-section h3 svg{width:16px;height:16px}
.password-hint{margin:0;color:var(--muted);font-size:var(--fs-xs)}
.password-row{display:flex;gap: var(--space-2)}
.password-row input{flex:1;min-width:0}
.password-section.muted{opacity:.62}
.notif-group{display:grid;gap: var(--space-2)}
.notif-group h3{display:flex;align-items:center;gap: var(--space-2);margin:0;font-size:var(--fs-md)}
.notif-group h3 svg{width:16px;height:16px}
.notif-group .hint{margin:0;color:var(--muted);font-size:var(--fs-xs)}
</style>

<template>
  <div class="user-editor">
    <!-- Role et origine rejoignent la ligne du nom : ils identifient le compte, ils ne
         se pilotent pas. Les deux interrupteurs, eux, prennent leur propre rangee --
         melanges aux badges, ils formaient une bande ou l'on ne savait plus ce qui etait
         cliquable. -->
    <span v-if="!creating" class="user-head-meta">
      <span class="badge" :class="editing.role==='admin'?'available':editing.role==='moderator'?'sent_to_arr':'pending'">{{ roleLabel(editing.role) }}</span>
      <small>{{ sourceLabel(resolveSource(editing)) }}</small>
    </span>
    <UiFeedback v-if="editorError" type="error" :message="editorError" />

    <!-- Effet immediat, comme l'interrupteur de la liste : couper un compte n'est pas
         une modification de profil qu'on met en brouillon jusqu'a « Enregistrer ». -->
    <section v-if="!creating" class="user-state-row">
      <label class="user-state-card" :class="{ on: editing.enabled }">
        <UiCheckbox :model-value="editing.enabled" :disabled="busy" @update:model-value="$emit('set-enabled', !editing.enabled)" />
        <span>
          <strong>{{ editing.enabled ? 'Compte actif' : 'Compte désactivé' }}</strong>
          <small>{{ editing.enabled ? 'Ses demandes sont traitées' : 'Ses demandes sont ignorées' }}</small>
        </span>
      </label>

      <label class="user-state-card" :class="{ on: editing.can_login }">
        <UiCheckbox :model-value="editing.can_login" :disabled="busy" @update:model-value="$emit('set-can-login', !editing.can_login)" />
        <span>
          <strong>{{ editing.can_login ? 'Connexion autorisée' : 'Connexion bloquée' }}</strong>
          <small>{{ editing.can_login ? 'Peut ouvrir une session' : 'Ne peut pas se connecter' }}</small>
        </span>
      </label>
    </section>

    <AppSubnav variant="tabs" :active="editorTab" @update:active="editorTab = $event" :items="editorTabItems" aria-label="Sections de l’utilisateur" />

    <section v-if="editorTab==='profile'" class="drawer-section form-section">
      <UiCheckboxField v-if="creating" class="local-account-toggle" v-model="isLocalAccount" @update:model-value="onLocalAccountToggle" label="Compte local (sans Plex)" />
      <div class="settings-grid two">
        <label>{{ isLocalAccount?"Identifiant de connexion":"ID Plex" }}<input v-model="form.plex_user_id" :disabled="!creating && editing.source!=='local'" :placeholder="isLocalAccount?'ex. jdupont':''"></label>
        <label>Nom affiche<input v-model="form.display_name"></label>
        <label>Nom d'usage<input v-model="form.custom_name"></label>
        <label>Email Plex<input v-model="form.plex_email" type="email"></label>
        <label>Email de notification<input v-model="form.notification_email"></label>
        <label>Role<UiSelect v-model="form.role" :options="[{ value: 'user', label: 'Utilisateur' }, { value: 'moderator', label: 'Modérateur' }, { value: 'admin', label: 'Administrateur' }]" /></label>
        <!-- « Traiter les demandes » et « Autoriser la connexion » vivent desormais en
             haut de la fiche, avec effet immediat : les garder ici en aurait fait des
             champs de formulaire concurrents, portant deja un autre nom pour le meme
             etat (« Compte actif »). -->
        <UiCheckboxField v-model="form.auto_approve" label="Auto-approuver ses demandes" />
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
          <UiCheckboxField v-model="form.notify_on_request" label="Nouvelle demande" />
          <small class="check-hint">Email envoyé à cette personne quand une de ses demandes est enregistrée.</small>
          <UiCheckboxField v-model="form.notify_on_available" label="Disponibilité" />
          <small class="check-hint">Email envoyé quand un média qu'elle a demandé devient disponible dans Plex.</small>
          <UiCheckboxField v-model="form.notify_digest" label="Récapitulatif quotidien (digest)" />
          <small class="check-hint">Reçoit un résumé une fois par jour au lieu d'un email par événement — nécessite que le digest soit activé globalement (Paramètres → Notifications → Règles).</small>
          <UiCheckboxField v-model="form.notify_admin" label="Copier l'administrateur" />
          <small class="check-hint">Ajoute l'adresse email admin en copie sur les notifications envoyées à cette personne.</small>
        </div>
      </div>

      <div class="notif-group">
        <h3><Languages/>Disponibilité VF</h3>
        <p class="hint">Faut-il notifier cette personne quand un média qu'elle a demandé passe en VF ?</p>
        <div class="settings-grid two">
          <UiCheckboxField v-model="form.notify_vf_movie" label="Films" />
          <UiCheckboxField v-model="form.notify_vf_series" label="Séries" />
          <label>Fréquence pour les séries
            <UiSelect v-model="form.series_notify_granularity" :options="[{ value: 'minimal', label: 'Une seule fois, à la fin' }, { value: 'jalons', label: 'Début et fin de saison' }, { value: 'tout', label: 'Chaque épisode' }]" />
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
         comptes Watchdeck n'a rien a voir avec Seer. Fusionner un compte local avec un
         compte Plex reste possible meme Seer eteint. -->
    <section v-else-if="editorTab==='linked'" class="drawer-section linked-accounts">
      <!-- Trois faits techniques ouvraient l'onglet en liste de definitions, sans style,
           donc au rendu par defaut du navigateur. Ce n'est que du contexte : une ligne. -->
      <p class="account-facts">
        <span v-if="editing.display_name">{{ editing.display_name }}</span>
        <span>{{ accountOrigin }}</span>
        <code v-if="editing.plex_user_id">{{ editing.plex_user_id }}</code>
      </p>

      <template v-if="seerEnabled">
        <div class="panel-head"><h3>Compte Seer</h3><span class="badge">{{ seerLinkLabel(editing) }}</span></div>
        <p class="drawer-hint">{{ seerModeHint }}</p>

        <template v-if="editing.seer_user_id">
          <div class="actions">
            <UiButton @click="$emit('user-action','seer-complete')"><RefreshCw/>Compléter depuis Seer</UiButton>
            <UiButton variant="danger" @click="$emit('unlink-seer')"><Unlink/>Dissocier</UiButton>
          </div>
        </template>
        <template v-else>
          <label>Compte Seer correspondant
            <UiSelect v-model="seerTarget" :disabled="!seerCandidates.length" :options="[{ value: '', label: String(seerCandidates.length ? 'Choisir un compte Seer…' : 'Aucun compte Seer disponible') }, ...(seerCandidates).map((candidate) => ({ value: candidate.id, label: String(seerCandidateLabel(candidate)), disabled: candidate.linked }))]" />
          </label>
          <div class="actions">
            <UiButton :disabled="!seerTarget" @click="$emit('link-seer', seerTarget)"><Link/>Lier ce compte Seer</UiButton>
            <UiButton @click="$emit('user-action','seer-automatch')"><RefreshCw/>Chercher automatiquement</UiButton>
          </div>
        </template>
      </template>

      <!-- ---------- Fusion ---------- -->
      <div class="panel-head"><h3>Réunir avec un autre compte</h3></div>

      <!-- Un seul champ, deux facons d'entrer : le nom, ou l'identifiant Plex. Deux
           controles empiles a l'identique se lisaient comme deux etapes obligatoires,
           alors que ce sont des alternatives. -->
      <label>Chercher le compte
        <input
          v-model="mergeQuery"
          list="merge-candidates"
          placeholder="Nom ou identifiant Plex…"
          spellcheck="false"
          autocomplete="off"
        >
      </label>
      <datalist id="merge-candidates">
        <option v-for="user in mergeCandidates" :key="user.id" :value="displayName(user)">{{ sourceLabel(resolveSource(user)) }}</option>
      </datalist>
      <p v-if="mergeQuery.trim() && !resolvedMergeTarget" class="drawer-hint warn">Aucun compte ne correspond.</p>

      <!-- La consequence n'est enoncee qu'une fois les deux comptes connus : un pave
           explicatif place avant tout choix parlait de la fusion en general. -->
      <template v-if="resolvedMergeTarget">
        <fieldset class="merge-direction">
          <legend>Quel compte conserver&nbsp;?</legend>
          <UiRadioCards
            v-model="mergeKeep"
            label="Quel compte conserver ?"
            :options="[
              { value: 'this', label: `Conserver ${displayName(editing)}`, description: `Les demandes de ${displayName(resolvedMergeTarget)} sont rattachées ici, puis ce compte-là est supprimé.` },
              { value: 'other', label: `Conserver ${displayName(resolvedMergeTarget)}`, description: `Les demandes de ${displayName(editing)} y sont rattachées, puis ce compte est supprimé et la fiche se ferme.` },
            ]"
          />
        </fieldset>

        <!-- Bouton discret et colle au choix : pleine largeur en bas de panneau, il avait
             l'allure de l'action principale alors qu'il supprime un compte pour de bon. -->
        <div v-if="mergeKeep" class="merge-commit">
          <span class="merge-warning"><TriangleAlert/>{{ displayName(mergeKeep === 'this' ? resolvedMergeTarget : editing) }} sera supprimé définitivement.</span>
          <UiButton variant="danger" @click="$emit('merge', { otherId: resolvedMergeTarget.id, keep: mergeKeep })"><Merge/>Fusionner</UiButton>
        </div>
      </template>
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
  </div>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import { formatDate, formatDateTime } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { accountName, resolveSource, roleLabel, seerLinkLabel, sourceLabel } from '@/utils/userLabels';
import { Download, KeyRound, Languages, Link, Mail, MailCheck, Merge, RefreshCw, Save, Send, Trash2, TriangleAlert, Unlink } from '@lucide/vue';
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
const mergeQuery = ref('');
const mergeKeep = ref('');
const seerTarget = ref('');

const mergeCandidates = computed(() => props.users.filter((user: any) => user.id !== props.editing.id));

/* Un seul champ accepte le nom OU l'identifiant Plex : c'est par l'identifiant qu'on
   retrouve l'entree creee par le flux RSS pour une personne deja connue. L'identifiant
   est teste en premier -- il est unique, la ou deux comptes peuvent porter le meme nom. */
const resolvedMergeTarget = computed(() => {
  const needle = mergeQuery.value.trim().toLowerCase();
  if (!needle) return null;
  const list = mergeCandidates.value;
  return (
    list.find((user: any) => (user.plex_user_id || '').toLowerCase() === needle) ||
    list.find((user: any) => displayName(user).toLowerCase() === needle) ||
    list.find((user: any) => (user.display_name || '').toLowerCase() === needle) ||
    null
  );
});

/* Le backend calcule deja une origine plus riche que la colonne brute : « RSS + Seer »
   la ou `source` ne dit que « api », la voie d'entree technique. On la prefere quand
   elle existe. */
const accountOrigin = computed(
  () => props.editing.diagnostic?.source_label || sourceLabel(resolveSource(props.editing))
);
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
    mergeQuery.value = '';
    mergeKeep.value = '';
    seerTarget.value = '';
    newPassword.value = '';
    initialPassword.value = '';
  },
  initialPassword,
});
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.user-editor{display:grid;gap:var(--space-4)}
.user-head-meta{display:flex;align-items:center;gap: var(--space-2);margin-right: var(--space-2)}
.user-head-meta small{color:var(--muted);font-size:var(--fs-xs);white-space:nowrap}

/* Deux cartes cliquables plutot qu'une bande melangeant cases, pastille et badges :
   on ne savait plus ce qui etait cliquable, et la description se collait a son
   intitule faute de mise en forme -- le balisage avait ete pose sans ses styles. */
.user-state-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-2)}
.user-state-card{display:flex;align-items:flex-start;gap: var(--space-3);padding:11px 13px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);cursor:pointer}
.user-state-card:hover{border-color:var(--accent)}
.user-state-card.on{border-color:color-mix(in srgb, var(--success) 45%, var(--border))}
.user-state-card input{flex:none;margin:2px 0 0;cursor:pointer}
.user-state-card>span{display:grid;gap:2px;min-width:0}
.user-state-card strong{font-size:var(--fs-sm)}
.user-state-card small{color:var(--muted);font-size:var(--fs-xs)}
.user-state-card:has(input:disabled){opacity:.6;cursor:progress}
@include bp.until(phablet) {.user-state-row{grid-template-columns:1fr}}.notification-history{display:grid;gap: var(--space-2);margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}.notification-history h3{margin:0;font-size:var(--fs-md)}.notification-history small{display:block;margin-top:3px}.user-activity-timeline{display:grid}.activity-event{position:relative;display:grid;grid-template-columns:14px 1fr auto;gap: var(--space-2);padding-bottom:15px}.activity-event::before{content:'';position:absolute;top:12px;bottom:0;left:5px;width:2px;background:var(--border)}.activity-event:last-child::before{display:none}.activity-marker{position:relative;z-index:1;width:12px;height:12px;margin-top:3px;border:2px solid var(--accent);border-radius:50%;background:var(--surface)}.activity-event.available .activity-marker,.activity-event.notification .activity-marker{border-color:var(--success)}.activity-event.notification_failed .activity-marker{border-color:var(--danger)}.activity-event>div{display:grid;gap: var(--space-1)}.activity-event span,.activity-event small{color:var(--muted);font-size:var(--fs-xs)}.activity-event strong{font-size:var(--fs-sm)}@media(max-width:520px){.activity-event{grid-template-columns:14px 1fr}.activity-event>.badge{grid-column:2;justify-self:start}}
/* Cette section n'avait aucun style : `.user-identity-facts` n'apparaissait que dans le
   gabarit, jamais dans une feuille, et le navigateur appliquait son rendu par defaut de
   <dl> -- intitule puis valeur indentee dessous. */
.linked-accounts{display:grid;gap: var(--space-3)}
.account-facts{display:flex;flex-wrap:wrap;align-items:center;gap: var(--space-2);margin:0;color:var(--muted);font-size:var(--fs-xs)}
.account-facts>span+span::before,.account-facts>span+code::before{content:'·';margin-right: var(--space-2);opacity:.6}
.account-facts code{font-size:var(--fs-xs);opacity:.75}
.linked-accounts .panel-head{margin:0}
.linked-accounts .drawer-hint{margin:0;color:var(--muted);font-size:var(--fs-xs)}
.linked-accounts .drawer-hint.warn{color:var(--accent)}

.merge-direction{display:grid;gap: var(--space-2);margin:0;padding:0;border:0}
.merge-direction legend{padding:0;color:var(--muted);font-size:var(--fs-xs)}

/* L'action destructrice se tient a cote du choix qui la rend possible, pas en pleine
   largeur au bas du panneau ou elle avait l'allure de l'action principale. */
.merge-commit{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap: var(--space-2)}
.merge-warning{display:flex;align-items:center;gap: var(--space-2);color: var(--red-text);font-size:var(--fs-xs)}
.merge-warning svg{width:15px;height:15px;flex:none}
.merge-commit button{flex:none}

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

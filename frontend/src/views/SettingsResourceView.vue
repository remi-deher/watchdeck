<template>
  <!-- Formulaire d'un element de reglage (serveur Plex, instance *arr, client torrent,
       fournisseur d'email) : dans la feuille depuis la page de reglages, en pleine page par son
       adresse. `new` a la place de l'identifiant ouvre une creation. -->
  <!-- Un client de telechargement se saisit par une definition du gabarit Creer (fenetre) ;
       les autres types gardent leur formulaire en attendant la leur. -->
  <CreateTemplate
    v-if="creation && ready"
    open
    :definition="creation"
    :mode="id === 'new' ? 'create' : 'edit'"
    :values="existing"
    @close="close"
  />
  <SheetPage v-else-if="!creation" :eyebrow="kind?.eyebrow || 'Réglages'" :title="title" :error="kind ? '' : 'Ce type de réglage est inconnu.'">
    <component :is="kind.form" v-if="kind?.form" :id="id" @done="done" @cancel="close" />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import SheetPage from '@/components/layout/SheetPage.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { downloadClientCreation } from '@/creations/downloadClient';
import ArrInstanceForm from '@/components/settings/forms/ArrInstanceForm.vue';
import EmailProviderForm from '@/components/settings/forms/EmailProviderForm.vue';
import PlexServerForm from '@/components/settings/forms/PlexServerForm.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';

interface ResourceKind { form?: Component; eyebrow: string; create: string; update: string; home: string }

/* Chaque type : son formulaire, ses titres, et la page de reglages ou il vit -- celle
   ou l'on retombe apres un enregistrement ouvert en pleine page. */
const KINDS: Record<string, ResourceKind> = {
  arr: { form: ArrInstanceForm, eyebrow: 'Intégrations', create: 'Ajouter une instance', update: 'Modifier l’instance', home: '/settings/services/integrations' },
  'download-client': { eyebrow: 'Acquisition', create: 'Ajouter un client', update: 'Modifier le client', home: '/settings/acquisition' },
  'plex-server': { form: PlexServerForm, eyebrow: 'Plex', create: 'Ajouter un serveur', update: 'Modifier le serveur', home: '/settings/services' },
  'email-provider': { form: EmailProviderForm, eyebrow: 'Notifications', create: 'Ajouter un fournisseur', update: 'Modifier le fournisseur', home: '/settings/notifications/channels' },
};

const route = useRoute();
const router = useRouter();
const { actif: enSurface, fermer } = useMediaOverlay();
const { addToast } = useToast();

const kind = computed(() => KINDS[String(route.params.kind)] || null);
const id = computed(() => String(route.params.id || 'new'));
const title = computed(() => (!kind.value ? 'Réglage' : id.value === 'new' ? kind.value.create : kind.value.update));

const queryClient = useQueryClient();
const existing = ref<Record<string, any> | null>(null);
const ready = ref(false);

/* Modification : on lit l'element avant d'ouvrir la fenetre, pour qu'elle s'ouvre sur ses valeurs. */
watchEffect(async () => {
  if (route.params.kind !== 'download-client') return;
  ready.value = false;
  existing.value = null;
  if (id.value !== 'new') {
    const list = await api<any[]>('/api/download-clients');
    const found = list.find((row) => String(row.id) === id.value);
    existing.value = found ? { ...found, password: '' } : null;
  }
  ready.value = true;
});

const creation = computed(() => (
  kind.value && route.params.kind === 'download-client'
    ? downloadClientCreation(id.value === 'new' ? null : id.value, () => { void queryClient.invalidateQueries({ queryKey: ['settings', 'crud', '/api/download-clients'] }); })
    : null
));

function close(): void {
  if (enSurface.value) fermer();
  else void router.push(kind.value?.home || '/settings');
}
function done(message: string): void {
  addToast({ type: 'success', title: kind.value?.eyebrow || 'Réglages', message });
  close();
}
</script>

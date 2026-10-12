<template>
  <!-- Formulaire d'un element de reglage (serveur Plex, instance *arr, client torrent,
       fournisseur d'email) : dans la feuille depuis la page de reglages, en pleine page par son
       adresse. `new` a la place de l'identifiant ouvre une creation. -->
  <!-- Client de telechargement et instance *arr : une definition du gabarit Creer (fenetre) ;
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
import type { CreateDefinition } from '@/components/templates/create/types';
import { downloadClientCreation } from '@/creations/downloadClient';
import { serviceForm } from '@/creations/service';
import EmailProviderForm from '@/components/settings/forms/EmailProviderForm.vue';
import PlexServerForm from '@/components/settings/forms/PlexServerForm.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';

interface ResourceKind { form?: Component; eyebrow: string; create: string; update: string; home: string }

/* Chaque type : son formulaire, ses titres, et la page de reglages ou il vit -- celle
   ou l'on retombe apres un enregistrement ouvert en pleine page. */
const KINDS: Record<string, ResourceKind> = {
  arr: { eyebrow: 'Intégrations', create: 'Ajouter une instance', update: 'Modifier l’instance', home: '/settings/services/integrations' },
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

/* Les types saisis par une definition du gabarit Creer : leur liste, la definition, et la
   facon de presenter une ressource existante a la fenetre (mot de passe vide = conserve). */
const CREATIONS: Record<string, { path: string; make: (id: string | null, done: () => void) => CreateDefinition; prepare: (row: any) => Record<string, any> }> = {
  'download-client': {
    path: '/api/download-clients',
    make: downloadClientCreation,
    prepare: (row) => ({ ...row, password: '' }),
  },
  arr: {
    path: '/api/arr-instances',
    make: serviceForm,
    prepare: (row) => ({
      ...row,
      api_key: '',
      quality_profile_id: row.quality_profile_id == null ? '' : String(row.quality_profile_id),
      plex_server_id: row.plex_server_id == null ? '' : String(row.plex_server_id),
      root_folder: row.root_folder || '',
    }),
  },
};
const spec = computed(() => CREATIONS[String(route.params.kind)] || null);

/* Modification : on lit l'element avant d'ouvrir la fenetre, pour qu'elle s'ouvre sur ses valeurs. */
watchEffect(async () => {
  const current = spec.value;
  if (!current) return;
  ready.value = false;
  existing.value = null;
  if (id.value !== 'new') {
    const list = await api<any[]>(current.path);
    const found = list.find((row) => String(row.id) === id.value);
    existing.value = found ? current.prepare(found) : null;
  }
  ready.value = true;
});

const creation = computed(() => {
  const current = spec.value;
  if (!current || !kind.value) return null;
  return current.make(id.value === 'new' ? null : id.value, () => {
    void queryClient.invalidateQueries({ queryKey: ['settings', 'crud', current.path] });
    addToast({ type: 'success', title: kind.value?.eyebrow || 'Réglages', message: id.value === 'new' ? 'Ajouté.' : 'Mis à jour.' });
  });
});

function close(): void {
  if (enSurface.value) fermer();
  else void router.push(kind.value?.home || '/settings');
}
function done(message: string): void {
  addToast({ type: 'success', title: kind.value?.eyebrow || 'Réglages', message });
  close();
}
</script>

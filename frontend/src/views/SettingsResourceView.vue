<template>
  <!-- Formulaire d'un element de reglage (instance *arr, client torrent, fournisseur
       d'email) : dans la feuille depuis la page de reglages, en pleine page par son
       adresse. `new` a la place de l'identifiant ouvre une creation. -->
  <SheetPage :eyebrow="kind?.eyebrow || 'Réglages'" :title="title" :error="kind ? '' : 'Ce type de réglage est inconnu.'">
    <component :is="kind.form" v-if="kind" :id="id" @done="done" @cancel="close" />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SheetPage from '@/components/layout/SheetPage.vue';
import ArrInstanceForm from '@/components/settings/forms/ArrInstanceForm.vue';
import DownloadClientForm from '@/components/settings/forms/DownloadClientForm.vue';
import EmailProviderForm from '@/components/settings/forms/EmailProviderForm.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';

interface ResourceKind { form: Component; eyebrow: string; create: string; update: string; home: string }

/* Chaque type : son formulaire, ses titres, et la page de reglages ou il vit -- celle
   ou l'on retombe apres un enregistrement ouvert en pleine page. */
const KINDS: Record<string, ResourceKind> = {
  arr: { form: ArrInstanceForm, eyebrow: 'Intégrations', create: 'Ajouter une instance', update: 'Modifier l’instance', home: '/settings/services/integrations' },
  'download-client': { form: DownloadClientForm, eyebrow: 'Intégrations', create: 'Ajouter un client', update: 'Modifier le client', home: '/settings/services/integrations' },
  'email-provider': { form: EmailProviderForm, eyebrow: 'Notifications', create: 'Ajouter un fournisseur', update: 'Modifier le fournisseur', home: '/settings/notifications/channels' },
};

const route = useRoute();
const router = useRouter();
const { actif: enSurface, fermer } = useMediaOverlay();
const { addToast } = useToast();

const kind = computed(() => KINDS[String(route.params.kind)] || null);
const id = computed(() => String(route.params.id || 'new'));
const title = computed(() => (!kind.value ? 'Réglage' : id.value === 'new' ? kind.value.create : kind.value.update));

function close(): void {
  if (enSurface.value) fermer();
  else void router.push(kind.value?.home || '/settings');
}
function done(message: string): void {
  addToast({ type: 'success', title: kind.value?.eyebrow || 'Réglages', message });
  close();
}
</script>

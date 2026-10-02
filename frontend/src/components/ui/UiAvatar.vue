<template>
  <AvatarRoot class="ui-avatar" :class="[`ui-avatar--${size}`, `ui-avatar--${tone}`, { 'is-off': off }]" aria-hidden="true">
    <!-- Reka Avatar : les initiales prennent le relais tant que l'image charge, ou si elle
         echoue, au lieu d'une image cassee. Decoratif : le nom est toujours ecrit a cote. -->
    <AvatarImage v-if="src" :src="src" alt="" />
    <!-- Sans image, aucun delai : `undefined` et surtout pas 0, que Reka lit comme « jamais »
         (les initiales ne s'affichaient pas dans la liste des utilisateurs). -->
    <AvatarFallback :delay-ms="src ? 300 : undefined">{{ initials || nameInitials(name) }}</AvatarFallback>
  </AvatarRoot>
</template>

<script setup lang="ts">
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui';
import { nameInitials } from '@/utils/userLabels';

withDefaults(defineProps<{
  src?: string | null;
  /** Nom dont on tire les initiales, a defaut de `initials`. */
  name?: string | null;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  /** neutral : pastille discrete (listes de comptes) ; accent : pastille coloree. */
  tone?: 'neutral' | 'accent';
  /** Compte desactive : l'image passe en niveaux de gris. */
  off?: boolean;
}>(), { src: '', name: '', initials: '', size: 'md', tone: 'neutral', off: false });
</script>

<style scoped>
.ui-avatar{display:inline-grid;flex:none;place-items:center;overflow:hidden;border-radius:50%;font-weight:700;line-height:1;user-select:none}
.ui-avatar :deep(img){width:100%;height:100%;object-fit:cover}
.ui-avatar--sm{width:24px;height:24px;font-size:var(--fs-xs)}
.ui-avatar--md{width:34px;height:34px;font-size:var(--fs-xs)}
.ui-avatar--lg{width:46px;height:46px;font-size:var(--fs-sm)}
.ui-avatar--neutral{background:var(--surface-2, var(--surface));color:var(--muted)}
.ui-avatar--accent{background:color-mix(in srgb,var(--accent) 15%,var(--surface));color:var(--accent);font-weight:800}
.ui-avatar.is-off{filter:grayscale(1)}
</style>

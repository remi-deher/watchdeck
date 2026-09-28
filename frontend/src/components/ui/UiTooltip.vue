<template>
  <!-- Infobulle Reka UI autour de son element (slot par defaut) : elle s'affiche au survol
       comme au focus clavier, se place dans l'ecran et se ferme a Echap -- l'attribut
       `title` natif n'apparaissait qu'a la souris, apres un long delai. Un element non
       interactif (pastille, badge) devient tabulable pour que le clavier y accede aussi.
       Sans texte, seul l'element est rendu. -->
  <TooltipProvider v-if="text || $slots.content" :delay-duration="delay" ignore-non-keyboard-focus>
    <TooltipRoot>
      <TooltipTrigger as-child :tabindex="focusable ? 0 : undefined">
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="ui-tooltip" :side="side" :side-offset="6" :collision-padding="8">
          <slot name="content">{{ text }}</slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <slot v-else />
</template>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui';

withDefaults(defineProps<{
  text?: string | null;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  /** Rend l'element tabulable ; inutile (false) quand il l'est deja, comme un bouton. */
  focusable?: boolean;
}>(), { text: '', side: 'top', delay: 350, focusable: true });
</script>

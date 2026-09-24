<template>
  <div>
    <details open class="template-settings">
      <summary>En-tete commun</summary>
      <div class="settings-grid two form-section">
        <label>Marque<input v-model="shared.email_header_brand"></label>
        <label>Sous-titre<input v-model="shared.email_header_subtitle"></label>
        <label>Couleur de marque<input v-model="shared.email_brand_color" type="color"></label>
        <UiCheckboxField v-model="shared.email_show_header_subtitle" label="Afficher le sous-titre" />
      </div>
    </details>

    <details class="template-settings">
      <summary>Bloc media et apparence</summary>
      <div class="settings-grid two form-section">
        <label>Disposition<UiSelect v-model="shared.email_media_layout" :options="[{ value: 'left', label: 'Affiche a gauche' }, { value: 'right', label: 'Affiche a droite' }, { value: 'stacked', label: 'Affiche au-dessus' }]" /></label>
        <label>Police<UiSelect v-model="shared.email_font_family" :options="[{ value: 'arial', label: 'Arial' }, { value: 'georgia', label: 'Georgia' }, { value: 'verdana', label: 'Verdana' }, { value: 'trebuchet', label: 'Trebuchet MS' }]" /></label>
        <label>Largeur de carte <span>{{ shared.email_card_width }} px</span><UiSlider v-model="shared.email_card_width" :min="480" :max="700" :step="10" /></label>
        <label>Largeur affiche <span>{{ shared.email_poster_width }} px</span><UiSlider v-model="shared.email_poster_width" :min="60" :max="180" :step="10" /></label>
        <label>Arrondi de carte <span>{{ shared.email_card_border_radius }} px</span><UiSlider v-model="shared.email_card_border_radius" :min="0" :max="24" :step="2" /></label>
        <label>Taille du synopsis<UiSelect v-model="shared.email_synopsis_font_size" :options="[{ value: 'small', label: 'Petite' }, { value: 'normal', label: 'Normale' }, { value: 'large', label: 'Grande' }, { value: 'xlarge', label: 'Tres grande' }]" /></label>
        <label>Fond de page<input v-model="shared.email_bg_color" type="color"></label>
        <label>Fond de carte<input v-model="shared.email_card_bg_color" type="color"></label>
        <UiCheckboxField v-model="shared.email_show_poster" label="Afficher l'affiche" />
        <UiCheckboxField v-model="shared.email_show_genres" label="Afficher les genres" />
        <UiCheckboxField v-model="shared.email_show_requester" label="Afficher le demandeur" />
        <label>Libelle du demandeur<input v-model="shared.email_requester_label"></label>
        <UiCheckboxField v-model="shared.email_show_tmdb_link" label="Afficher le lien TMDB" />
        <UiCheckboxField v-model="shared.email_show_plex_button" label="Afficher le bouton Plex" />
      </div>
    </details>

    <details class="template-settings">
      <summary>Pied de page commun</summary>
      <div class="form-section">
        <label>Pied de page HTML / Markdown</label>
        <MarkdownTextarea v-model="shared.email_footer_template" :rows="5" :variables="variables" />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiSlider from '@/components/ui/UiSlider.vue';
import MarkdownTextarea from './MarkdownTextarea.vue';

withDefaults(
  defineProps<{
    shared: Record<string, any>;
    variables?: any[];
  }>(),
  {
    variables: () => [],
  }
);
</script>

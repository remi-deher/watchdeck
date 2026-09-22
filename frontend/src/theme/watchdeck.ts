import { definePreset } from '@primeuix/themes';
import AuraBase from '@primeuix/themes/aura/base';
import AuraCheckbox from '@primeuix/themes/aura/checkbox';
import AuraDataTable from '@primeuix/themes/aura/datatable';
import AuraToast from '@primeuix/themes/aura/toast';
import AuraSelectButton from '@primeuix/themes/aura/selectbutton';
import AuraToggleSwitch from '@primeuix/themes/aura/toggleswitch';
import AuraPassword from '@primeuix/themes/aura/password';
import AuraInputText from '@primeuix/themes/aura/inputtext';
import AuraDialog from '@primeuix/themes/aura/dialog';
import AuraDrawer from '@primeuix/themes/aura/drawer';
import AuraConfirmDialog from '@primeuix/themes/aura/confirmdialog';
import AuraButton from '@primeuix/themes/aura/button';

/* N'embarquer que les bases réellement utilisées. Importer `@primeuix/themes/aura`
   ajouterait les tokens des quelque 80 composants au bundle initial, même si Vite ne
   charge le DataTable que dans la route Acquisition. */
const WatchdeckBase = {
  ...AuraBase,
  components: {
    checkbox: AuraCheckbox,
    datatable: AuraDataTable,
    toast: AuraToast,
    selectbutton: AuraSelectButton,
    toggleswitch: AuraToggleSwitch,
    password: AuraPassword,
    inputtext: AuraInputText,
    dialog: AuraDialog,
    drawer: AuraDrawer,
    confirmdialog: AuraConfirmDialog,
    button: AuraButton,
  },
};

/*
 * PrimeVue reste une extension du langage visuel de Watchdeck, pas un second theme.
 * Les valeurs pointent donc vers les custom properties de foundations/_tokens.scss :
 * une evolution de la palette de l'application se repercute aussi sur les composants
 * PrimeVue sans maintenir deux jeux de couleurs.
 */
export const WatchdeckPreset = definePreset(WatchdeckBase, {
  semantic: {
    primary: {
      50: 'color-mix(in srgb, var(--accent) 12%, white)',
      100: 'color-mix(in srgb, var(--accent) 24%, white)',
      200: 'color-mix(in srgb, var(--accent) 40%, white)',
      300: 'color-mix(in srgb, var(--accent) 58%, white)',
      400: 'color-mix(in srgb, var(--accent) 78%, white)',
      500: 'var(--accent)',
      600: 'color-mix(in srgb, var(--accent) 86%, black)',
      700: 'color-mix(in srgb, var(--accent) 72%, black)',
      800: 'color-mix(in srgb, var(--accent) 58%, black)',
      900: 'color-mix(in srgb, var(--accent) 44%, black)',
      950: 'color-mix(in srgb, var(--accent) 30%, black)',
    },
    borderRadius: {
      none: '0',
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-lg)',
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--accent)',
      offset: '2px',
      shadow: 'none',
    },
    colorScheme: {
      dark: {
        surface: {
          0: 'var(--text)',
          50: 'var(--text)',
          100: 'var(--muted)',
          200: 'var(--surface-3)',
          300: 'var(--surface-3)',
          400: 'var(--surface-2)',
          500: 'var(--surface-2)',
          600: 'var(--surface)',
          700: 'var(--surface)',
          800: 'var(--surface-sunken)',
          900: 'var(--bg)',
          950: 'var(--bg)',
        },
        formField: {
          background: 'var(--surface)',
          disabledBackground: 'var(--surface-2)',
          filledBackground: 'var(--surface-2)',
          filledHoverBackground: 'var(--surface-3)',
          filledFocusBackground: 'var(--surface-3)',
          borderColor: 'var(--border)',
          hoverBorderColor: 'color-mix(in srgb, var(--accent) 55%, var(--border))',
          focusBorderColor: 'var(--accent)',
          invalidBorderColor: 'var(--red)',
          color: 'var(--text)',
          disabledColor: 'var(--muted)',
          placeholderColor: 'var(--muted)',
          invalidPlaceholderColor: 'var(--red-text)',
          floatLabelColor: 'var(--muted)',
          floatLabelFocusColor: 'var(--accent)',
          floatLabelActiveColor: 'var(--muted)',
          floatLabelInvalidColor: 'var(--red-text)',
          iconColor: 'var(--muted)',
          shadow: 'none',
        },
        text: {
          color: 'var(--text)',
          hoverColor: 'var(--text)',
          mutedColor: 'var(--muted)',
          hoverMutedColor: 'var(--text)',
        },
        content: {
          background: 'var(--surface)',
          hoverBackground: 'var(--surface-2)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
          hoverColor: 'var(--text)',
        },
        overlay: {
          select: {
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          },
          popover: {
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          },
          modal: {
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          },
        },
      },
    },
  },
  components: {
    datatable: {
      root: {
        borderColor: 'var(--border)',
      },
      headerCell: {
        background: 'var(--surface)',
        hoverBackground: 'var(--surface-2)',
        selectedBackground: 'var(--surface-2)',
        borderColor: 'var(--border)',
        color: 'var(--muted)',
        hoverColor: 'var(--text)',
        selectedColor: 'var(--accent)',
        padding: '10px 9px',
      },
      row: {
        background: 'var(--surface)',
        hoverBackground: 'var(--surface-2)',
        selectedBackground: 'var(--surface-2)',
        color: 'var(--text)',
        hoverColor: 'var(--text)',
        selectedColor: 'var(--text)',
      },
      bodyCell: {
        borderColor: 'var(--border)',
        padding: '10px 9px',
      },
    },
  },
});

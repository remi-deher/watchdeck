import { watch } from 'vue';
import { useToast, type AddToastOptions } from './useToast';

/* Une erreur de chargement qui n'empeche pas d'afficher la page (donnees partielles, bloc
   secondaire) passe par la notification commune, pas par un bandeau pose dans la page.
   Le toast est emis a chaque nouveau message ; `retry` ajoute le bouton « Reessayer ». */
export function useErrorToast(
  message: () => string | null | undefined,
  { title = '', type = 'error', retry }: { title?: string; type?: AddToastOptions['type']; retry?: () => void | Promise<void> } = {},
): void {
  const { addToast } = useToast();
  watch(message, (value) => {
    if (!value) return;
    addToast({ type, title, message: value, duration: 8000, action: retry ? { label: 'Réessayer', run: retry } : null });
  }, { immediate: true });
}

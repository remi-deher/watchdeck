<template>
  <div v-if="shouldShow" class="pwa-install-banner">
    <div class="pwa-content">
      <div class="pwa-icon-wrap">
        <img src="/vue/icon-192.png" alt="Watchdeck icon" class="pwa-icon" />
      </div>
      <div class="pwa-text">
        <strong>Installer Watchdeck</strong>
        <span>Accédez à Watchdeck en plein écran directement depuis votre écran d'accueil.</span>
      </div>
    </div>
    <div class="pwa-actions">
      <UiButton v-if="canInstall" variant="primary" size="sm" @click="handleInstall">
        <Download :size="14" />
        <span>Installer</span>
      </UiButton>
      <UiButton v-else-if="isIos" size="sm" @click="showIosModal = true">
        <Smartphone :size="14" />
        <span>Instructions iOS</span>
      </UiButton>
      <UiButton variant="ghost" icon-only title="Masquer" aria-label="Masquer" @click="dismiss">
        <X :size="14" />
      </UiButton>
    </div>

    <!-- Modale d'instructions iOS -->
    <div v-if="showIosModal" class="ios-modal-backdrop" @click.self="showIosModal = false">
      <div class="ios-modal-card">
        <header class="ios-modal-header">
          <h3>Installer sur iPhone / iPad</h3>
          <UiButton variant="ghost" icon-only aria-label="Fermer" @click="showIosModal = false"><X :size="16" /></UiButton>
        </header>
        <div class="ios-modal-body">
          <ol class="ios-steps">
            <li>
              <span>1. Dans <strong>Safari</strong>, appuyez sur le bouton <strong>Partager</strong></span>
              <Share2 :size="16" class="ios-inline-icon" />
            </li>
            <li>
              <span>2. Faites défiler vers le bas et sélectionnez <strong>« Sur l'écran d'accueil »</strong></span>
              <PlusSquare :size="16" class="ios-inline-icon" />
            </li>
            <li>
              <span>3. Touchez <strong>Ajouter</strong> en haut à droite.</span>
            </li>
          </ol>
        </div>
        <footer class="ios-modal-footer">
          <UiButton variant="primary" @click="showIosModal = false">Compris</UiButton>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Download, Smartphone, X, Share2, PlusSquare } from '@lucide/vue';
import { usePwaInstall } from '@/composables/usePwaInstall';
import UiButton from './UiButton.vue';

const { canInstall, isInstalled, isIos, isDismissed, promptInstall, dismiss } = usePwaInstall();
const showIosModal = ref(false);

const shouldShow = computed(() => {
  if (isInstalled.value || isDismissed.value) return false;
  return canInstall.value || isIos.value;
});

async function handleInstall(): Promise<void> {
  await promptInstall();
}
</script>

<style scoped lang="scss">
.pwa-install-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  margin-bottom: var(--space-3);
}

.pwa-content {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.pwa-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.pwa-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pwa-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pwa-text strong {
  font-size: var(--fs-sm);
  color: var(--text);
}

.pwa-text span {
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pwa-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Modale iOS */
.ios-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: max(var(--space-4), var(--safe-top)) max(var(--space-4), var(--safe-right)) max(var(--space-4), var(--safe-bottom)) max(var(--space-4), var(--safe-left));
}

.ios-modal-card {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.ios-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.ios-modal-header h3 {
  margin: 0;
  font-size: var(--fs-md);
  color: var(--text);
}

.ios-modal-body {
  padding: 16px;
}

.ios-steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ios-steps li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--fs-sm);
  color: var(--text);
}

.ios-inline-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.ios-modal-footer {
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  background: var(--surface-hover);
}

@media (max-width: 640px) {
  .pwa-text span {
    display: none;
  }
}
</style>

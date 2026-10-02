<template>
  <main class="auth-layout" :class="{ 'auth-layout--wide': wide }">
    <div class="auth-layout__column">
      <slot name="before" />
      <section class="auth-layout__card" :aria-labelledby="titleId">
        <div class="auth-layout__brand">
          <span class="auth-layout__mark" aria-hidden="true"><Clapperboard /></span>
          <span class="auth-layout__name">Watchdeck</span>
        </div>
        <h1 :id="titleId" class="auth-layout__title">{{ title }}</h1>
        <p v-if="subtitle" class="auth-layout__subtitle">{{ subtitle }}</p>
        <slot />
      </section>
      <footer v-if="$slots.footer" class="auth-layout__footer"><slot name="footer" /></footer>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useId } from 'vue';
import { Clapperboard } from '@lucide/vue';

withDefaults(defineProps<{ title: string; subtitle?: string; wide?: boolean }>(), { subtitle: '', wide: false });

const titleId = `auth-title-${useId()}`;
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.auth-layout {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding:
    max(var(--space-4), env(safe-area-inset-top))
    max(var(--space-4), env(safe-area-inset-right))
    max(var(--space-4), env(safe-area-inset-bottom))
    max(var(--space-4), env(safe-area-inset-left));
  background:
    radial-gradient(60rem 40rem at 0% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%),
    radial-gradient(50rem 36rem at 100% 100%, color-mix(in srgb, var(--blue) 10%, transparent), transparent 70%),
    var(--bg);
  color: var(--text);
}
.auth-layout__column { width: 100%; max-width: 420px; }
.auth-layout--wide .auth-layout__column { max-width: 760px; }
.auth-layout__card {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  box-shadow: var(--shadow-lg);
  animation: auth-rise var(--motion-duration-base) var(--motion-ease-emphasized) both;
}
.auth-layout__brand { display: flex; align-items: center; justify-content: center; gap: var(--space-3); }
.auth-layout__mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--on-accent);
  svg { width: 22px; height: 22px; }
}
.auth-layout__name { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 700; }
.auth-layout__title { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 700; text-align: center; }
.auth-layout__subtitle { margin: calc(-1 * var(--space-2)) 0 0; color: var(--muted); font-size: var(--fs-sm); text-align: center; }
.auth-layout__footer { margin-top: var(--space-5); color: var(--muted); font-size: var(--fs-xs); text-align: center; }
.auth-layout__footer :deep(a) { display: inline-block; padding: var(--space-2) var(--space-1); color: inherit; }
.auth-layout--wide .auth-layout__title { text-align: left; font-size: var(--fs-2xl); }
.auth-layout--wide .auth-layout__brand { justify-content: flex-start; }

@keyframes auth-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}
@include bp.until(mobile-wide) {
  .auth-layout__card { padding: var(--space-5) var(--space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .auth-layout__card { animation: none; }
}
</style>

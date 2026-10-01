import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import {
  areaSeverity,
  buildAttention,
  urgentCount,
  type AttentionItem,
  type AttentionSettings,
  type AttentionSeverity,
  type HealthService,
  type ScheduledTaskState,
  type VersionState,
} from '@/adminAttention';

interface HealthPayload { checked_at?: string; services?: Record<string, HealthService> }

/**
 * Liste « À traiter » de l'Administration, à partir des mêmes requêtes que le tableau de
 * bord (`['health']`) et les écrans de réglages : aucune donnée n'est chargée deux fois.
 *
 * `enabled` coupe tout pour un non-admin, dont ces routes refusent l'accès. `full`
 * ajoute la version publiée, que seul l'accueil affiche : le rail se contente de la
 * santé et des tâches, qui suffisent à son compteur.
 */
export function useAdminAttention(options: {
  enabled: MaybeRefOrGetter<boolean>;
  full?: boolean;
  settings?: MaybeRefOrGetter<AttentionSettings | null>;
}): {
  items: ComputedRef<AttentionItem[]>;
  urgent: ComputedRef<number>;
  severityOf: (area: string) => AttentionSeverity | null;
  services: ComputedRef<Record<string, HealthService>>;
  tasks: ComputedRef<ScheduledTaskState[]>;
  version: ComputedRef<VersionState | null>;
  checkedAt: ComputedRef<string | null>;
  loading: ComputedRef<boolean>;
} {
  const enabled = computed(() => toValue(options.enabled));
  const fullEnabled = computed(() => enabled.value && Boolean(options.full));

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<HealthPayload>('/api/health'),
    staleTime: 60_000,
    enabled,
  });
  const tasks = useQuery({
    queryKey: ['settings', 'scheduled-tasks'],
    queryFn: () => api<ScheduledTaskState[]>('/api/scheduled-tasks'),
    staleTime: 60_000,
    enabled,
  });
  const version = useQuery({
    queryKey: ['settings', 'system-version'],
    queryFn: ({ signal }) => api<VersionState>('/api/system/version', { signal }),
    staleTime: 10 * 60_000,
    enabled: fullEnabled,
  });

  const items = computed(() =>
    enabled.value
      ? buildAttention({
          services: health.data.value?.services,
          tasks: tasks.data.value,
          version: options.full ? version.data.value : null,
          settings: options.settings ? toValue(options.settings) : null,
        })
      : []
  );

  return {
    items,
    urgent: computed(() => urgentCount(items.value)),
    severityOf: (area: string) => areaSeverity(items.value, area),
    services: computed(() => {
      const services = health.data.value?.services;
      return services && typeof services === 'object' && !Array.isArray(services) ? services : {};
    }),
    tasks: computed(() => (Array.isArray(tasks.data.value) ? tasks.data.value : [])),
    version: computed(() => (version.data.value && typeof version.data.value === 'object' ? version.data.value : null)),
    checkedAt: computed(() => health.data.value?.checked_at || null),
    loading: computed(() => health.isPending.value && enabled.value),
  };
}

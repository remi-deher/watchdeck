import { useStorage, type Serializer } from '@vueuse/core';
import type { RemovableRef } from '@vueuse/shared';

const PREFIX = 'watchdeck:';

export interface PreferenceOptions<T> {
  serializer?: Serializer<T>;
  legacyKeys?: string[];
  storage?: Storage;
}

export function preferenceKey(key: string): string {
  return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`;
}

function availableStorage(explicit?: Storage): Storage | undefined {
  if (explicit) return explicit;
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function migratePreference(key: string, legacyKeys: string[], storage?: Storage): void {
  if (!storage) return;
  try {
    if (storage.getItem(key) !== null) return;
    for (const legacyKey of legacyKeys) {
      const value = storage.getItem(legacyKey);
      if (value === null) continue;
      storage.setItem(key, value);
      storage.removeItem(legacyKey);
      return;
    }
  } catch {
    /* Une préférence non migrable ne doit jamais empêcher l'application de démarrer. */
  }
}

export function usePreference<T>(key: string, defaultValue: T, options: PreferenceOptions<T> = {}): RemovableRef<T> {
  const storage = availableStorage(options.storage);
  const fullKey = preferenceKey(key);
  const legacyKeys = options.legacyKeys ?? (fullKey === key ? [] : [key]);
  migratePreference(fullKey, legacyKeys, storage);
  return useStorage(fullKey, defaultValue, storage, {
    serializer: options.serializer,
    onError: () => undefined,
  });
}

export function readPreference<T>(key: string, defaultValue: T, options: PreferenceOptions<T> = {}): T {
  const storage = availableStorage(options.storage);
  const fullKey = preferenceKey(key);
  migratePreference(fullKey, options.legacyKeys ?? (fullKey === key ? [] : [key]), storage);
  try {
    const raw = storage?.getItem(fullKey);
    if (raw == null) return defaultValue;
    if (options.serializer) return options.serializer.read(raw);
    if (typeof defaultValue === 'boolean') return (raw === 'true') as T;
    if (typeof defaultValue === 'number') return Number(raw) as T;
    if (typeof defaultValue === 'string') return raw as T;
    return JSON.parse(raw) as T;
  } catch { return defaultValue; }
}

export function writePreference<T>(key: string, value: T, options: PreferenceOptions<T> = {}): void {
  const storage = availableStorage(options.storage);
  try {
    const raw = options.serializer ? options.serializer.write(value) : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
    storage?.setItem(preferenceKey(key), raw);
  } catch { /* La préférence reste simplement limitée à la session. */ }
}

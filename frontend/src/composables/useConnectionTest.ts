import { ref, type Ref } from 'vue';

export interface ConnectionTestOptions<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: unknown) => void;
}

export function useConnectionTest<TArgs extends unknown[], TResult>(
  test: (...args: TArgs) => Promise<TResult>,
  options: ConnectionTestOptions<TResult> = {}
): {
  testing: Ref<boolean>;
  result: Ref<TResult | null>;
  error: Ref<unknown>;
  run: (...args: TArgs) => Promise<TResult | null>;
} {
  const testing = ref(false);
  const result = ref<TResult | null>(null) as Ref<TResult | null>;
  const error = ref<unknown>(null);

  async function run(...args: TArgs): Promise<TResult | null> {
    if (testing.value) return null;
    testing.value = true;
    error.value = null;
    try {
      const value = await test(...args);
      result.value = value;
      options.onSuccess?.(value);
      return value;
    } catch (cause) {
      error.value = cause;
      options.onError?.(cause);
      return null;
    } finally {
      testing.value = false;
    }
  }

  return { testing, result, error, run };
}

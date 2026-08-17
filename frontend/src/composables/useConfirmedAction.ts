import type { Ref } from 'vue';
import { useAsyncAction, type AsyncActionResult, type RunOptions } from './useAsyncAction';
import { useConfirm, type ConfirmDialogOptions } from './useConfirm';

export interface ConfirmedActionOptions {
  busy?: Ref<boolean>;
  error?: Ref<string>;
  onDone?: (() => any) | null;
}

export function useConfirmedAction(options: ConfirmedActionOptions = {}) {
  const { dialog, askConfirm, resolveConfirm } = useConfirm();
  const action = useAsyncAction({
    askConfirm,
    busy: options.busy,
    error: options.error,
    onDone: options.onDone,
  });

  function runConfirmed<T>(
    operation: () => Promise<T>,
    confirm: ConfirmDialogOptions,
    runOptions: Omit<RunOptions, 'confirm'> = {},
  ): Promise<AsyncActionResult<T>> {
    return action.run(operation, { ...runOptions, confirm });
  }

  return { ...action, dialog, askConfirm, resolveConfirm, runConfirmed };
}

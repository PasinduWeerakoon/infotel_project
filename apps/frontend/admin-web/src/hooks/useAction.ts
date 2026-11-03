/**
 * A server action from a button or form: shows a success or error message, then refreshes
 * the listed queries. Keeps every page's mutations short and consistent.
 */
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { ApiError } from '../api/client';

export function useAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  options: {
    success?: string | ((result: TResult) => string);
    refresh?: QueryKey[];
    onSuccess?: (result: TResult) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: action,
    onSuccess: async (result) => {
      if (options.success)
        message.success(typeof options.success === 'function' ? options.success(result) : options.success);
      await Promise.all(
        (options.refresh ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      options.onSuccess?.(result);
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'Something went wrong. Please try again');
    },
  });
}

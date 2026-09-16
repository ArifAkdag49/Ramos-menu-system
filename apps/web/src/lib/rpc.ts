import { isRpcErrorKey, type RpcErrorKey } from '@ramos/shared';
import { supabase } from './supabase';

export type ErrorKey = RpcErrorKey | 'network' | 'unknown';

export class RpcError extends Error {
  readonly key: ErrorKey;
  readonly detail?: string;

  constructor(key: ErrorKey, detail?: string) {
    super(key);
    this.name = 'RpcError';
    this.key = key;
    this.detail = detail;
  }
}

export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const msg = error.message ?? '';
    const key: ErrorKey = isRpcErrorKey(msg)
      ? msg
      : /fetch|network|timeout/i.test(msg)
        ? 'network'
        : 'unknown';
    throw new RpcError(key, (error as { details?: string }).details || undefined);
  }
  return data as T;
}

import type { QueueEmptyResult } from './types.js';

export async function fetchNextItem(): Promise<QueueEmptyResult> {
  return { item: null, reason: 'EMPTY' };
}

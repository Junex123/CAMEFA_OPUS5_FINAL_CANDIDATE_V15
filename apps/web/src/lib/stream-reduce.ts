import type { StreamEvent } from '@camefa/engine-contracts';
import { verifyReceipt, type Verification } from './verify.js';

export type Frame = StreamEvent;

export type StreamState =
  | {
      status: 'open';
      events: readonly StreamEvent[];
      error: null;
      receiptId: null;
      verification: null;
    }
  | {
      status: 'settled';
      events: readonly StreamEvent[];
      error: null;
      receiptId: string;
      verification: Verification;
    }
  | {
      status: 'failed';
      events: readonly StreamEvent[];
      error: { code: string; message: string };
      receiptId: null;
      verification: null;
    };

export const initialStreamState: StreamState = {
  status: 'open',
  events: [],
  error: null,
  receiptId: null,
  verification: null,
};

export function reduceStream(state: StreamState, event: StreamEvent): StreamState {
  if (event.type === 'error') {
    return {
      status: 'failed',
      events: [...state.events, event],
      error: { code: 'stream', message: event.message },
      receiptId: null,
      verification: null,
    };
  }

  if (event.type === 'sealed') {
    return {
      status: 'settled',
      events: [...state.events, event],
      error: null,
      receiptId: event.receipt.receiptId,
      verification: verifyReceipt(event.receipt),
    };
  }

  return {
    status: 'open',
    events: [...state.events, event],
    error: null,
    receiptId: null,
    verification: null,
  };
}

export * from './fixture-resolver.js';
export * from './rule-interpreter.js';
export * from './fixtures/bodies.js';

export const FIXTURE_CONTEXT = {
  requestId: 'fixture-request',
  locale: 'en',
  currency: 'EUR',
  ownedKit: [],
  profileVersion: '1',
  asOf: '2026-01-01T00:00:00.000Z',
  now: '2026-01-01T00:00:00.000Z',
} as const;

export const FLAGSHIP_A = { id: 'fixture-flagship-a', entityType: 'gear.capture.body' } as const;
export const FLAGSHIP_B = { id: 'fixture-flagship-b', entityType: 'gear.capture.body' } as const;
export const APSC_A = { id: 'fixture-apsc-a', entityType: 'gear.capture.body' } as const;

export function fixtureResolver(_claims: readonly unknown[]) {
  return {
    async resolve() { return new Map(); },
  };
}

export function syntheticExifHistory(options: { frames: number; style: string }) {
  return Array.from({ length: options.frames }, (_, i) => ({
    timestamp: i,
    style: options.style,
  }));
}

export function makeTestPorts(_options: { ontologyVersion?: string } = {}) {
  const spy = { derivationCalls: 0 };
  return {
    spy,
    claims: { async resolve() { return new Map(); } },
    ontology: { async load() { return { ok: true, value: {} }; } },
    receipts: { async put() {}, async get() { return null; } },
    limiter: {
      async admit() { return { admitted: true as const }; },
      async settle() {},
    },
    telemetry: { emit() {} },
  };
}

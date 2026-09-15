export const ENGINE_BUILD = { kernel: '0.1.0', contracts: '0.1.0', commit: process.env.CAMEFA_COMMIT ?? 'dev' } as const;
export type PackRef = { readonly packId: string; readonly version: string; readonly fingerprint: string };
export type ModelRef = { readonly provider: string; readonly modelId: string; readonly templateFingerprint: string };
export type EngineVersionTriplet = { readonly build: typeof ENGINE_BUILD; readonly ontology: readonly PackRef[]; readonly derivation: readonly PackRef[]; readonly model: ModelRef | null };
export type TripletDigest = string & { readonly __tripletDigest: unique symbol };
export type EngineVersions = { readonly build: string; readonly ontology: string; readonly capability: string; readonly reasoning: string };
export interface EpochRef { readonly id: string; readonly version?: string; readonly fingerprint?: string; }
export const REQUIRED_VERSION_DIMENSIONS = ['build', 'ontology', 'capability', 'reasoning'] as const;
export function assessReplayability(engine: EngineVersions) {
  const missing = REQUIRED_VERSION_DIMENSIONS.filter((key) => !engine[key]);
  return { replayable: missing.length === 0, missing: [...missing] };
}

import type { Waiver as LegacyWaiver } from './golden.js';
export type GateMode='blocking'|'advisory';
export interface GateConfig { readonly mode:GateMode; readonly thresholds?:Record<string,number>; }
export interface Waiver { readonly id:string; readonly questionKey:string; readonly owner:string; readonly reason:string; readonly expiresAt:string; readonly boundToCalibrationRef?:string; }
export type { GateThresholds, GateReport, Finding } from './gate.js';
export { evaluateGate, DEFAULT_THRESHOLDS, percentile } from './gate.js';
export type LegacyGoldenWaiver = LegacyWaiver;

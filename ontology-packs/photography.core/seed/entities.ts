import type { EntityId } from '@camefa/engine-kernel';

export const SYNTHETIC_SOURCE = 'seed.synthetic';

type Body = {
  key: string; label: string; mount: string; format: 'ff' | 'aps-c' | 'mft';
  baseIso: number; maxUsableIso: number; drStops: number; readoutMs: number;
  cardSlots: number; massG: number; cipaFrames: number; weatherSealClass: 0 | 1 | 2 | 3;
  afLowLightEv: number; burstFps: number; bufferRaw: number; ibisStops: number;
  priceMinorUsd: number;
};

/** 12 bodies, 2 primary mount systems + a legacy SLR mount for adapter paths. */
export const SEED_BODIES: readonly Body[] = [
  { key: 'body.ax_flagship',   label: 'AX Flagship',    mount: 'mount.sony_e',  format: 'ff',    baseIso: 100, maxUsableIso: 12800, drStops: 14.2, readoutMs: 3.2,  cardSlots: 2, massG: 737, cipaFrames: 2280, weatherSealClass: 3, afLowLightEv: -4.0, burstFps: 30, bufferRaw: 240, ibisStops: 5.5, priceMinorUsd: 649900 },
  { key: 'body.ax_pro',        label: 'AX Pro',         mount: 'mount.sony_e',  format: 'ff',    baseIso: 100, maxUsableIso: 12800, drStops: 14.8, readoutMs: 22.0, cardSlots: 2, massG: 659, cipaFrames: 580,  weatherSealClass: 2, afLowLightEv: -4.0, burstFps: 10, bufferRaw: 90,  ibisStops: 5.5, priceMinorUsd: 389900 },
  { key: 'body.ax_hybrid',     label: 'AX Hybrid',      mount: 'mount.sony_e',  format: 'ff',    baseIso: 100, maxUsableIso: 25600, drStops: 14.0, readoutMs: 6.5,  cardSlots: 2, massG: 699, cipaFrames: 520,  weatherSealClass: 2, afLowLightEv: -4.5, burstFps: 20, bufferRaw: 150, ibisStops: 6.0, priceMinorUsd: 279900 },
  { key: 'body.ax_compact',    label: 'AX Compact',     mount: 'mount.sony_e',  format: 'ff',    baseIso: 100, maxUsableIso: 12800, drStops: 13.6, readoutMs: 27.0, cardSlots: 1, massG: 513, cipaFrames: 610,  weatherSealClass: 1, afLowLightEv: -3.0, burstFps: 10, bufferRaw: 60,  ibisStops: 5.0, priceMinorUsd: 199900 },
  { key: 'body.ax_apsc_sport', label: 'AX APS-C Sport', mount: 'mount.sony_e',  format: 'aps-c', baseIso: 100, maxUsableIso: 6400,  drStops: 13.1, readoutMs: 4.8,  cardSlots: 2, massG: 493, cipaFrames: 690,  weatherSealClass: 2, afLowLightEv: -3.5, burstFps: 23, bufferRaw: 180, ibisStops: 5.0, priceMinorUsd: 179900 },
  { key: 'body.ax_apsc_entry', label: 'AX APS-C Entry', mount: 'mount.sony_e',  format: 'aps-c', baseIso: 100, maxUsableIso: 3200,  drStops: 12.4, readoutMs: 34.0, cardSlots: 1, massG: 409, cipaFrames: 440,  weatherSealClass: 0, afLowLightEv: -2.0, burstFps: 8,  bufferRaw: 40,  ibisStops: 0,   priceMinorUsd:  99900 },
  { key: 'body.bz_flagship',   label: 'BZ Flagship',    mount: 'mount.canon_rf', format: 'ff',   baseIso: 100, maxUsableIso: 12800, drStops: 14.4, readoutMs: 2.8,  cardSlots: 2, massG: 1115, cipaFrames: 2850, weatherSealClass: 3, afLowLightEv: -6.0, burstFps: 40, bufferRaw: 320, ibisStops: 5.5, priceMinorUsd: 799900 },
  { key: 'body.bz_pro',        label: 'BZ Pro',         mount: 'mount.canon_rf', format: 'ff',   baseIso: 100, maxUsableIso: 12800, drStops: 14.6, readoutMs: 16.0, cardSlots: 2, massG: 738, cipaFrames: 760,  weatherSealClass: 2, afLowLightEv: -6.5, burstFps: 12, bufferRaw: 110, ibisStops: 8.0, priceMinorUsd: 429900 },
  { key: 'body.bz_hybrid',     label: 'BZ Hybrid',      mount: 'mount.canon_rf', format: 'ff',   baseIso: 100, maxUsableIso: 25600, drStops: 13.9, readoutMs: 14.5, cardSlots: 2, massG: 670, cipaFrames: 580,  weatherSealClass: 2, afLowLightEv: -6.0, burstFps: 15, bufferRaw: 130, ibisStops: 8.0, priceMinorUsd: 249900 },
  { key: 'body.bz_compact',    label: 'BZ Compact',     mount: 'mount.canon_rf', format: 'ff',   baseIso: 100, maxUsableIso: 12800, drStops: 13.4, readoutMs: 30.0, cardSlots: 1, massG: 461, cipaFrames: 470,  weatherSealClass: 1, afLowLightEv: -4.0, burstFps: 6,  bufferRaw: 50,  ibisStops: 0,   priceMinorUsd: 129900 },
  { key: 'body.bz_apsc',       label: 'BZ APS-C',       mount: 'mount.canon_rf', format: 'aps-c', baseIso: 100, maxUsableIso: 6400, drStops: 12.8, readoutMs: 25.0, cardSlots: 1, massG: 429, cipaFrames: 660,  weatherSealClass: 1, afLowLightEv: -4.5, burstFps: 15, bufferRaw: 70,  ibisStops: 0,   priceMinorUsd: 109900 },
  { key: 'body.legacy_slr',    label: 'Legacy SLR',     mount: 'mount.canon_ef', format: 'ff',   baseIso: 100, maxUsableIso: 3200,  drStops: 11.9, readoutMs: 0,    cardSlots: 2, massG: 890, cipaFrames: 900,  weatherSealClass: 2, afLowLightEv: -2.0, burstFps: 6,  bufferRaw: 35,  ibisStops: 0,   priceMinorUsd:  59900 },
];

type Lens = {
  key: string; label: string; mount: string; coversFormat: 'ff' | 'aps-c';
  focalMinMm: number; focalMaxMm: number; apertureMin: number; apertureMax: number;
  massG: number; osStops: number; weatherSealClass: 0 | 1 | 2 | 3; priceMinorUsd: number;
};

export const SEED_LENSES: readonly Lens[] = [
  { key: 'lens.ax_24_70_28',   label: 'AX 24-70mm f/2.8',  mount: 'mount.sony_e',  coversFormat: 'ff',    focalMinMm: 24,  focalMaxMm: 70,  apertureMin: 2.8, apertureMax: 2.8, massG: 695,  osStops: 0,   weatherSealClass: 2, priceMinorUsd: 229900 },
  { key: 'lens.ax_70_200_28',  label: 'AX 70-200mm f/2.8', mount: 'mount.sony_e',  coversFormat: 'ff',    focalMinMm: 70,  focalMaxMm: 200, apertureMin: 2.8, apertureMax: 2.8, massG: 1045, osStops: 5.5, weatherSealClass: 2, priceMinorUsd: 279900 },
  { key: 'lens.ax_35_14',      label: 'AX 35mm f/1.4',     mount: 'mount.sony_e',  coversFormat: 'ff',    focalMinMm: 35,  focalMaxMm: 35,  apertureMin: 1.4, apertureMax: 1.4, massG: 524,  osStops: 0,   weatherSealClass: 2, priceMinorUsd: 139900 },
  { key: 'lens.ax_85_18',      label: 'AX 85mm f/1.8',     mount: 'mount.sony_e',  coversFormat: 'ff',    focalMinMm: 85,  focalMaxMm: 85,  apertureMin: 1.8, apertureMax: 1.8, massG: 371,  osStops: 0,   weatherSealClass: 1, priceMinorUsd:  59900 },
  { key: 'lens.ax_200_600',    label: 'AX 200-600mm f/5.6-6.3', mount: 'mount.sony_e', coversFormat: 'ff', focalMinMm: 200, focalMaxMm: 600, apertureMin: 5.6, apertureMax: 6.3, massG: 2115, osStops: 4.0, weatherSealClass: 2, priceMinorUsd: 199900 },
  { key: 'lens.ax_24_105_f4',  label: 'AX 24-105mm f/4',   mount: 'mount.sony_e',  coversFormat: 'ff',    focalMinMm: 24,  focalMaxMm: 105, apertureMin: 4,   apertureMax: 4,   massG: 663,  osStops: 4.0, weatherSealClass: 2, priceMinorUsd: 129900 },
  { key: 'lens.ax_apsc_18_50', label: 'AX 18-50mm f/2.8 (APS-C)', mount: 'mount.sony_e', coversFormat: 'aps-c', focalMinMm: 18, focalMaxMm: 50, apertureMin: 2.8, apertureMax: 2.8, massG: 290, osStops: 0, weatherSealClass: 1, priceMinorUsd: 79900 },
  { key: 'lens.bz_24_70_28',   label: 'BZ 24-70mm f/2.8',  mount: 'mount.canon_rf', coversFormat: 'ff',   focalMinMm: 24,  focalMaxMm: 70,  apertureMin: 2.8, apertureMax: 2.8, massG: 900,  osStops: 5.0, weatherSealClass: 2, priceMinorUsd: 239900 },
  { key: 'lens.bz_70_200_28',  label: 'BZ 70-200mm f/2.8', mount: 'mount.canon_rf', coversFormat: 'ff',   focalMinMm: 70,  focalMaxMm: 200, apertureMin: 2.8, apertureMax: 2.8, massG: 1070, osStops: 5.0, weatherSealClass: 2, priceMinorUsd: 269900 },
  { key: 'lens.bz_28_70_f2',   label: 'BZ 28-70mm f/2',    mount: 'mount.canon_rf', coversFormat: 'ff',   focalMinMm: 28,  focalMaxMm: 70,  apertureMin: 2,   apertureMax: 2,   massG: 1430, osStops: 0,   weatherSealClass: 2, priceMinorUsd: 299900 },
  { key: 'lens.bz_100_500',    label: 'BZ 100-500mm f/4.5-7.1', mount: 'mount.canon_rf', coversFormat: 'ff', focalMinMm: 100, focalMaxMm: 500, apertureMin: 4.5, apertureMax: 7.1, massG: 1530, osStops: 5.0, weatherSealClass: 2, priceMinorUsd: 269900 },
  { key: 'lens.bz_24_105_f4',  label: 'BZ 24-105mm f/4',   mount: 'mount.canon_rf', coversFormat: 'ff',   focalMinMm: 24,  focalMaxMm: 105, apertureMin: 4,   apertureMax: 4,   massG: 700,  osStops: 5.0, weatherSealClass: 2, priceMinorUsd: 109900 },
  { key: 'lens.ef_70_200_28',  label: 'EF 70-200mm f/2.8', mount: 'mount.canon_ef', coversFormat: 'ff',   focalMinMm: 70,  focalMaxMm: 200, apertureMin: 2.8, apertureMax: 2.8, massG: 1480, osStops: 3.5, weatherSealClass: 2, priceMinorUsd:  89900 },
];

export const SEED_ADAPTERS = [
  { key: 'adapter.ef_to_rf', label: 'EF → RF adapter', fromMount: 'mount.canon_ef', toMount: 'mount.canon_rf', electronic: true, massG: 110, priceMinorUsd: 9900 },
  { key: 'adapter.ef_to_e',  label: 'EF → E adapter',  fromMount: 'mount.canon_ef', toMount: 'mount.sony_e',   electronic: true, massG: 145, priceMinorUsd: 34900 },
  { key: 'adapter.ef_to_rf_manual', label: 'EF → RF (mechanical)', fromMount: 'mount.canon_ef', toMount: 'mount.canon_rf', electronic: false, massG: 78, priceMinorUsd: 3900 },
] as const;

export const SEED_TELECONVERTERS = [
  { key: 'tc.ax_14x', label: 'AX 1.4x TC', mount: 'mount.sony_e',  magnification: 1.4, massG: 167, priceMinorUsd: 54900 },
  { key: 'tc.ax_20x', label: 'AX 2.0x TC', mount: 'mount.sony_e',  magnification: 2.0, massG: 207, priceMinorUsd: 59900 },
  { key: 'tc.bz_14x', label: 'BZ 1.4x TC', mount: 'mount.canon_rf', magnification: 1.4, massG: 225, priceMinorUsd: 49900 },
] as const;

export const SEED_ENTITY_COUNT =
  SEED_BODIES.length + SEED_LENSES.length + SEED_ADAPTERS.length + SEED_TELECONVERTERS.length;

export const asEntityId = (key: string): EntityId => key as EntityId;

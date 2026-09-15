/**
 * Mount geometry is public, stable, physical fact and is asserted directly by
 * the pack with source `manufacturer.spec`. Adapter feasibility is derived from
 * it, not hardcoded: an adapter is geometrically possible when the target
 * flange distance is shorter than the source's by enough to house the barrel.
 */
export type MountRecord = {
  readonly key: string;
  readonly label: string;
  readonly flangeDistanceMm: number;
  readonly throatDiameterMm: number;
  readonly kind: 'mirrorless' | 'slr';
  readonly maxSensorFormat: 'mft' | 'aps-c' | 'ff' | 'medium';
};

export const MOUNTS: readonly MountRecord[] = [
  { key: 'mount.sony_e',  label: 'Sony E',  flangeDistanceMm: 18,    throatDiameterMm: 46.1, kind: 'mirrorless', maxSensorFormat: 'ff' },
  { key: 'mount.canon_rf', label: 'Canon RF', flangeDistanceMm: 20,   throatDiameterMm: 54,   kind: 'mirrorless', maxSensorFormat: 'ff' },
  { key: 'mount.nikon_z',  label: 'Nikon Z',  flangeDistanceMm: 16,   throatDiameterMm: 55,   kind: 'mirrorless', maxSensorFormat: 'ff' },
  { key: 'mount.l',        label: 'L-Mount',  flangeDistanceMm: 20,   throatDiameterMm: 51.6, kind: 'mirrorless', maxSensorFormat: 'ff' },
  { key: 'mount.mft',      label: 'Micro Four Thirds', flangeDistanceMm: 19.25, throatDiameterMm: 38, kind: 'mirrorless', maxSensorFormat: 'mft' },
  { key: 'mount.canon_ef', label: 'Canon EF', flangeDistanceMm: 44,   throatDiameterMm: 54,   kind: 'slr',        maxSensorFormat: 'ff' },
  { key: 'mount.nikon_f',  label: 'Nikon F',  flangeDistanceMm: 46.5, throatDiameterMm: 44,   kind: 'slr',        maxSensorFormat: 'ff' },
];

export const MOUNT_INDEX: ReadonlyMap<string, MountRecord> = new Map(MOUNTS.map((m) => [m.key, m]));

/** Minimum barrel depth an adapter needs to be manufacturable. */
const MIN_ADAPTER_DEPTH_MM = 2;

export type AdapterFeasibility =
  | { readonly feasible: true; readonly barrelDepthMm: number; readonly vignettingRisk: 'none' | 'possible' }
  | { readonly feasible: false; readonly reason: 'insufficient_flange_clearance' | 'throat_too_narrow' };

export const adapterFeasibility = (fromMount: string, toBody: string): AdapterFeasibility => {
  const from = MOUNT_INDEX.get(fromMount);
  const to = MOUNT_INDEX.get(toBody);
  if (!from || !to) return { feasible: false, reason: 'insufficient_flange_clearance' };

  const depth = from.flangeDistanceMm - to.flangeDistanceMm;
  if (depth < MIN_ADAPTER_DEPTH_MM) return { feasible: false, reason: 'insufficient_flange_clearance' };
  if (to.throatDiameterMm < from.throatDiameterMm - 6) return { feasible: false, reason: 'throat_too_narrow' };

  return {
    feasible: true,
    barrelDepthMm: depth,
    vignettingRisk: to.throatDiameterMm < from.throatDiameterMm ? 'possible' : 'none',
  };
};

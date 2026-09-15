import type { LegacyDerivation } from '../derivation.js';

export const CAMERA_DERIVATIONS: readonly LegacyDerivation[] = [
  {
    derivationId: 'drv:effective_reach_mm', packId: 'camera.core', produces: 'effective_reach_mm',
    requires: ['focal_length_max_mm', 'sensor_crop_factor'], unit: 'mm',
    rationale: 'Reach is focal length scaled by sensor crop factor.',
    compute: (c) => c.value('focal_length_max_mm') * c.value('sensor_crop_factor'),
  },
  {
    derivationId: 'drv:low_light_stops', packId: 'camera.core', produces: 'low_light_stops',
    requires: ['dr_stops_base', 'max_aperture_f'], optional: ['ibis_stops'], unit: 'stops',
    rationale: 'Combines dynamic range, lens speed, and half-credit stabilisation.',
    compute: (c) => {
      const aperture = Math.max(0.7, c.value('max_aperture_f'));
      const ibis = c.has('ibis_stops') ? c.value('ibis_stops') * 0.5 : 0;
      return c.value('dr_stops_base') - Math.log2(aperture ** 2) + ibis;
    },
  },
  {
    derivationId: 'drv:burst_sustain_s', packId: 'camera.core', produces: 'burst_sustain_s',
    requires: ['burst_fps_mech', 'buffer_frames'], unit: 's',
    rationale: 'Buffer depth divided by mechanical burst rate.',
    compute: (c) => c.value('buffer_frames') / Math.max(1, c.value('burst_fps_mech')),
  },
];

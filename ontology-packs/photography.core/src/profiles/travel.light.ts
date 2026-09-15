import type { ActivityProfile } from './types.js';

export const travelLight: ActivityProfile = {
  id: 'activity.travel.light',
  version: '0.1.0',
  label: 'Travel — one bag',
  description:
    'Broad subject variety under a hard mass and volume ceiling, where the kit ' +
    'that gets carried beats the kit that performs better on a bench.',
  precedenceClass: 'profile',
  requirements: [
    {
      capabilityKey: 'handling.carry_mass',
      mode: 'hard',
      emphasis: 'critical',
      threshold: { comparator: 'lte', value: 1800, unit: 'g' },
      direction: 'minimize',
      rationale:
        'A hard ceiling, not a preference. Kit above roughly 1.8kg is measurably ' +
        'left in the hotel room, and a camera in a room has zero capability.',
    },
    {
      capabilityKey: 'framing.zoom_span',
      mode: 'soft',
      emphasis: 'high',
      threshold: { comparator: 'gte', value: 4, unit: 'ratio' },
      saturationAt: { value: 8, unit: 'ratio' },
      direction: 'maximize',
      rationale:
        'Single-lens coverage removes the swap that causes missed frames and sensor dust.',
    },
    {
      capabilityKey: 'lowlight.iso_headroom',
      mode: 'soft',
      emphasis: 'moderate',
      threshold: { comparator: 'gte', value: 4, unit: 'stop' },
      saturationAt: { value: 6.5, unit: 'stop' },
      direction: 'maximize',
      rationale: 'Interiors and evening streets, but rarely at professional deliverable standards.',
    },
    {
      capabilityKey: 'stabilization.handheld_gain',
      mode: 'soft',
      emphasis: 'high',
      saturationAt: { value: 5, unit: 'stop' },
      direction: 'maximize',
      rationale:
        'Substitutes directly for both tripod mass and sensor size in static scenes, ' +
        'which is the highest-leverage trade available under a weight ceiling.',
    },
    {
      capabilityKey: 'endurance.frames_per_charge',
      mode: 'soft',
      emphasis: 'moderate',
      threshold: { comparator: 'gte', value: 500, unit: 'frame' },
      saturationAt: { value: 1200, unit: 'frame' },
      direction: 'maximize',
      rationale: 'Charging access is unreliable; USB-PD support partially substitutes.',
    },
    {
      capabilityKey: 'resilience.weather',
      mode: 'soft',
      emphasis: 'moderate',
      direction: 'maximize',
      rationale: 'Itineraries are fixed in advance and weather is not.',
    },
  ],
  constraints: ['constraint.single_battery_family'],
  authoredBy: 'camefa.editorial',
  reviewedAt: '2026-01-15',
};

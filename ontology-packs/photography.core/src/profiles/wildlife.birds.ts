import type { ActivityProfile } from './types.js';

export const wildlifeBirds: ActivityProfile = {
  id: 'activity.wildlife.birds',
  version: '0.1.0',
  label: 'Wildlife — birds in flight',
  description:
    'Small, fast, unpredictable subjects at distance, frequently at dawn or dusk, ' +
    'where the decisive frame lasts a fraction of a second.',
  precedenceClass: 'profile',
  requirements: [
    {
      capabilityKey: 'framing.reach_equiv',
      mode: 'hard',
      emphasis: 'critical',
      threshold: { comparator: 'gte', value: 400, unit: 'mm' },
      saturationAt: { value: 840, unit: 'mm' },
      direction: 'maximize',
      rationale:
        'Below 400mm equivalent, most passerines and raptors occupy too few pixels ' +
        'to survive the crop. Past ~840mm, atmospheric distortion and handling ' +
        'error typically dominate optical gains.',
    },
    {
      capabilityKey: 'af.subject_tracking',
      mode: 'soft',
      emphasis: 'critical',
      direction: 'maximize',
      rationale:
        'Erratic flight paths against cluttered backgrounds are the hardest case ' +
        'for any tracking system; hit rate here is the single strongest predictor of keepers.',
    },
    {
      capabilityKey: 'capture.burst_depth',
      mode: 'soft',
      emphasis: 'high',
      threshold: { comparator: 'gte', value: 60, unit: 'frame' },
      saturationAt: { value: 180, unit: 'frame' },
      direction: 'maximize',
      rationale:
        'Wing position is not controllable; depth of buffer directly converts into ' +
        'the probability that one frame in the run has the pose.',
    },
    {
      capabilityKey: 'motion.rolling_shutter',
      mode: 'soft',
      emphasis: 'high',
      direction: 'minimize',
      saturationAt: { value: 5, unit: 'ms' },
      rationale: 'Fast lateral motion plus slow readout skews wings and beaks visibly.',
    },
    {
      capabilityKey: 'lowlight.iso_headroom',
      mode: 'soft',
      emphasis: 'high',
      threshold: { comparator: 'gte', value: 5, unit: 'stop' },
      saturationAt: { value: 7.5, unit: 'stop' },
      direction: 'maximize',
      rationale:
        'Long lenses are slow lenses, and the best light is the dimmest light; ' +
        'the combination pushes ISO harder than the hour alone suggests.',
    },
    {
      capabilityKey: 'handling.carry_mass',
      mode: 'soft',
      emphasis: 'high',
      direction: 'minimize',
      saturationAt: { value: 3800, unit: 'g' },
      rationale: 'Handheld long-lens work is limited by what can be held steady, not carried.',
    },
    {
      capabilityKey: 'resilience.weather',
      mode: 'soft',
      emphasis: 'high',
      direction: 'maximize',
      rationale: 'Field work is scheduled around subjects, not forecasts.',
    },
  ],
  constraints: ['constraint.teleconverter_af_penalty', 'constraint.tripod_collar_required'],
  authoredBy: 'camefa.editorial',
  reviewedAt: '2026-01-15',
};

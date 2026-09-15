import type { ActivityProfile } from './types.js';

export const weddingDocumentary: ActivityProfile = {
  id: 'activity.wedding.documentary',
  version: '0.1.0',
  label: 'Wedding — documentary',
  description:
    'Unrepeatable single-day event shot largely in available light, indoors and at dusk, ' +
    'with no opportunity to re-shoot and a client contract behind every frame.',
  precedenceClass: 'profile',
  requirements: [
    {
      capabilityKey: 'redundancy.card_slots',
      mode: 'hard',
      emphasis: 'critical',
      threshold: { comparator: 'gte', value: 2, unit: 'count' },
      rationale:
        'The event cannot be re-shot. A single card is a single point of total loss, ' +
        'and most wedding contracts are uninsurable against it.',
    },
    {
      capabilityKey: 'lowlight.iso_headroom',
      mode: 'soft',
      emphasis: 'critical',
      threshold: { comparator: 'gte', value: 6, unit: 'stop' },
      saturationAt: { value: 8.5, unit: 'stop' },
      direction: 'maximize',
      rationale:
        'Receptions run 4–6 stops under daylight. Beyond roughly 8.5 stops over base, ' +
        'the limiting factor becomes autofocus and subject motion, not sensor noise.',
    },
    {
      capabilityKey: 'af.lowlight_reliability',
      mode: 'soft',
      emphasis: 'critical',
      direction: 'maximize',
      rationale:
        'Missed focus at f/1.4 during a first dance is an unrecoverable frame; ' +
        'noise is recoverable, defocus is not.',
    },
    {
      capabilityKey: 'endurance.frames_per_charge',
      mode: 'soft',
      emphasis: 'high',
      threshold: { comparator: 'gte', value: 1400, unit: 'frame' },
      saturationAt: { value: 2600, unit: 'frame' },
      direction: 'maximize',
      rationale:
        'A twelve-hour day at typical documentary rates lands near 1400 frames per body; ' +
        'spare batteries mitigate but cost swap moments.',
    },
    {
      capabilityKey: 'motion.rolling_shutter',
      mode: 'soft',
      emphasis: 'moderate',
      direction: 'minimize',
      saturationAt: { value: 8, unit: 'ms' },
      rationale:
        'Matters chiefly under LED and discharge lighting where banding appears, ' +
        'and for silent-shutter use during ceremonies.',
    },
    {
      capabilityKey: 'handling.carry_mass',
      mode: 'soft',
      emphasis: 'moderate',
      direction: 'minimize',
      saturationAt: { value: 2600, unit: 'g' },
      rationale:
        'Two bodies carried for ten hours; mass compounds into late-day shot quality.',
    },
    {
      capabilityKey: 'resilience.weather',
      mode: 'soft',
      emphasis: 'moderate',
      direction: 'maximize',
      rationale: 'Outdoor ceremonies proceed in weather that the photographer does not choose.',
    },
    {
      capabilityKey: 'tonal.dynamic_range',
      mode: 'soft',
      emphasis: 'high',
      threshold: { comparator: 'gte', value: 12.5, unit: 'stop' },
      saturationAt: { value: 14.5, unit: 'stop' },
      direction: 'maximize',
      rationale:
        'White dress against a dark suit in mixed light is the canonical high-contrast ' +
        'subject; highlight recovery is the difference between a usable and a lost frame.',
    },
  ],
  constraints: ['constraint.dual_body_mount_parity', 'constraint.flash_sync_compat'],
  authoredBy: 'camefa.editorial',
  reviewedAt: '2026-01-15',
};

import { capabilityKey, unitKey, q } from '@camefa/engine-kernel';
import type { ActivityProfile, ActivityKey, RoleKey, SemVer } from '@camefa/engine-ontology';

const c = capabilityKey;
const u = unitKey;

export const WEDDING: ActivityProfile = {
  key: 'photo.wedding' as ActivityKey,
  label: 'Wedding photography',
  version: '1.0.0' as SemVer,
  aggregationP: -1, // strongly non-compensatory: one weak link disqualifies
  roles: [
    'role.body.primary', 'role.body.backup', 'role.lens.standard_zoom',
    'role.lens.fast_prime', 'role.light.on_camera',
  ] as RoleKey[],
  gates: [
    {
      capability: c('redundancy.card_slots'),
      op: 'gte', target: { kind: 'quantity', value: q(2, u('count')) }, emphasis: 'must',
      rationale: 'Wedding work is unrepeatable; a single card failure is an unrecoverable loss, so dual-slot backup is non-negotiable.',
    },
    {
      capability: c('lowlight.iso_headroom'),
      op: 'gte', target: { kind: 'quantity', value: q(4, u('stop')) }, emphasis: 'must',
      rationale: 'Receptions and ceremonies routinely require four stops above base ISO with flash prohibited.',
    },
  ],
  implies: [
    {
      capability: c('tonal.dynamic_range'),
      op: 'gte', target: { kind: 'quantity', value: q(13, u('stop')) }, emphasis: 'strongly_prefer',
      rationale: 'White dresses against dark suits under mixed lighting is the hardest highlight-and-shadow case in portraiture.',
    },
    {
      capability: c('af.lowlight_reliability'),
      op: 'lte', target: { kind: 'quantity', value: q(-3, u('EV')) }, emphasis: 'strongly_prefer',
      rationale: 'Candlelit and first-dance coverage demands focus acquisition well below normal indoor levels.',
    },
    {
      capability: c('endurance.frames_per_charge'),
      op: 'gte', target: { kind: 'quantity', value: q(1200, u('count')) }, emphasis: 'strongly_prefer',
      rationale: 'A ten to twelve hour day with limited opportunity to swap batteries during key coverage.',
    },
    {
      capability: c('handling.carry_mass'),
      op: 'lte', target: { kind: 'quantity', value: q(800, u('g')) }, emphasis: 'prefer',
      rationale: 'Twelve hours of dual-body carry makes operating mass a fatigue and injury issue, not a convenience.',
    },
    {
      capability: c('motion.rolling_shutter'),
      op: 'lte', target: { kind: 'quantity', value: q(20, u('ms')) }, emphasis: 'prefer',
      rationale: 'Silent electronic shutter is required during ceremonies, which exposes rolling shutter skew on movement.',
    },
    {
      capability: c('resilience.weather'),
      op: 'gte', emphasis: 'nice_to_have',
      rationale: 'Outdoor ceremonies proceed in weather the photographer does not get to choose.',
    },
  ],
};

export const ACTIVITIES: readonly ActivityProfile[] = [WEDDING];

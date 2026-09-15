/**
 * ADR-037/038: adapters do not merely permit attachment, they transform the
 * capability vector. Declaring the penalty as data means the expertise is
 * diffable and reviewable, and the solver picks it up for free.
 */
export const ADAPTER_CONSTRAINTS = [
  {
    key: 'constraint.adapter_af_penalty',
    version: '0.1.0',
    scope: 'configuration',
    when: { hasPart: 'adapter', partAttribute: 'adapter.electronic', equals: true },
    transform: [
      { capabilityKey: 'af.subject_tracking', op: 'scale', factor: 0.72 },
      { capabilityKey: 'af.lowlight_reliability', op: 'shift', delta: { value: -0.7, unit: 'stop' } },
      { capabilityKey: 'capture.burst_depth', op: 'scale', factor: 0.6 },
    ],
    penalty: 'moderate',
    rationale:
      'Adapted autofocus adds a protocol translation hop and typically falls back ' +
      'to a slower drive mode. The degradation is systematic, not brand-specific.',
  },
  {
    key: 'constraint.adapter_manual_only',
    version: '0.1.0',
    scope: 'configuration',
    when: { hasPart: 'adapter', partAttribute: 'adapter.electronic', equals: false },
    transform: [
      { capabilityKey: 'af.subject_tracking', op: 'set_unknown', reason: 'no_electronic_coupling' },
      { capabilityKey: 'af.lowlight_reliability', op: 'set_unknown', reason: 'no_electronic_coupling' },
    ],
    penalty: 'severe',
    rationale:
      'A purely mechanical adapter removes autofocus entirely. Setting the capability ' +
      'to unknown rather than zero is wrong here: it is known-absent, and the solver ' +
      'must treat that as a hard violation for any AF-dependent requirement.',
  },
  {
    key: 'constraint.teleconverter_af_penalty',
    version: '0.1.0',
    scope: 'configuration',
    when: { hasPart: 'teleconverter' },
    transform: [
      { capabilityKey: 'framing.reach_equiv', op: 'scale_by_part_attribute', attribute: 'tc.magnification' },
      { capabilityKey: 'optics.max_aperture', op: 'shift', delta: { value: 1, unit: 'stop' }, perMagnification: 1.4 },
      { capabilityKey: 'af.lowlight_reliability', op: 'shift', delta: { value: -1, unit: 'stop' } },
      { capabilityKey: 'optics.resolving_power', op: 'scale', factor: 0.85 },
    ],
    penalty: 'moderate',
    rationale:
      'A 1.4x converter costs exactly one stop of aperture by geometry, plus a ' +
      'measurable resolution and AF-sensitivity cost that varies by lens quality.',
  },
] as const;

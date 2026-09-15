import { q, unitKey } from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { ObservedSignal } from '../signal.js';
import type { ExifSummary, Facet } from './summarize.js';

/**
 * Confidence rises with sample size and saturates. A 10k-frame history is not
 * meaningfully more trustworthy than a 3k-frame one for a percentile statistic.
 */
const sampleConfidence = (n: number): number =>
  Math.min(0.92, 0.35 + 0.57 * (1 - Math.exp(-n / 900)));

type Emit = {
  capabilityKey: string;
  statistic: string;
  facet: Facet<number>;
  proposal: ObservedSignal['proposal'];
};

const emit = (e: Emit): ObservedSignal => ({
  kind: 'observed',
  source: 'exif',
  capabilityKey: e.capabilityKey,
  proposal: e.proposal,
  confidence: sampleConfidence(e.facet.n),
  evidence: { statistic: e.statistic, n: e.facet.n, value: e.facet.value },
});

/**
 * EXIF proposes floors from demonstrated behaviour, never ceilings. A user who
 * has never shot at ISO 12800 has not shown they don't need to — absence of
 * evidence produces no signal at all (ADR-023 applied to the signal layer).
 */
export const exifSignals = (s: ExifSummary, ont: CompiledOntology): ObservedSignal[] => {
  const out: ObservedSignal[] = [];

  if (s.isoStopsP90) {
    // Demonstrated working ISO plus one stop of headroom: shooting at the
    // ceiling is not shooting comfortably.
    out.push(
      emit({
        capabilityKey: 'lowlight.iso_headroom',
        statistic: 'iso_stops_p90+1',
        facet: s.isoStopsP90,
        proposal: {
          type: 'threshold',
          comparator: 'gte',
          value: q(s.isoStopsP90.value + 1, unitKey('stop')),
        },
      }),
    );
  }

  if (s.lightLimitedFraction && s.lightLimitedFraction.value >= 0.25) {
    out.push(
      emit({
        capabilityKey: 'af.lowlight_reliability',
        statistic: 'light_limited_fraction',
        facet: s.lightLimitedFraction,
        proposal: { type: 'emphasis', level: s.lightLimitedFraction.value >= 0.5 ? 'critical' : 'high' },
      }),
    );
  }

  if (s.reachMmP90) {
    out.push(
      emit({
        capabilityKey: 'framing.reach_equiv',
        statistic: 'reach_mm_p90',
        facet: s.reachMmP90,
        proposal: {
          type: 'threshold',
          comparator: 'gte',
          value: q(s.reachMmP90.value, unitKey('mm')),
        },
      }),
    );
  }

  if (s.shutterFastP10 && s.shutterFastP10.value <= 1 / 500) {
    // Habitually fast shutters imply moving subjects, which implies readout
    // speed matters for artificial light and panning.
    out.push(
      emit({
        capabilityKey: 'motion.rolling_shutter',
        statistic: 'shutter_fast_p10',
        facet: s.shutterFastP10,
        proposal: { type: 'emphasis', level: s.shutterFastP10.value <= 1 / 2000 ? 'high' : 'moderate' },
      }),
    );
  }

  if (s.burstRunP95 && s.burstRunP95.value >= 8) {
    out.push(
      emit({
        capabilityKey: 'capture.burst_depth',
        statistic: 'burst_run_p95',
        facet: s.burstRunP95,
        proposal: {
          type: 'threshold',
          comparator: 'gte',
          value: q(s.burstRunP95.value, unitKey('frame')),
        },
      }),
    );
  }

  if (s.framesPerSessionP90) {
    out.push(
      emit({
        capabilityKey: 'endurance.frames_per_charge',
        statistic: 'frames_per_session_p90',
        facet: s.framesPerSessionP90,
        proposal: {
          type: 'threshold',
          comparator: 'gte',
          // Sessions are not charge cycles; require 1.4x observed load.
          value: q(Math.ceil(s.framesPerSessionP90.value * 1.4), unitKey('frame')),
        },
      }),
    );
  }

  if (s.distinctBodies >= 2 && s.frames >= 800) {
    out.push({
      kind: 'observed',
      source: 'exif',
      capabilityKey: 'redundancy.card_slots',
      proposal: { type: 'emphasis', level: 'high' },
      confidence: 0.55,
      evidence: { statistic: 'distinct_bodies', n: s.frames, value: s.distinctBodies },
    });
  }

  return out.sort((a, b) => (a.capabilityKey < b.capabilityKey ? -1 : 1));
};

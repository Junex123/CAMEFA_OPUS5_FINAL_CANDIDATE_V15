import { entityId } from '@camefa/engine-kernel';
import { num, measured, bool, enumeration, type FixtureEntity } from '../fixture-resolver.js';

/** Well-documented full-frame stacked flagship: every primary strategy satisfiable. */
export const FLAGSHIP_FF: FixtureEntity = {
  id: entityId('01J0000000000000000000FF01'),
  entityType: 'gear.capture.body',
  label: 'Fixture Flagship FF',
  claims: {
    'manufacturer': { value: { kind: 'text', value: 'Fixture' }, evidenceClass: 'manufacturer', confidence: 1 },
    'generation_year': num(2023, 'count', 'manufacturer', 1),
    'sensor.width': num(35.9, 'mm'),
    'sensor.height': num(23.9, 'mm'),
    'sensor.effective_pixels': num(24.6, 'MP'),
    'sensor.readout_time': measured(4.8, 'ms'),
    'sensor.stacked': bool(true),
    'sensor.dr_measured': measured(14.4, 'stop'),
    'sensor.read_noise_high_gain': measured(1.1, 'count'),
    'sensor.base_iso': num(100, 'count'),
    'mount.key': enumeration('sony.e'),
    'mass.operating': num(737, 'g'),
    'mass.body_only': num(658, 'g'),
    'weather.sealing': enumeration('professional'),
    'ibis.rating': num(5.5, 'stop'),
    'af.low_light_limit': num(-4.0, 'EV'),
    'af.subject_detection': bool(true),
    'media.slot_count': num(2, 'count'),
    'video.max_bitrate': num(600, 'Mbps'),
    'video.max_bit_depth': num(10, 'count'),
    'video.chroma': enumeration('4:2:2'),
    'power.cipa_rating': num(580, 'count'),
    'power.capacity': num(16.4, 'Wh'),
  },
};

/** Sparse APS-C entry body: forces fallback strategies and one hard unknown. */
export const SPARSE_APSC: FixtureEntity = {
  id: entityId('01J0000000000000000000AP02'),
  entityType: 'gear.capture.body',
  label: 'Fixture Sparse APS-C',
  claims: {
    'generation_year': num(2019, 'count', 'manufacturer', 1),
    'sensor.width': num(23.5, 'mm'),
    'sensor.height': num(15.6, 'mm'),
    'sensor.effective_pixels': num(24.2, 'MP'),
    'sensor.stacked': bool(false),
    'mount.key': enumeration('sony.e'),
    'mass.body_only': num(503, 'g'),
    'weather.sealing': enumeration('light'),
    'media.slot_count': num(1, 'count'),
    'power.capacity': num(7.3, 'Wh'),
    // deliberately absent: dr_measured, read_noise, readout_time, af limit,
    // mass.operating, cipa_rating, all video attributes
  },
};

/** Non-body entity: exercises appliesTo gating. */
export const CFEXPRESS_CARD: FixtureEntity = {
  id: entityId('01J0000000000000000000MD03'),
  entityType: 'gear.media',
  label: 'Fixture CFexpress B 512GB',
  claims: {
    'media.write_throughput': measured(1400, 'MBps'),
    'mass.operating': num(11, 'g'),
  },
};

export const ALL_FIXTURES = [FLAGSHIP_FF, SPARSE_APSC, CFEXPRESS_CARD];

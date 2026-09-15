import { attributeKey, entityTypeKey, unitKey, D, dim } from '@camefa/engine-kernel';
import type { AttributeDefinition, ValueType } from '@camefa/engine-ontology';
import { MOUNTS } from './entity-types.js';

const a = attributeKey;
const t = entityTypeKey;
const u = unitKey;

const qty = (dimension: Parameters<typeof qtyRaw>[0], unit: string): ValueType =>
  ({ kind: 'quantity', dimension, canonicalUnit: u(unit) });
const qtyRaw = (d: typeof D.length) => d;

const staticSingle = (
  key: string, label: string, valueType: ValueType, appliesTo: readonly string[],
): AttributeDefinition => ({
  key: a(key), label, valueType, cardinality: 'single',
  temporality: 'static', appliesTo: appliesTo.map(t),
});

export const ATTRIBUTES: readonly AttributeDefinition[] = [
  // identity
  staticSingle('manufacturer', 'Manufacturer', { kind: 'text' }, ['gear']),
  staticSingle('announced_on', 'Announcement date', { kind: 'text' }, ['gear']),
  staticSingle('generation_year', 'Design generation', qty(D.dimensionless, 'count'), ['gear']),

  // sensor
  staticSingle('sensor.width', 'Sensor width', qty(D.length, 'mm'), ['gear.capture.body']),
  staticSingle('sensor.height', 'Sensor height', qty(D.length, 'mm'), ['gear.capture.body']),
  staticSingle('sensor.effective_pixels', 'Effective pixels', qty(D.dimensionless, 'MP'), ['gear.capture.body']),
  staticSingle('sensor.readout_time', 'Full-frame readout time', qty(D.time, 'ms'), ['gear.capture.body']),
  staticSingle('sensor.stacked', 'Stacked sensor', { kind: 'boolean' }, ['gear.capture.body']),
  staticSingle('sensor.dr_measured', 'Measured dynamic range', qty(D.dimensionless, 'stop'), ['gear.capture.body']),
  staticSingle('sensor.read_noise_high_gain', 'Read noise, high conversion gain', qty(D.dimensionless, 'count'), ['gear.capture.body']),
  staticSingle('sensor.base_iso', 'Base ISO', qty(D.dimensionless, 'count'), ['gear.capture.body']),

  // mount and mechanics
  staticSingle('mount.key', 'Mount', { kind: 'enum', values: MOUNTS }, ['gear.capture.body', 'gear.optic.lens']),
  staticSingle('mount.input', 'Adapter input mount', { kind: 'enum', values: MOUNTS }, ['gear.optic.adapter']),
  staticSingle('mount.output', 'Adapter output mount', { kind: 'enum', values: MOUNTS }, ['gear.optic.adapter']),
  staticSingle('mass.body_only', 'Mass, body only', qty(D.mass, 'g'), ['gear']),
  staticSingle('mass.operating', 'Mass, with battery and card', qty(D.mass, 'g'), ['gear']),
  staticSingle('weather.sealing', 'Weather sealing', { kind: 'enum', values: ['none', 'light', 'moderate', 'professional'] }, ['gear']),

  // stabilisation and autofocus
  staticSingle('ibis.rating', 'IBIS rating', qty(D.dimensionless, 'stop'), ['gear.capture.body']),
  staticSingle('af.points', 'AF points', qty(D.dimensionless, 'count'), ['gear.capture.body']),
  staticSingle('af.low_light_limit', 'AF low-light limit', qty(D.dimensionless, 'EV'), ['gear.capture.body']),
  staticSingle('af.subject_detection', 'Subject detection', { kind: 'boolean' }, ['gear.capture.body']),
  staticSingle('af.native_drive', 'Native AF drive', { kind: 'boolean' }, ['gear.optic.adapter']),

  // media and video
  staticSingle('media.slot_count', 'Card slot count', qty(D.dimensionless, 'count'), ['gear.capture.body']),
  staticSingle('media.write_throughput', 'Sustained write throughput', qty(D.bitrate, 'MBps'), ['gear.media']),
  staticSingle('video.max_bitrate', 'Maximum video bitrate', qty(D.bitrate, 'Mbps'), ['gear.capture.body']),
  staticSingle('video.max_bit_depth', 'Maximum bit depth', qty(D.dimensionless, 'count'), ['gear.capture.body']),
  staticSingle('video.chroma', 'Chroma subsampling', { kind: 'enum', values: ['4:2:0', '4:2:2', '4:4:4'] }, ['gear.capture.body']),
  staticSingle('video.record_limit', 'Continuous record limit', qty(D.time, 'min'), ['gear.capture.body']),

  // power
  staticSingle('power.capacity', 'Battery capacity', qty(D.energy, 'Wh'), ['gear.power', 'gear.capture.body']),
  staticSingle('power.cipa_rating', 'CIPA rated frames', qty(D.dimensionless, 'count'), ['gear.capture.body']),

  // compute
  staticSingle('compute.decode_throughput', 'Real-time decode throughput', qty(D.bitrate, 'Mbps'), ['gear.compute']),

  // commerce — temporal
  { key: a('price.msrp'), label: 'MSRP', valueType: { kind: 'money' }, cardinality: 'single', temporality: 'temporal', appliesTo: [t('gear')] },
  { key: a('price.street'), label: 'Street price', valueType: { kind: 'money' }, cardinality: 'single', temporality: 'temporal', appliesTo: [t('gear')] },
  { key: a('availability.status'), label: 'Availability', valueType: { kind: 'enum', values: ['in_stock', 'backorder', 'preorder', 'discontinued'] }, cardinality: 'single', temporality: 'temporal', appliesTo: [t('gear')] },
];

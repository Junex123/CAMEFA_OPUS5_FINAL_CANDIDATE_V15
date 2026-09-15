import { claimId, type Claim } from '@camefa/engine-knowledge';
import { SYNTHETIC_SOURCE, SEED_BODIES, SEED_LENSES, SEED_ADAPTERS, SEED_TELECONVERTERS, asEntityId } from './entities.js';
import { MOUNT_INDEX } from '../src/mounts.js';

const CROP: Record<string, number> = { ff: 1, 'aps-c': 1.5, mft: 2 };
const VALID_FROM = '2026-01-01T00:00:00.000Z';

type Emit = (entity: string, attribute: string, value: unknown, unit?: string) => Claim;

const makeEmit = (): { emit: Emit; claims: Claim[] } => {
  const claims: Claim[] = [];
  const emit: Emit = (entity, attribute, value, unit) => {
    const body = {
      entityId: asEntityId(entity),
      attributeKey: attribute,
      value: unit === undefined ? { kind: 'scalar' as const, value } : { kind: 'quantity' as const, value, unit },
      validFrom: VALID_FROM,
      validTo: null,
      sourceId: SYNTHETIC_SOURCE,
      confidence: 0.99,
      synthetic: true as const,
    };
    // ADR-020: identity is the content hash of the assertion, so re-seeding is
    // idempotent and produces zero duplicate rows.
    const c: Claim = { ...body, id: claimId(body) };
    claims.push(c);
    return c;
  };
  return { emit, claims };
};

export const buildSeedClaims = (): readonly Claim[] => {
  const { emit, claims } = makeEmit();

  for (const b of SEED_BODIES) {
    emit(b.key, 'entity.type', 'body');
    emit(b.key, 'entity.label', b.label);
    emit(b.key, 'body.mount', b.mount);
    emit(b.key, 'body.sensor_format', b.format);
    emit(b.key, 'body.crop_factor', CROP[b.format]!, 'ratio');
    emit(b.key, 'sensor.base_iso', b.baseIso, 'iso');
    emit(b.key, 'sensor.max_usable_iso', b.maxUsableIso, 'iso');
    emit(b.key, 'sensor.dynamic_range', b.drStops, 'stop');
    emit(b.key, 'sensor.readout_time', b.readoutMs, 'ms');
    emit(b.key, 'body.card_slots', b.cardSlots, 'count');
    emit(b.key, 'body.mass', b.massG, 'g');
    emit(b.key, 'body.cipa_rating', b.cipaFrames, 'frame');
    emit(b.key, 'body.weather_seal_class', b.weatherSealClass, 'count');
    emit(b.key, 'af.rated_low_light_ev', b.afLowLightEv, 'EV');
    emit(b.key, 'capture.max_fps', b.burstFps, 'fps');
    emit(b.key, 'capture.raw_buffer', b.bufferRaw, 'frame');
    emit(b.key, 'body.ibis_rating', b.ibisStops, 'stop');
    emit(b.key, 'commerce.price', b.priceMinorUsd, 'USD_minor');
  }

  for (const l of SEED_LENSES) {
    emit(l.key, 'entity.type', 'lens');
    emit(l.key, 'entity.label', l.label);
    emit(l.key, 'lens.mount', l.mount);
    emit(l.key, 'lens.covers_format', l.coversFormat);
    emit(l.key, 'lens.focal_min', l.focalMinMm, 'mm');
    emit(l.key, 'lens.focal_max', l.focalMaxMm, 'mm');
    emit(l.key, 'lens.aperture_wide_min_focal', l.apertureMin, 'fnumber');
    emit(l.key, 'lens.aperture_wide_max_focal', l.apertureMax, 'fnumber');
    emit(l.key, 'lens.mass', l.massG, 'g');
    emit(l.key, 'lens.os_rating', l.osStops, 'stop');
    emit(l.key, 'lens.weather_seal_class', l.weatherSealClass, 'count');
    emit(l.key, 'commerce.price', l.priceMinorUsd, 'USD_minor');
  }

  for (const a of SEED_ADAPTERS) {
    emit(a.key, 'entity.type', 'adapter');
    emit(a.key, 'entity.label', a.label);
    emit(a.key, 'adapter.from_mount', a.fromMount);
    emit(a.key, 'adapter.to_mount', a.toMount);
    emit(a.key, 'adapter.electronic', a.electronic);
    emit(a.key, 'adapter.mass', a.massG, 'g');
    emit(a.key, 'commerce.price', a.priceMinorUsd, 'USD_minor');

    const geom = MOUNT_INDEX.get(a.fromMount);
    const target = MOUNT_INDEX.get(a.toMount);
    if (geom && target) {
      emit(a.key, 'adapter.barrel_depth', geom.flangeDistanceMm - target.flangeDistanceMm, 'mm');
    }
  }

  for (const t of SEED_TELECONVERTERS) {
    emit(t.key, 'entity.type', 'teleconverter');
    emit(t.key, 'entity.label', t.label);
    emit(t.key, 'tc.mount', t.mount);
    emit(t.key, 'tc.magnification', t.magnification, 'ratio');
    emit(t.key, 'tc.mass', t.massG, 'g');
    emit(t.key, 'commerce.price', t.priceMinorUsd, 'USD_minor');
  }

  return claims;
};

/** Bootstrap guard. Synthetic data must never reach a production read path. */
export const assertNoSyntheticClaims = (claims: readonly Claim[]): void => {
  if (process.env.NODE_ENV !== 'production') return;
  const bad = claims.filter((c) => c.sourceId === SYNTHETIC_SOURCE);
  if (bad.length > 0) {
    throw new Error(
      `refusing to start: ${bad.length} synthetic claims reachable in production ` +
        `(first: ${bad[0]!.entityId}/${bad[0]!.attributeKey})`,
    );
  }
};

import {
  attributeKey, capabilityKey, derivationId, unitKey,
} from '@camefa/engine-kernel';
import { DerivationRegistry, type Derivation } from '@camefa/engine-capability';
import { value, ordinal, outOfDomain, strategy, clamp, generationUplift } from './derivation-helpers.js';

const a = attributeKey;
const c = capabilityKey;
const d = derivationId;

// Anchor: 36×24mm, 1.5e- high-gain read noise, 2015 design → 5.0 stops usable headroom.
const REF_AREA_MM2 = 864;
const REF_READ_NOISE_E = 1.5;
const REF_HEADROOM_STOPS = 5.0;

const areaMm2 = (w: number | undefined, h: number | undefined): number | undefined =>
  w === undefined || h === undefined ? undefined : w * h;

export const lowlightIsoHeadroom: Derivation = {
  id: d('lowlight.iso_headroom@1'),
  capability: c('lowlight.iso_headroom'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    // Measured read noise: SNR-limited headroom from area and per-electron noise floor.
    strategy(
      'primary',
      [a('sensor.width'), a('sensor.height'), a('sensor.read_noise_high_gain')],
      1.0,
      'inherit',
      (i) => {
        const area = areaMm2(i.number(a('sensor.width')), i.number(a('sensor.height')));
        const noise = i.number(a('sensor.read_noise_high_gain'));
        if (area === undefined || noise === undefined) return outOfDomain('missing sensor geometry');
        if (area <= 0 || noise <= 0) return outOfDomain('non-positive sensor area or read noise');
        const stops =
          REF_HEADROOM_STOPS +
          Math.log2(area / REF_AREA_MM2) +
          Math.log2(REF_READ_NOISE_E / noise);
        return value(clamp(stops, 0, 10), 'stop');
      },
    ),
    // No noise measurement: area plus design generation.
    strategy(
      'fallback',
      [a('sensor.width'), a('sensor.height')],
      0.72,
      'inferred',
      (i) => {
        const area = areaMm2(i.number(a('sensor.width')), i.number(a('sensor.height')));
        if (area === undefined || area <= 0) return outOfDomain('missing sensor geometry');
        const stops =
          REF_HEADROOM_STOPS +
          Math.log2(area / REF_AREA_MM2) +
          generationUplift(i.number(a('generation_year')));
        return value(clamp(stops, 0, 10), 'stop');
      },
    ),
  ],
};

export const tonalDynamicRange: Derivation = {
  id: d('tonal.dynamic_range@1'),
  capability: c('tonal.dynamic_range'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('sensor.dr_measured')], 1.0, 'inherit', (i) => {
      const dr = i.number(a('sensor.dr_measured'));
      return dr === undefined ? outOfDomain('missing measurement') : value(clamp(dr, 6, 17), 'stop');
    }),
    strategy(
      'fallback',
      [a('sensor.width'), a('sensor.height')],
      0.65,
      'inferred',
      (i) => {
        const area = areaMm2(i.number(a('sensor.width')), i.number(a('sensor.height')));
        if (area === undefined || area <= 0) return outOfDomain('missing sensor geometry');
        // 2015 full-frame baseline ≈ 13.2 stops; area contributes at roughly half a stop per doubling.
        const dr = 13.2 + 0.5 * Math.log2(area / REF_AREA_MM2) + generationUplift(i.number(a('generation_year')));
        return value(clamp(dr, 6, 17), 'stop');
      },
    ),
  ],
};

export const motionRollingShutter: Derivation = {
  id: d('motion.rolling_shutter@1'),
  capability: c('motion.rolling_shutter'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('sensor.readout_time')], 1.0, 'inherit', (i) => {
      const t = i.number(a('sensor.readout_time'));
      return t === undefined || t <= 0 ? outOfDomain('missing readout time') : value(t, 'ms');
    }),
    strategy('fallback', [a('sensor.stacked')], 0.5, 'inferred', (i) =>
      value(i.boolean(a('sensor.stacked')) === true ? 6 : 26, 'ms'),
    ),
  ],
};

export const afLowlightReliability: Derivation = {
  id: d('af.lowlight_reliability@1'),
  capability: c('af.lowlight_reliability'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('af.low_light_limit')], 1.0, 'inherit', (i) => {
      const limit = i.number(a('af.low_light_limit'));
      if (limit === undefined) return outOfDomain('missing AF rating');
      // Manufacturer limits assume f/1.2 and a static subject. Subject detection buys
      // roughly half a stop of practical acquisition reliability on moving subjects.
      const detection = i.boolean(a('af.subject_detection')) === true ? -0.5 : 0;
      return value(clamp(limit + detection, -8, 3), 'EV');
    }),
    strategy('fallback', [a('generation_year')], 0.45, 'inferred', (i) => {
      const year = i.number(a('generation_year'));
      if (year === undefined) return outOfDomain('missing generation');
      return value(clamp(-1 - (year - 2015) * 0.25, -8, 3), 'EV');
    }),
  ],
};

const TYPICAL_BATTERY_AND_CARD_G = 90;

export const handlingCarryMass: Derivation = {
  id: d('handling.carry_mass@1'),
  capability: c('handling.carry_mass'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('mass.operating')], 1.0, 'inherit', (i) => {
      const m = i.number(a('mass.operating'));
      return m === undefined || m <= 0 ? outOfDomain('missing mass') : value(m, 'g');
    }),
    strategy('fallback', [a('mass.body_only')], 0.85, 'inferred', (i) => {
      const m = i.number(a('mass.body_only'));
      return m === undefined || m <= 0
        ? outOfDomain('missing mass')
        : value(m + TYPICAL_BATTERY_AND_CARD_G, 'g');
    }),
  ],
};

export const redundancyCardSlots: Derivation = {
  id: d('redundancy.card_slots@1'),
  capability: c('redundancy.card_slots'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('media.slot_count')], 1.0, 'inherit', (i) => {
      const n = i.number(a('media.slot_count'));
      return n === undefined || n < 0 ? outOfDomain('missing slot count') : value(Math.floor(n), 'count');
    }),
  ],
};

// CIPA is deliberately pessimistic; field shooting with review discipline
// runs well above rating. 1.8× is the conservative end of observed practice.
const CIPA_FIELD_MULTIPLIER = 1.8;
const FRAMES_PER_WH = 145;

export const enduranceFramesPerCharge: Derivation = {
  id: d('endurance.frames_per_charge@1'),
  capability: c('endurance.frames_per_charge'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('power.cipa_rating')], 1.0, 'inherit', (i) => {
      const cipa = i.number(a('power.cipa_rating'));
      return cipa === undefined || cipa <= 0
        ? outOfDomain('missing CIPA rating')
        : value(Math.round(cipa * CIPA_FIELD_MULTIPLIER), 'count');
    }),
    strategy('fallback', [a('power.capacity')], 0.6, 'inferred', (i) => {
      const wh = i.number(a('power.capacity'));
      return wh === undefined || wh <= 0
        ? outOfDomain('missing battery capacity')
        : value(Math.round(wh * FRAMES_PER_WH), 'count');
    }),
  ],
};

const BIT_DEPTH_LOAD: Record<number, number> = { 8: 1.0, 10: 1.35, 12: 1.7, 16: 2.2 };
const CHROMA_LOAD: Record<string, number> = { '4:2:0': 1.0, '4:2:2': 1.4, '4:4:4': 1.8 };

export const videoCodecLoad: Derivation = {
  id: d('video.codec_load@1'),
  capability: c('video.codec_load'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('video.max_bitrate')], 1.0, 'inherit', (i) => {
      const bitrate = i.number(a('video.max_bitrate'));
      if (bitrate === undefined || bitrate <= 0) return outOfDomain('missing bitrate');
      const depth = BIT_DEPTH_LOAD[i.number(a('video.max_bit_depth')) ?? 8] ?? 1.0;
      const chroma = CHROMA_LOAD[i.enumValue(a('video.chroma')) ?? '4:2:0'] ?? 1.0;
      return value(Math.round(bitrate * depth * chroma), 'Mbps');
    }),
  ],
};

export const resilienceWeather: Derivation = {
  id: d('resilience.weather@1'),
  capability: c('resilience.weather'),
  version: '1.0.0',
  confidenceCombinator: 'min',
  strategies: [
    strategy('primary', [a('weather.sealing')], 1.0, 'inherit', (i) => {
      const level = i.enumValue(a('weather.sealing'));
      return level === undefined ? outOfDomain('missing sealing grade') : ordinal(level);
    }),
  ],
};

export const PHOTOGRAPHY_DERIVATIONS: readonly Derivation[] = [
  lowlightIsoHeadroom, tonalDynamicRange, motionRollingShutter, afLowlightReliability,
  handlingCarryMass, redundancyCardSlots, enduranceFramesPerCharge, videoCodecLoad,
  resilienceWeather,
];

export const photographyDerivationRegistry = (): DerivationRegistry => {
  const registry = new DerivationRegistry();
  for (const derivation of PHOTOGRAPHY_DERIVATIONS) registry.register(derivation);
  return registry;
};

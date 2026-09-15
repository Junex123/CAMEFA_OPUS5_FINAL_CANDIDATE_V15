import {
  linearUnit, affineUnit, logUnit, dim, D, packId,
  type UnitDefinition,
} from '@camefa/engine-kernel';
import { emptyPack, type OntologyPack } from '@camefa/engine-ontology';
import type { SemVer } from '@camefa/engine-ontology';

export const D_EXT = {
  illuminance: dim({ luminous: 1, length: -2 }),
  frequency: dim({ time: -1 }),
  charge: dim({ current: 1, time: 1 }),
} as const;

export const CORE_UNITS: readonly UnitDefinition[] = [
  // length — canonical metre
  linearUnit('m', 'metre', D.length, 1),
  linearUnit('cm', 'centimetre', D.length, 1e-2),
  linearUnit('mm', 'millimetre', D.length, 1e-3),
  linearUnit('um', 'micrometre', D.length, 1e-6),

  // mass — canonical kilogram
  linearUnit('kg', 'kilogram', D.mass, 1),
  linearUnit('g', 'gram', D.mass, 1e-3),

  // time — canonical second
  linearUnit('s', 'second', D.time, 1),
  linearUnit('ms', 'millisecond', D.time, 1e-3),
  linearUnit('min', 'minute', D.time, 60),
  linearUnit('h', 'hour', D.time, 3600),

  // information — canonical bit
  linearUnit('bit', 'bit', D.information, 1),
  linearUnit('byte', 'byte', D.information, 8),
  linearUnit('MB', 'megabyte', D.information, 8e6),
  linearUnit('GB', 'gigabyte', D.information, 8e9),
  linearUnit('TB', 'terabyte', D.information, 8e12),

  // bitrate — canonical bit per second
  linearUnit('bps', 'bit per second', D.bitrate, 1),
  linearUnit('Mbps', 'megabit per second', D.bitrate, 1e6),
  linearUnit('MBps', 'megabyte per second', D.bitrate, 8e6),

  // angle — canonical radian
  linearUnit('rad', 'radian', D.angle, 1),
  linearUnit('deg', 'degree', D.angle, Math.PI / 180),

  // energy — canonical joule
  linearUnit('J', 'joule', D.energy, 1),
  linearUnit('Wh', 'watt hour', D.energy, 3600),

  // temperature — canonical kelvin
  linearUnit('K', 'kelvin', dim({ temperature: 1 }), 1),
  affineUnit('degC', 'degree Celsius', dim({ temperature: 1 }), 1, 273.15),

  // illuminance, frequency, charge
  linearUnit('lux', 'lux', D_EXT.illuminance, 1),
  linearUnit('fps', 'frame per second', D_EXT.frequency, 1),
  linearUnit('mAh', 'milliamp hour', D_EXT.charge, 3.6),

  // dimensionless counts
  linearUnit('count', 'count', D.dimensionless, 1),
  linearUnit('MP', 'megapixel', D.dimensionless, 1e6),
  linearUnit('ratio', 'ratio', D.dimensionless, 1),
  linearUnit('percent', 'percent', D.dimensionless, 1e-2),

  // logarithmic ratios — non-additive by contract
  logUnit('stop', 'stop', D.dimensionless, 2),
  logUnit('EV', 'exposure value', D.dimensionless, 2),
];

export const coreUnitsPack: OntologyPack = {
  ...emptyPack(packId('core.units'), '1.0.0' as SemVer),
  units: CORE_UNITS,
};

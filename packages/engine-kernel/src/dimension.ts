export const BASE_DIMENSIONS = [
  'length', 'mass', 'time', 'current',
  'temperature', 'luminous', 'information', 'angle',
] as const;

export type BaseDimension = (typeof BASE_DIMENSIONS)[number];
export type Dimension = Readonly<Record<BaseDimension, number>>;

const zero = (): Record<BaseDimension, number> =>
  Object.fromEntries(BASE_DIMENSIONS.map((d) => [d, 0])) as Record<BaseDimension, number>;

export const DIMENSIONLESS: Dimension = Object.freeze(zero());

export const dim = (p: Partial<Record<BaseDimension, number>>): Dimension =>
  Object.freeze({ ...zero(), ...p });

const combine = (a: Dimension, b: Dimension, sign: 1 | -1): Dimension =>
  Object.freeze(
    Object.fromEntries(
      BASE_DIMENSIONS.map((d) => [d, a[d] + sign * b[d]]),
    ) as Record<BaseDimension, number>,
  );

export const mulDim = (a: Dimension, b: Dimension): Dimension => combine(a, b, 1);
export const divDim = (a: Dimension, b: Dimension): Dimension => combine(a, b, -1);

export const dimEquals = (a: Dimension, b: Dimension): boolean =>
  BASE_DIMENSIONS.every((d) => a[d] === b[d]);

export const formatDimension = (d: Dimension): string => {
  const parts = BASE_DIMENSIONS.filter((k) => d[k] !== 0).map((k) => `${k}^${d[k]}`);
  return parts.length === 0 ? 'dimensionless' : parts.join('·');
};

export const D = {
  length: dim({ length: 1 }),
  area: dim({ length: 2 }),
  mass: dim({ mass: 1 }),
  time: dim({ time: 1 }),
  angle: dim({ angle: 1 }),
  information: dim({ information: 1 }),
  bitrate: dim({ information: 1, time: -1 }),
  energy: dim({ mass: 1, length: 2, time: -2 }),
  dimensionless: DIMENSIONLESS,
} as const;

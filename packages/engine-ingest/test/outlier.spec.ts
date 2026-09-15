import { describe, expect, it } from 'vitest';
import { flagOutliers, type OutlierContext } from '../src/outlier.js';
import type { ParsedClaim } from '../src/parse/index.js';

const claim = (attribute: string, value: number): ParsedClaim => ({
  attribute,
  value,
  unit: 'g',
  rawText: String(value),
  outlierFlags: [],
});

const ctx = (over: Partial<OutlierContext> = {}): OutlierContext => ({
  plausible: () => ({ min: 200, max: 2000 }),
  peers: () => [],
  jnd: () => 5,
  ...over,
});

describe('flagOutliers', () => {
  it('flags rather than drops an implausible value', () => {
    const [f] = flagOutliers('e:1', [claim('weight_g', 50)], ctx());
    expect(f.outlierFlags).toContain('below_plausible_range');
    expect(f.value).toBe(50);
  });

  it('identifies a likely unit error by its suspicious factor', () => {
    const [f] = flagOutliers('e:1', [claim('weight_g', 670000)], ctx());
    expect(f.outlierFlags).toContain('suspected_unit_error_x1000');
  });

  it('flags a value deviating far from its peers', () => {
    const [f] = flagOutliers(
      'e:1',
      [claim('weight_g', 1900)],
      ctx({ peers: () => [670, 672, 668, 671] }),
    );
    expect(f.outlierFlags).toContain('deviates_from_peers');
  });

  it('does not flag ordinary spread among peers', () => {
    const [f] = flagOutliers(
      'e:1',
      [claim('weight_g', 674)],
      ctx({ peers: () => [670, 672, 668, 671] }),
    );
    expect(f.outlierFlags).not.toContain('deviates_from_peers');
  });

  it('uses the jnd as a floor so tight clusters do not flag everything', () => {
    const [f] = flagOutliers(
      'e:1',
      [claim('weight_g', 678)],
      ctx({ peers: () => [670, 670, 670, 670], jnd: () => 5 }),
    );
    expect(f.outlierFlags).not.toContain('deviates_from_peers');
  });

  it('needs at least three peers before comparing', () => {
    const [f] = flagOutliers('e:1', [claim('weight_g', 1900)], ctx({ peers: () => [670, 672] }));
    expect(f.outlierFlags).not.toContain('deviates_from_peers');
  });

  it('preserves flags the parser already set', () => {
    const [f] = flagOutliers(
      'e:1',
      [{ ...claim('weight_g', 700), outlierFlags: ['source_approximate'] }],
      ctx(),
    );
    expect(f.outlierFlags).toContain('source_approximate');
  });

  it('skips range checks when no plausible range is declared', () => {
    const [f] = flagOutliers('e:1', [claim('weight_g', 1)], ctx({ plausible: () => null }));
    expect(f.outlierFlags).toEqual([]);
  });
});

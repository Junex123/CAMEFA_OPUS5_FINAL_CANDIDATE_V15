import type { EngineVersionTriplet } from '@camefa/engine-contracts';

export function EngineTripletCard({ engine }: { engine: EngineVersionTriplet }) {
  const rows: [string, string | null][] = [
    ['ontology', engine.ontologyFingerprint],
    ['model', engine.modelRef],
    ['calibration', engine.calibrationRef ?? null],
    ['reliability', engine.reliabilityFingerprint ?? null],
  ];
  return (
    <dl className="triplet">
      {rows.map(([k, v]) => (
        <div key={k} className={v ? '' : 'is-missing'}>
          <dt>{k}</dt>
          <dd>
            <code>{v ?? 'absent'}</code>
          </dd>
        </div>
      ))}
    </dl>
  );
}

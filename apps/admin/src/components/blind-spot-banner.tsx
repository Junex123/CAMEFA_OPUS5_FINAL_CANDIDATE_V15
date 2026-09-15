import type { BlindSpotReport } from '@camefa/engine-adjudication';

export function BlindSpotBanner({ report }: { report: BlindSpotReport }) {
  const tone = report.underPowered ? 'warn' : report.blindSpot ? 'bad' : 'good';
  return (
    <div className={`badge badge--${tone}`} role="status">
      <strong>
        {report.underPowered
          ? 'Insufficient data'
          : report.blindSpot
            ? 'Targeting blind spot'
            : 'Targeting is representative'}
      </strong>
      <p className="muted">{report.narrative}</p>
      {report.byStratum.length > 0 && (
        <table className="strata">
          <thead>
            <tr>
              <th scope="col">Stratum</th>
              <th scope="col">n</th>
              <th scope="col">Surprise rate</th>
              <th scope="col">Mean abs error</th>
              <th scope="col">Signed</th>
            </tr>
          </thead>
          <tbody>
            {report.byStratum.map((s) => (
              <tr key={s.stratum} className={s.biased ? 'is-biased' : ''}>
                <th scope="row">{s.stratum}</th>
                <td className="num">{s.n}</td>
                <td className="num">{(s.surpriseRate * 100).toFixed(0)}%</td>
                <td className="num">{s.meanAbsError.toFixed(3)}</td>
                <td className="num">
                  {s.meanSignedError >= 0 ? '+' : ''}
                  {s.meanSignedError.toFixed(3)}
                  {s.biased && <span className="tag">systematic</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

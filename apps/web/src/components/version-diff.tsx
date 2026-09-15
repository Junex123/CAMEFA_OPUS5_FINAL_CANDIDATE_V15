import type { DiffDimension, ReceiptDiff } from '@camefa/engine-contracts';

export function VersionDiff({
  versions,
  changed,
}: {
  versions: ReceiptDiff['versions'];
  changed: DiffDimension[];
}) {
  const changedSet = new Set(changed);
  return (
    <table className="versions">
      <thead>
        <tr>
          <th scope="col">Dimension</th>
          <th scope="col">A</th>
          <th scope="col">B</th>
        </tr>
      </thead>
      <tbody>
        {(Object.keys(versions) as DiffDimension[]).map((d) => (
          <tr key={d} className={changedSet.has(d) ? 'is-changed' : ''}>
            <th scope="row">{d}</th>
            <td>
              <code>{versions[d].a ?? 'absent'}</code>
            </td>
            <td>
              <code>{versions[d].b ?? 'absent'}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

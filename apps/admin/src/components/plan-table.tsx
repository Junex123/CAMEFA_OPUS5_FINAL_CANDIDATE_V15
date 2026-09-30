export function PlanTable({ rows }: { rows: readonly unknown[]; planId?: string; showValue?: boolean }) {
  return rows.length === 0 ? <p className="muted">No measurement tickets are configured.</p> : (
    <table><tbody>{rows.map((row, i) => <tr key={i}><td><code>{String(row)}</code></td>{showValue && <td>pending</td>}</tr>)}</tbody></table>
  );
}

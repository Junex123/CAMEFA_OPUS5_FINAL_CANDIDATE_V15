export function CostPanel({ cost }: { cost: Record<string, number> }) {
  const rows = Object.entries(cost).sort(([a], [b]) => a.localeCompare(b));
  if (rows.length === 0) return null;
  return (
    <dl className="cost">
      {rows.map(([dim, spent]) => (
        <div key={dim}>
          <dt>{dim}</dt>
          <dd>{spent.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

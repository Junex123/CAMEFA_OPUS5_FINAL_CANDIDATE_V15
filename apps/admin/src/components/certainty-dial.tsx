'use client';

export function CertaintyDial({ value, onChange }: { value: 1 | 2 | 3 | 4 | 5; onChange: (value: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <label className="mt-6 block text-sm">
      Certainty
      <select className="ml-2 rounded border px-2 py-1" value={value} onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

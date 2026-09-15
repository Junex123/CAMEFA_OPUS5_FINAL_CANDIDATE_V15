import type { GateReport } from './gate.js';
import type { ReplayRun } from './replay.js';

const VERDICT_LINE: Record<GateReport['verdict'], string> = {
  pass: '✅ **pass** — no movement beyond noise.',
  pass_with_churn: '🟡 **pass with churn** — within budget, review before shipping.',
  fail: '🔴 **fail** — blocking findings below.',
};

export function renderMarkdown(
  run: ReplayRun,
  gate: GateReport,
  webBaseUrl: string,
): string {
  const m = gate.metrics;
  const lines: string[] = [];

  lines.push('## Camefa decision regression');
  lines.push('');
  lines.push(VERDICT_LINE[gate.verdict]);
  lines.push('');
  lines.push(
    `Golden set \`${run.setId}\` @ \`${run.goldenFingerprint.slice(0, 12)}\` · ` +
      `calibration \`${run.candidateEngine.calibrationRef ?? 'absent'}\` · ` +
      `ontology \`${run.candidateEngine.ontologyFingerprint.slice(0, 12)}\``,
  );
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(`| questions compared | ${m.compared}/${m.total} |`);
  lines.push(
    `| winner flips | ${m.winnerFlips} (${(m.winnerFlipRate * 100).toFixed(1)}%) |`,
  );
  lines.push(`| τ p95 / mean | ${m.tauP95.toFixed(3)} / ${m.tauMean.toFixed(3)} |`);
  lines.push(`| elimination flips | ${m.eliminationFlips} |`);
  lines.push(`| anchor regressions | ${m.anchorFailures} |`);
  lines.push(`| editorial disagreements | ${m.editorialFailures} |`);
  lines.push(`| determinism violations | ${m.determinismViolations} |`);
  for (const [dim, v] of Object.entries(m.costP95)) {
    lines.push(`| p95 ${dim} | ${v} |`);
  }
  lines.push('');

  for (const f of gate.findings) {
    lines.push(
      `### ${f.severity === 'blocking' ? '🔴' : '🟡'} ${f.code} (${f.questionKeys.length})`,
    );
    lines.push('');
    lines.push(f.message);
    if (f.questionKeys.length > 0) {
      lines.push('');
      for (const key of f.questionKeys.slice(0, 10)) {
        const r = run.results.find((x) => x.questionKey === key);
        const link =
          r?.diff && webBaseUrl
            ? ` — [diff](${webBaseUrl}/r/${r.diff.a}/vs/${r.diff.b})`
            : '';
        lines.push(`- \`${key}\`${link}`);
      }
      if (f.questionKeys.length > 10) {
        lines.push(`- …and ${f.questionKeys.length - 10} more`);
      }
    }
    lines.push('');
  }

  if (gate.waiversApplied.length > 0) {
    lines.push(
      `<sub>Waivers applied: ${gate.waiversApplied.map((k) => `\`${k}\``).join(', ')}</sub>`,
    );
  }

  return lines.join('\n');
}

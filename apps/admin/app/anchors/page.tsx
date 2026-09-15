import { fetchBlindSpots, fetchPlan } from '@/lib/anchors';
import { PlanTable } from '@/components/plan-table';
import { BlindSpotBanner } from '@/components/blind-spot-banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Anchors · Camefa admin' };

export default async function AnchorsPage({
  searchParams,
}: {
  searchParams: { budget?: string };
}) {
  const [plan, blindSpots] = await Promise.all([
    fetchPlan(searchParams.budget),
    fetchBlindSpots(),
  ]);

  return (
    <main className="anchors">
      <header>
        <p className="eyebrow">Measurement plan</p>
        <h1>Anchors</h1>
        <p className="muted">
          Plan <code>{plan.planId}</code> · {plan.spentMinutes} of{' '}
          {plan.budgetMinutes} minutes allocated ·{' '}
          {plan.targeted.length} targeted, {plan.exploratory.length} blind
          {plan.skippedInfeasible > 0 &&
            ` · ${plan.skippedInfeasible} skipped as not measurable`}
        </p>
      </header>

      <BlindSpotBanner report={blindSpots} />

      <section aria-labelledby="targeted">
        <h2 id="targeted">Targeted</h2>
        <p className="muted">
          Ranked by expected gate coverage and decision impact per minute of
          effort. Stratum cap prevents one attribute family from consuming the
          batch.
        </p>
        <PlanTable rows={plan.targeted} planId={plan.planId} showValue />
      </section>

      <section aria-labelledby="blind">
        <h2 id="blind">Blind sample</h2>
        <p className="muted">
          Drawn uniformly at random, stratified, without reference to what the
          engine currently believes. These exist to find places the engine is
          confident and wrong — the errors targeting cannot see. Do not skip
          them because they look unimportant; that judgement is the bias.
        </p>
        <PlanTable rows={plan.exploratory} planId={plan.planId} />
      </section>
    </main>
  );
}

# Seed graph — SYNTHETIC

Every entity in this directory is a **synthetic archetype**, not a real product.
Claims are emitted with `sourceId: 'seed.synthetic'` and `reliability: 0`.

Mount geometry in `src/mounts.ts` is real, public, physical fact and is
separately sourced as `manufacturer.spec`.

## Why the split

A provenance engine that ships with plausible-looking unsourced numbers about
real products is worse than one that ships with none: the numbers get cited,
the citations look legitimate, and the trust surface is compromised before the
first real ingestion run.

`assertNoSyntheticClaims()` runs in the gateway bootstrap and refuses to start
when `NODE_ENV=production` and any synthetic claim is reachable.

import {
  UnitRegistry, sha256, dimEquals, unitFingerprintOf,
  type Result, ok, err,
  type AttributeKey, type CapabilityKey, type EntityTypeKey,
  type OntologyError, type Fingerprint,
} from '@camefa/engine-kernel';
import type { OntologyPack } from './pack.js';
import type {
  AttributeDefinition, CapabilityDefinition, EntityTypeDefinition,
  ActivityProfile, ActivityKey,
} from './definitions.js';

export interface CompiledOntology {
  readonly fingerprint: Fingerprint;
  readonly units: UnitRegistry;
  readonly entityTypes: ReadonlyMap<EntityTypeKey, EntityTypeDefinition>;
  readonly attributes: ReadonlyMap<AttributeKey, AttributeDefinition>;
  readonly capabilities: ReadonlyMap<CapabilityKey, CapabilityDefinition>;
  readonly activities: ReadonlyMap<ActivityKey, ActivityProfile>;
  readonly topology: readonly CapabilityKey[];
  readonly ancestorsOf: (t: EntityTypeKey) => readonly EntityTypeKey[];
  readonly isA: (t: EntityTypeKey, ancestor: EntityTypeKey) => boolean;
  readonly attributesFor: (t: EntityTypeKey) => readonly AttributeDefinition[];
  readonly capabilitiesFor: (t: EntityTypeKey) => readonly CapabilityDefinition[];
}

export const compileOntology = (
  packs: readonly OntologyPack[],
): Result<CompiledOntology, readonly OntologyError[]> => {
  const errors: OntologyError[] = [];
  const units = new UnitRegistry();
  const entityTypes = new Map<EntityTypeKey, EntityTypeDefinition>();
  const attributes = new Map<AttributeKey, AttributeDefinition>();
  const capabilities = new Map<CapabilityKey, CapabilityDefinition>();
  const activities = new Map<ActivityKey, ActivityProfile>();

  const ordered = [...packs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const pack of ordered) {
    for (const u of pack.units) {
      const r = units.register(u);
      if (!r.ok) errors.push(r.error);
    }
    for (const t of pack.entityTypes) {
      if (entityTypes.has(t.key)) errors.push({ code: 'UNKNOWN_ENTITY_TYPE', key: t.key });
      else entityTypes.set(t.key, t);
    }
    for (const a of pack.attributes) {
      if (attributes.has(a.key)) errors.push({ code: 'DUPLICATE_ATTRIBUTE', key: a.key });
      else attributes.set(a.key, a);
    }
    for (const c of pack.capabilities) {
      if (capabilities.has(c.key)) errors.push({ code: 'DUPLICATE_CAPABILITY', key: c.key });
      else capabilities.set(c.key, c);
    }
    for (const p of pack.activities) activities.set(p.key, p);
  }

  // Entity type parents resolve, and the extends chain is acyclic.
  const ancestorCache = new Map<EntityTypeKey, readonly EntityTypeKey[]>();
  const resolveAncestors = (key: EntityTypeKey): readonly EntityTypeKey[] => {
    const cached = ancestorCache.get(key);
    if (cached) return cached;
    const chain: EntityTypeKey[] = [];
    const seen = new Set<EntityTypeKey>();
    let cursor: EntityTypeKey | undefined = key;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        errors.push({ code: 'ENTITY_TYPE_CYCLE', members: [...seen] });
        break;
      }
      seen.add(cursor);
      chain.push(cursor);
      const def: EntityTypeDefinition | undefined = entityTypes.get(cursor);
      if (def === undefined) {
        errors.push({ code: 'UNKNOWN_ENTITY_TYPE', key: cursor });
        break;
      }
      cursor = def.extends;
    }
    ancestorCache.set(key, chain);
    return chain;
  };
  for (const key of entityTypes.keys()) resolveAncestors(key);

  // Attribute validation.
  for (const a of attributes.values()) {
    for (const t of a.appliesTo) {
      if (!entityTypes.has(t)) errors.push({ code: 'UNKNOWN_ENTITY_TYPE', key: t });
    }
    if (a.valueType.kind === 'quantity') {
      const d = units.dimensionOf(a.valueType.canonicalUnit);
      if (!d.ok) errors.push(d.error);
      else if (!dimEquals(d.value, a.valueType.dimension)) {
        errors.push({ code: 'CANONICAL_UNIT_MISMATCH', key: a.key, unit: a.valueType.canonicalUnit });
      }
    }
    if (a.valueType.kind === 'reference' && !entityTypes.has(a.valueType.entityType)) {
      errors.push({ code: 'UNKNOWN_ENTITY_TYPE', key: a.valueType.entityType });
    }
  }

  // Capability validation: inputs resolve, canonical unit agrees, JND shares the output dimension.
  for (const c of capabilities.values()) {
    for (const input of c.inputs) {
      if (!attributes.has(input as AttributeKey) && !capabilities.has(input as CapabilityKey)) {
        errors.push({ code: 'UNKNOWN_INPUT', capability: c.key, input: String(input) });
      }
    }
    for (const t of c.appliesTo) {
      if (!entityTypes.has(t)) errors.push({ code: 'UNKNOWN_ENTITY_TYPE', key: t });
    }
    if (c.output.kind === 'quantity') {
      const d = units.dimensionOf(c.output.canonicalUnit);
      if (!d.ok) errors.push(d.error);
      else if (!dimEquals(d.value, c.output.dimension)) {
        errors.push({ code: 'CANONICAL_UNIT_MISMATCH', key: c.key, unit: c.output.canonicalUnit });
      }
      const jndDim = units.dimensionOf(c.jnd.unit);
      if (!jndDim.ok) errors.push(jndDim.error);
      else if (!dimEquals(jndDim.value, c.output.dimension)) {
        errors.push({ code: 'JND_DIMENSION_MISMATCH', key: c.key });
      }
      if (c.jnd.value <= 0) errors.push({ code: 'JND_DIMENSION_MISMATCH', key: c.key });
    }
  }

  for (const p of activities.values()) {
    for (const r of [...p.gates, ...p.implies]) {
      if (!capabilities.has(r.capability)) {
        errors.push({ code: 'UNKNOWN_INPUT', capability: r.capability, input: String(p.key) });
      }
    }
  }

  const topo = topoSort(capabilities);
  if (!topo.ok) errors.push(topo.error);

  if (errors.length > 0) return err(errors);

  const fingerprint = sha256({
    units: units.keys().slice().sort().map((k) => unitFingerprintOf(units.get(k)!)),
    entityTypes: [...entityTypes.values()].sort(byKey),
    attributes: [...attributes.values()].sort(byKey),
    capabilities: [...capabilities.values()].sort(byKey),
    activities: [...activities.values()].sort(byKey),
  }) as Fingerprint;

  const ancestorsOf = (t: EntityTypeKey) => ancestorCache.get(t) ?? [];
  const isA = (t: EntityTypeKey, a: EntityTypeKey) => ancestorsOf(t).includes(a);

  const attributesFor = (t: EntityTypeKey) => {
    const chain = new Set(ancestorsOf(t));
    return [...attributes.values()].filter((a) => a.appliesTo.some((x) => chain.has(x)));
  };
  const capabilitiesFor = (t: EntityTypeKey) => {
    const chain = new Set(ancestorsOf(t));
    return [...capabilities.values()].filter((c) => c.appliesTo.some((x) => chain.has(x)));
  };

  return ok({
    fingerprint,
    units,
    entityTypes,
    attributes,
    capabilities,
    activities,
    topology: topo.ok ? topo.value : [],
    ancestorsOf,
    isA,
    attributesFor,
    capabilitiesFor,
  });
};

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

const topoSort = (
  caps: ReadonlyMap<CapabilityKey, CapabilityDefinition>,
): Result<readonly CapabilityKey[], OntologyError> => {
  const indegree = new Map<CapabilityKey, number>();
  const dependents = new Map<CapabilityKey, CapabilityKey[]>();
  for (const key of caps.keys()) {
    indegree.set(key, 0);
    dependents.set(key, []);
  }
  for (const [key, def] of caps) {
    for (const input of def.inputs) {
      const ik = input as CapabilityKey;
      if (!caps.has(ik)) continue;
      indegree.set(key, (indegree.get(key) ?? 0) + 1);
      dependents.get(ik)!.push(key);
    }
  }
  // Sorted queue keeps derivation order deterministic across runs.
  const queue = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([k]) => k)
    .sort();
  const order: CapabilityKey[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    const next: CapabilityKey[] = [];
    for (const d of dependents.get(node) ?? []) {
      const remaining = (indegree.get(d) ?? 0) - 1;
      indegree.set(d, remaining);
      if (remaining === 0) next.push(d);
    }
    queue.push(...next.sort());
  }
  if (order.length !== caps.size) {
    const members = [...caps.keys()].filter((k) => (indegree.get(k) ?? 0) > 0).sort();
    return err({ code: 'CAPABILITY_CYCLE', members });
  }
  return ok(order);
};

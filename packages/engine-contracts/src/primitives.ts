/**
 * Shared typed identifiers are owned by the kernel so every layer uses the
 * same nominal brands. Contracts re-export them for wire-facing consumers.
 */
export {
  attributeKey,
  capabilityKey,
  derivationId,
  type AttributeKey,
  type CapabilityKey,
  type DerivationId,
} from '@camefa/engine-kernel';

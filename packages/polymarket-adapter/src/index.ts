import type { ReadOnlyCapability } from '@desk/domain';

// A descriptor, not an initialized connection or a successful integration probe.
export function describePolymarketReadAdapter(): ReadOnlyCapability {
  return { name: 'polymarket', kind: 'read-only', status: 'not-configured' };
}

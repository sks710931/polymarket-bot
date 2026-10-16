import type { ReadOnlyCapability } from '@desk/domain';

// A descriptor, not an initialized connection or a successful integration probe.
export function describePersistenceAdapter(): ReadOnlyCapability {
  return { name: 'persistence', kind: 'read-only', status: 'not-configured' };
}

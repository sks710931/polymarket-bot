import { OBSERVE_MODE, type ReadOnlyCapability } from '@desk/domain';

export function createObserveApplication(
  capabilities: readonly ReadOnlyCapability[],
) {
  return Object.freeze({
    mode: OBSERVE_MODE,
    capabilities: Object.freeze(
      capabilities.map((capability) => Object.freeze({ ...capability })),
    ),
  });
}

export const OBSERVE_MODE = 'OBSERVE' as const;

export interface ReadOnlyCapability {
  readonly name: string;
  readonly kind: 'read-only';
  readonly status: 'not-configured';
}

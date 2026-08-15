/**
 * Repair stored Sign-off type mappings and shipped labels without merging types.
 * System keys keep their canonical release columns; custom types are left alone
 * unless they collide with a restored system field.
 */
import {
  createDefaultSignoffLifecycleConfig,
  type SignoffLifecycleConfig,
  type SignoffReleaseField,
  type SignoffTypeConfig,
} from "@/lib/signoff-lifecycle-config";

/** Previous default labels — only these are rewritten to the sheet names. */
export const LEGACY_SIGNOFF_TYPE_LABELS: Readonly<Record<string, string>> = {
  dev: "Dev",
  test: "Test",
  uat: "UAT",
  security: "Security",
  business: "Business",
  ops: "Ops",
};

/**
 * Reconcile one stored Sign-off config toward the current type contract.
 * @param config - Current normalized per-user graph.
 * @returns A cloned graph. Custom type keys and user-renamed labels stay.
 */
export function reconcileSignoffLifecycleSpec(
  config: SignoffLifecycleConfig
): SignoffLifecycleConfig {
  const defaults = createDefaultSignoffLifecycleConfig();
  const canonicalByKey = new Map(defaults.types.map((type) => [type.key, type]));

  const types: SignoffTypeConfig[] = config.types.map((type) => {
    const def = canonicalByKey.get(type.key);
    if (!def) return { ...type };
    const next: SignoffTypeConfig = {
      ...type,
      // System types always write to their shipped Release column.
      releaseField: def.releaseField,
    };
    const legacy = LEGACY_SIGNOFF_TYPE_LABELS[type.key];
    if (type.label === legacy || type.label === def.label) {
      next.label = def.label;
    }
    return next;
  });

  const systemFields = new Set<SignoffReleaseField>();
  for (const type of types) {
    if (canonicalByKey.has(type.key) && type.releaseField) {
      systemFields.add(type.releaseField);
    }
  }
  // A custom type must not keep a column that now belongs to a system type.
  for (const type of types) {
    if (canonicalByKey.has(type.key)) continue;
    if (type.releaseField && systemFields.has(type.releaseField)) {
      type.releaseField = null;
    }
  }

  return {
    statuses: config.statuses.map((status) => ({ ...status })),
    transitions: config.transitions.map((transition) => ({ ...transition })),
    types,
  };
}

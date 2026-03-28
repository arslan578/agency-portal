/**
 * Feature Flags – Agency Portal
 *
 * HOW IT WORKS:
 * - Flags default to `false` (off).
 * - Override per-environment via NEXT_PUBLIC_FEATURE_* env vars.
 * - Usage: `import { flags } from "@/lib/featureFlags"; if (flags.billingV2) { ... }`
 *
 * ADDING A NEW FLAG:
 * 1. Add to the `FeatureFlags` interface below.
 * 2. Provide a default value in `DEFAULT_FLAGS`.
 * 3. Gate the feature in the component: `if (flags.yourFlag) { ... }`.
 * 4. Set `NEXT_PUBLIC_FEATURE_YOUR_FLAG=true` in the relevant .env file.
 */

export interface FeatureFlags {
  /** Multi-client management panel */
  clientManagement: boolean;
  /** Markup configurator per client */
  markupControl: boolean;
  /** Advanced reporting dashboard */
  advancedReporting: boolean;
  /** Billing V2 integration */
  billingV2: boolean;
  /** Campaign launch from agency portal */
  campaignLaunch: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  clientManagement: true,
  markupControl: false,
  advancedReporting: false,
  billingV2: false,
  campaignLaunch: false,
};

function loadFlags(): FeatureFlags {
  if (typeof process === "undefined") return DEFAULT_FLAGS;

  return {
    clientManagement:
      process.env.NEXT_PUBLIC_FEATURE_CLIENT_MANAGEMENT !== "false" &&
      DEFAULT_FLAGS.clientManagement,
    markupControl:
      process.env.NEXT_PUBLIC_FEATURE_MARKUP_CONTROL === "true",
    advancedReporting:
      process.env.NEXT_PUBLIC_FEATURE_ADVANCED_REPORTING === "true",
    billingV2:
      process.env.NEXT_PUBLIC_FEATURE_BILLING_V2 === "true",
    campaignLaunch:
      process.env.NEXT_PUBLIC_FEATURE_CAMPAIGN_LAUNCH === "true",
  };
}

export const flags = loadFlags();

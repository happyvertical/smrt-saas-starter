import { type SmrtConfig, setConfig } from "@happyvertical/smrt-config";
import starterSmrtConfig from "../../../smrt.config.mjs";

const bootstrapKey = Symbol.for("@happyvertical/smrt-saas-starter/config-bootstrap");

interface StarterConfigBootstrapState {
  loaded: boolean;
}

function getBootstrapState(): StarterConfigBootstrapState {
  const runtime = globalThis as typeof globalThis & {
    [bootstrapKey]?: StarterConfigBootstrapState;
  };
  const existing = runtime[bootstrapKey];
  if (existing) {
    return existing;
  }
  const state = { loaded: false };
  runtime[bootstrapKey] = state;
  return state;
}

/**
 * Register the starter's canonical SMRT configuration before request-time
 * package factories (especially production OIDC handlers) resolve it.
 *
 * The state lives on `globalThis` so Vite module re-evaluation during HMR does
 * not repeatedly replace the process-wide configuration registry.
 */
export async function loadStarterConfig(): Promise<void> {
  const state = getBootstrapState();
  if (state.loaded) {
    return;
  }

  setConfig(starterSmrtConfig as Partial<SmrtConfig>);
  state.loaded = true;
}

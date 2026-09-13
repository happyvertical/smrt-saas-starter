/**
 * Seeds this package's generated object manifest before decorators run.
 *
 * The SMRT Vite producer replaces this module with an inline manifest for
 * bundled consumers, while the emitted package uses the adjacent manifest.
 */
import { ObjectRegistry } from "@happyvertical/smrt-core";

ObjectRegistry.registerPackageManifest(new URL("./manifest.json", import.meta.url));

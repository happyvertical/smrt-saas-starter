export interface S3AssetStorageConfig {
  type: "s3";
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface LocalAssetStorageConfig {
  type: "local";
  basePath: string;
}

export type AssetStorageConfig = S3AssetStorageConfig | LocalAssetStorageConfig;

/**
 * Resolves the shared report-asset storage provider. Deployments select S3;
 * the local fallback keeps development and isolated tests self-contained.
 */
export function readAssetStorageConfig(
  environment: Record<string, string | undefined> = process.env,
): AssetStorageConfig {
  const type = optional(environment, "SMRT_ASSETS_STORAGE_TYPE") ?? "local";
  if (type === "local") {
    return {
      type,
      basePath: optional(environment, "SMRT_STARTER_ASSET_STORAGE_PATH") ?? ".runtime/assets",
    };
  }
  if (type !== "s3") {
    throw new Error("SMRT_ASSETS_STORAGE_TYPE must be either local or s3");
  }
  return {
    type,
    bucket: required(environment, "SMRT_ASSETS_S3_BUCKET"),
    region: required(environment, "SMRT_ASSETS_S3_REGION"),
    endpoint: requiredUrl(environment, "SMRT_ASSETS_S3_ENDPOINT"),
    forcePathStyle: readBoolean(environment, "SMRT_ASSETS_S3_FORCE_PATH_STYLE", true),
    accessKeyId: required(environment, "SMRT_ASSETS_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "SMRT_ASSETS_S3_SECRET_ACCESS_KEY"),
  };
}

function optional(
  environment: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = optional(environment, name);
  if (!value) throw new Error(`${name} is required when SMRT_ASSETS_STORAGE_TYPE=s3`);
  return value;
}

function requiredUrl(environment: Record<string, string | undefined>, name: string): string {
  const value = required(environment, name);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid protocol");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
}

function readBoolean(
  environment: Record<string, string | undefined>,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = optional(environment, name);
  if (!value) return defaultValue;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  throw new Error(`${name} must be a boolean`);
}

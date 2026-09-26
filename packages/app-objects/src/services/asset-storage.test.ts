import { describe, expect, it } from "vitest";
import { readAssetStorageConfig } from "./asset-storage.js";

describe("readAssetStorageConfig", () => {
  it("uses local storage for development when no provider is configured", () => {
    expect(readAssetStorageConfig({})).toEqual({ type: "local", basePath: ".runtime/assets" });
  });

  it("returns the S3-compatible provider contract", () => {
    expect(
      readAssetStorageConfig({
        SMRT_ASSETS_STORAGE_TYPE: "s3",
        SMRT_ASSETS_S3_BUCKET: "smrt-saas-assets",
        SMRT_ASSETS_S3_REGION: "garage",
        SMRT_ASSETS_S3_ENDPOINT: "http://garage.garage.svc.cluster.local:3900/",
        SMRT_ASSETS_S3_FORCE_PATH_STYLE: "true",
        SMRT_ASSETS_S3_ACCESS_KEY_ID: "key-id",
        SMRT_ASSETS_S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual({
      type: "s3",
      bucket: "smrt-saas-assets",
      region: "garage",
      endpoint: "http://garage.garage.svc.cluster.local:3900",
      forcePathStyle: true,
      accessKeyId: "key-id",
      secretAccessKey: "secret",
    });
  });

  it("fails closed when an S3 deployment is incomplete", () => {
    expect(() => readAssetStorageConfig({ SMRT_ASSETS_STORAGE_TYPE: "s3" })).toThrow(
      "SMRT_ASSETS_S3_BUCKET is required",
    );
  });
});

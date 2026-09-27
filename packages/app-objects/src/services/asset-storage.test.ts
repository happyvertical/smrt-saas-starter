import { describe, expect, it } from "vitest";
import { readAssetStorageConfig } from "./asset-storage.js";

describe("readAssetStorageConfig", () => {
  it("uses local storage for development when no provider is configured", () => {
    expect(readAssetStorageConfig({})).toEqual({ type: "local", basePath: ".runtime/assets" });
  });

  it("requires an explicit provider in production but permits an explicit local test path", () => {
    expect(() => readAssetStorageConfig({ NODE_ENV: "production" })).toThrow(
      "SMRT_ASSETS_STORAGE_TYPE is required in production",
    );
    expect(() =>
      readAssetStorageConfig({ NODE_ENV: "production", SMRT_ASSETS_STORAGE_TYPE: " " }),
    ).toThrow("SMRT_ASSETS_STORAGE_TYPE is required in production");
    expect(
      readAssetStorageConfig({
        NODE_ENV: "production",
        SMRT_ASSETS_STORAGE_TYPE: "local",
        SMRT_STARTER_ASSET_STORAGE_PATH: "/tmp/isolated-assets",
      }),
    ).toEqual({ type: "local", basePath: "/tmp/isolated-assets" });
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
    const base = {
      SMRT_ASSETS_STORAGE_TYPE: "s3",
      SMRT_ASSETS_S3_BUCKET: "bucket",
      SMRT_ASSETS_S3_REGION: "garage",
      SMRT_ASSETS_S3_ENDPOINT: "http://storage.example.test",
      SMRT_ASSETS_S3_ACCESS_KEY_ID: "key",
      SMRT_ASSETS_S3_SECRET_ACCESS_KEY: "secret",
    };
    expect(() => readAssetStorageConfig({ ...base, SMRT_ASSETS_S3_ACCESS_KEY_ID: "" })).toThrow(
      "SMRT_ASSETS_S3_ACCESS_KEY_ID is required",
    );
    expect(() => readAssetStorageConfig({ ...base, SMRT_ASSETS_S3_SECRET_ACCESS_KEY: "" })).toThrow(
      "SMRT_ASSETS_S3_SECRET_ACCESS_KEY is required",
    );
    expect(() =>
      readAssetStorageConfig({ ...base, SMRT_ASSETS_S3_ENDPOINT: "s3://bucket" }),
    ).toThrow("SMRT_ASSETS_S3_ENDPOINT must be an absolute HTTP(S) URL");
    expect(() =>
      readAssetStorageConfig({ ...base, SMRT_ASSETS_S3_FORCE_PATH_STYLE: "maybe" }),
    ).toThrow("SMRT_ASSETS_S3_FORCE_PATH_STYLE must be a boolean");
    expect(() => readAssetStorageConfig({ SMRT_ASSETS_STORAGE_TYPE: "bucket" })).toThrow(
      "SMRT_ASSETS_STORAGE_TYPE must be either local or s3",
    );
  });
});

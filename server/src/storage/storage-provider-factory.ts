import type { StorageProvider, StorageProviderConfig, StorageProviderKind } from "./storage-provider.js";
import { LocalStorageProvider } from "./providers/local-storage-provider.js";
import { WebDavStorageProvider } from "./providers/webdav-storage-provider.js";
import { QnapStorageProvider } from "./providers/qnap-storage-provider.js";
import { MockStorageProvider } from "./providers/mock-storage-provider.js";
import {
  buildStorageProviderConfig,
  resolveQnapStorageProviderKind,
} from "./qnap-storage-v1-config.js";

export function createStorageProvider(config: StorageProviderConfig): StorageProvider {
  switch (config.kind) {
    case "mock":
      return new MockStorageProvider(config);
    case "webdav":
      return new WebDavStorageProvider(config);
    case "qnap":
      return new QnapStorageProvider(config);
    case "local":
    default:
      return new LocalStorageProvider(config);
  }
}

export function getDefaultStorageProvider(kind: StorageProviderKind = "local"): StorageProvider {
  return createStorageProvider({ kind });
}

export function getQnapStorageProvider(): StorageProvider {
  return createStorageProvider(buildStorageProviderConfig());
}

export function getQnapStorageProviderKind(): StorageProviderKind {
  return resolveQnapStorageProviderKind();
}

export const STORAGE_PROVIDER_KINDS: StorageProviderKind[] = ["local", "webdav", "qnap", "mock"];

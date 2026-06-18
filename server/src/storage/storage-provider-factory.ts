import type { StorageProvider, StorageProviderConfig, StorageProviderKind } from "./storage-provider.js";
import { LocalStorageProvider } from "./providers/local-storage-provider.js";
import { WebDavStorageProvider } from "./providers/webdav-storage-provider.js";
import { QnapStorageProvider } from "./providers/qnap-storage-provider.js";

export function createStorageProvider(config: StorageProviderConfig): StorageProvider {
  switch (config.kind) {
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

export const STORAGE_PROVIDER_KINDS: StorageProviderKind[] = ["local", "webdav", "qnap"];

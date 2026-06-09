import { config } from "../config.js";
import { getDatabase } from "./database.js";
import { PostgresProvider } from "./postgres-provider.js";
import { SqliteProvider } from "./sqlite-provider.js";
let provider = null;
export function getDbProvider() {
    if (provider)
        return provider;
    provider =
        config.dbProvider === "postgres"
            ? new PostgresProvider()
            : new SqliteProvider(getDatabase);
    return provider;
}
export function resetDbProviderForTests() {
    provider = null;
}

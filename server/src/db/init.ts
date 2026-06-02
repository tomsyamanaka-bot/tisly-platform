import { getDatabase, getDbPath } from "./database.js";

getDatabase();
console.log(`[TiSLY] Database initialized: ${getDbPath()}`);

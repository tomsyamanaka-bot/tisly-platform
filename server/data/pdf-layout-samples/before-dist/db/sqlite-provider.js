export class SqliteProvider {
    type = "sqlite";
    getDb;
    constructor(getDb) {
        this.getDb = getDb;
    }
    sqlite() {
        return this.getDb();
    }
    ping() {
        try {
            this.getDb().prepare("SELECT 1").get();
            return true;
        }
        catch {
            return false;
        }
    }
    info() {
        return {
            provider: "sqlite",
            reachable: this.ping(),
        };
    }
}

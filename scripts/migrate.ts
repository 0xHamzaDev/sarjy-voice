import { fileURLToPath } from "node:url";
import { db } from "@server/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";

await migrate(db, {
	migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
await db.$client.end();
console.log("migrations applied");

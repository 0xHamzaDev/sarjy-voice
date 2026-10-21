import { db } from "@server/db/client";
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";

afterAll(() => db.$client.end());

test("pgvector is installed and tables exist", async () => {
	const [ext] = await db.execute(
		sql`select extname from pg_extension where extname = 'vector'`,
	);
	expect(ext?.extname).toBe("vector");
	const tables = await db.execute(
		sql`select table_name from information_schema.tables where table_name in ('users','memories','turns')`,
	);
	expect(tables).toHaveLength(3);
});

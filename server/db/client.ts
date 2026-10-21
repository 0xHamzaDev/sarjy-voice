import { env } from "@server/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DB_POOL_MAX_CONNECTIONS = 5;

export const db = drizzle(
	postgres(env.DATABASE_URL, {
		max: DB_POOL_MAX_CONNECTIONS,
		onnotice: () => {},
	}),
);

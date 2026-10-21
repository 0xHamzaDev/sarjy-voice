import { EMBEDDING_DIMENSIONS } from "@server/config";
import { type Lang, NAME_MAX_CHARS } from "@shared/protocol";
import { sql } from "drizzle-orm";
import {
	bigserial,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	vector,
} from "drizzle-orm/pg-core";

const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		memoryRevision: integer("memory_revision").notNull().default(0),
		createdAt: createdAt(),
	},
	(t) => [
		check(
			"users_name_check",
			sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX_CHARS))}`,
		),
	],
);

export const memories = pgTable(
	"memories",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: uuid("user_id").notNull(),
		content: text("content").notNull(),
		lang: text("lang").$type<Lang>().notNull(),
		embedding: vector("embedding", {
			dimensions: EMBEDDING_DIMENSIONS,
		}).notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		foreignKey({
			name: "memories_user_id_fkey",
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete("cascade"),
		index("memories_embedding_idx").using(
			"hnsw",
			t.embedding.op("vector_cosine_ops"),
		),
		index("memories_user_recent_idx").on(
			t.userId,
			t.createdAt.desc(),
			t.id.desc(),
		),
	],
);

export const turns = pgTable(
	"turns",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id").notNull(),
		transcript: text("transcript").notNull(),
		reply: text("reply").notNull(),
		lang: text("lang").$type<Lang>().notNull(),
		vendors: jsonb("vendors").notNull(),
		timings: jsonb("timings").notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		foreignKey({
			name: "turns_user_id_fkey",
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete("cascade"),
		index("turns_user_idx").on(t.userId),
	],
);

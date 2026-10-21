import { db } from "@server/db/client";
import { users as usersTable } from "@server/db/schema";
import { saveMemory, searchMemories } from "@server/memory/memoryStore";
import { createUser } from "@server/users/userStore";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";

const signal = new AbortController().signal;
const users: string[] = [];
let hamza = "";
let other = "";

beforeAll(async () => {
	if (!process.env.LIVE) return;
	hamza = (await createUser("Hamza Live Test")).id;
	other = (await createUser("Other Live Test")).id;
	users.push(hamza, other);
	await saveMemory(hamza, "My favorite color is blue", signal, 0);
	await saveMemory(hamza, "I work as a software engineer", signal, 0);
	await saveMemory(hamza, "I live in Jeddah", signal, 0);
	await saveMemory(other, "My favorite color is green", signal, 0);
}, 30000);

afterAll(async () => {
	if (users.length > 0)
		await db.delete(usersTable).where(inArray(usersTable.id, users));
	await db.$client.end();
});

test.skipIf(!process.env.LIVE)(
	"recalls an English fact from an Arabic question",
	async () => {
		const [top] = await searchMemories(hamza, "وش لوني المفضل؟", signal);
		expect(top?.content).toBe("My favorite color is blue");
	},
	15000,
);

test.skipIf(!process.env.LIVE)(
	"never returns another user's memories",
	async () => {
		const results = await searchMemories(hamza, "favorite color", signal);
		expect(results.map((memory) => memory.content)).not.toContain(
			"My favorite color is green",
		);
	},
	15000,
);

import { db } from "@server/db/client";
import { users } from "@server/db/schema";
import {
	createUser,
	findUser,
	normalizeName,
	sessionIdFromCookieHeader,
	updateUserName,
	userName,
} from "@server/users/userStore";
import { inArray } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";

const created: string[] = [];
afterAll(async () => {
	await db.delete(users).where(inArray(users.id, created));
	await db.$client.end();
});

test("name is trimmed, Arabic preserved, blanks and 41+ chars rejected", () => {
	expect(userName.parse("  Hamza ")).toBe("Hamza");
	expect(userName.parse("حمزة")).toBe("حمزة");
	expect(userName.safeParse("    ").success).toBe(false);
	expect(userName.safeParse("a".repeat(41)).success).toBe(false);
	expect(userName.safeParse("a".repeat(40)).success).toBe(true);
});

test("reads a valid sid from a cookie header", () => {
	const id = "4b0f4c1e-8a57-4c1a-9a8e-2f1b3c4d5e6f";
	expect(sessionIdFromCookieHeader(`theme=dark; sid=${id}; x=1`)).toBe(id);
});

test("ignores missing or malformed sid", () => {
	expect(sessionIdFromCookieHeader(undefined)).toBeNull();
	expect(sessionIdFromCookieHeader("sid=not-a-uuid")).toBeNull();
	expect(
		sessionIdFromCookieHeader("xsid=4b0f4c1e-8a57-4c1a-9a8e-2f1b3c4d5e6f"),
	).toBeNull();
});

test("normalizes case, whitespace, and Arabic letter variants to the same key", () => {
	expect(normalizeName("  Hamza  ")).toBe("hamza");
	expect(normalizeName("HAMZA")).toBe("hamza");
	expect(normalizeName("Hamza   Al Sherif")).toBe("hamza al sherif");
	expect(normalizeName("حمزه")).toBe(normalizeName("حَمْزَة"));
	expect(normalizeName("إيمان")).toBe(normalizeName("ايمان"));
	expect(normalizeName("يحيى")).toBe(normalizeName("يحيي"));
});

test("creates and finds a user", async () => {
	const user = await createUser("Test User حساب الاختبار");
	created.push(user.id);
	expect(await findUser(user.id)).toEqual({
		id: user.id,
		name: "Test User حساب الاختبار",
	});
	expect(await findUser("4b0f4c1e-8a57-4c1a-9a8e-000000000000")).toBeNull();
});

test("matching normalized names create separate identities", async () => {
	const first = await createUser("Test Identity Hamza");
	created.push(first.id);
	const second = await createUser("  test identity hamza  ");
	created.push(second.id);
	expect(second.id).not.toBe(first.id);
	expect(await findUser(first.id)).toEqual(first);
	expect(await findUser(second.id)).toEqual(second);
});

test("a preferred name survives reload without changing identity or another user's profile", async () => {
	const first = await createUser("First");
	const second = await createUser("حَمْزَة");
	created.push(first.id, second.id);
	expect(await updateUserName(first.id, "حَمْزَة")).toEqual({
		id: first.id,
		name: "حَمْزَة",
	});
	expect(await findUser(first.id)).toEqual({ id: first.id, name: "حَمْزَة" });
	expect(await findUser(second.id)).toEqual(second);
	await expect(
		updateUserName("4b0f4c1e-8a57-4c1a-9a8e-000000000000", "Missing"),
	).rejects.toThrow("user update returned no row");
});

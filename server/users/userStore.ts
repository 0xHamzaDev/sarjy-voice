import { db } from "@server/db/client";
import { users } from "@server/db/schema";
import { foldArabic } from "@server/voice/listen/cleanTranscript";
import { NAME_MAX_CHARS } from "@shared/protocol";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const SESSION_COOKIE = "sid";

export type User = { id: string; name: string };

export const userName = z.string().trim().min(1).max(NAME_MAX_CHARS);

const sessionId = z.uuid();

export function isSessionId(value: unknown): value is string {
	return sessionId.safeParse(value).success;
}

export const cookieFromHeader = (
	header: string | undefined,
	name: string,
): string | undefined =>
	header
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);

export function sessionIdFromCookieHeader(
	header: string | undefined,
): string | null {
	const value = cookieFromHeader(header, SESSION_COOKIE);
	return isSessionId(value) ? value : null;
}

export function normalizeName(name: string): string {
	return foldArabic(name).trim().replace(/\s+/g, " ").toLowerCase();
}

export async function createUser(name: string): Promise<User> {
	const [user] = await db
		.insert(users)
		.values({ name })
		.returning({ id: users.id, name: users.name });
	if (!user) throw new Error("user insert returned no row");
	return user;
}

export async function findUser(id: string): Promise<User | null> {
	const [user] = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, id));
	return user ?? null;
}

export async function updateUserName(id: string, name: string): Promise<User> {
	const [user] = await db
		.update(users)
		.set({ name })
		.where(eq(users.id, id))
		.returning({ id: users.id, name: users.name });
	if (!user) throw new Error("user update returned no row");
	return user;
}

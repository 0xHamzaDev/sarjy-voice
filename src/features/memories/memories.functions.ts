import {
	clearMemories,
	deleteMemory,
	listMemories,
} from "@server/memory/memoryStore";
import { isSessionId, SESSION_COOKIE } from "@server/users/userStore";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

function requireUserId() {
	const id = getCookie(SESSION_COOKIE);
	if (!isSessionId(id)) throw new Error("not signed in");
	return id;
}

export const getMemories = createServerFn({ method: "GET" }).handler(() =>
	listMemories(requireUserId()),
);

export const forgetMemory = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(({ data }) => deleteMemory(requireUserId(), data.id));

export const forgetAllMemories = createServerFn({ method: "POST" }).handler(
	() => clearMemories(requireUserId()),
);

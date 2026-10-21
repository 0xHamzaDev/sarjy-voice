import { SESSION_COOKIE_MAX_AGE_S } from "@server/config";
import {
	createUser,
	findUser,
	isSessionId,
	SESSION_COOKIE,
	userName,
} from "@server/users/userStore";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
	async () => {
		const id = getCookie(SESSION_COOKIE);
		return isSessionId(id) ? findUser(id) : null;
	},
);

export const registerUser = createServerFn({ method: "POST" })
	.validator(z.object({ name: userName }))
	.handler(async ({ data }) => {
		const id = getCookie(SESSION_COOKIE);
		const existing = isSessionId(id) ? await findUser(id) : null;
		const user = existing ?? (await createUser(data.name));
		setCookie(SESSION_COOKIE, user.id, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: SESSION_COOKIE_MAX_AGE_S,
		});
		return user;
	});

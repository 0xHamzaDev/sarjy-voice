import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import {
	getCurrentUser,
	registerUser,
} from "@/features/welcome/user.functions";

const mocks = vi.hoisted(() => ({
	getCookie: vi.fn(),
	setCookie: vi.fn(),
	createUser: vi.fn(),
	findUser: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: unknown) => handler,
		validator: () => ({ handler: (handler: unknown) => handler }),
	}),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getCookie: mocks.getCookie,
	setCookie: mocks.setCookie,
}));
vi.mock("@server/db/client", () => ({ db: {} }));
vi.mock("@server/users/userStore", async (importOriginal) => ({
	...(await importOriginal<typeof import("@server/users/userStore")>()),
	createUser: mocks.createUser,
	findUser: mocks.findUser,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getCookie.mockReturnValue(undefined);
	mocks.findUser.mockResolvedValue(null);
	mocks.createUser.mockImplementation(async (name: string) => ({
		id: randomUUID(),
		name,
	}));
});

test("new browsers with the same name receive independent identities", async () => {
	const first = await registerUser({ data: { name: "Hamza" } });
	const second = await registerUser({ data: { name: "Hamza" } });
	expect(first.id).not.toBe(second.id);
	expect(mocks.createUser).toHaveBeenCalledTimes(2);
	expect(mocks.findUser).not.toHaveBeenCalled();
	for (const user of [first, second])
		expect(mocks.setCookie).toHaveBeenCalledWith(
			"sid",
			user.id,
			expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
		);
});

test("the first name entered at signup is saved and returned on the next visit", async () => {
	const user = await registerUser({ data: { name: "حمزة" } });
	expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith("حمزة");
	expect(user.name).toBe("حمزة");
	expect(mocks.setCookie).toHaveBeenCalledWith(
		"sid",
		user.id,
		expect.any(Object),
	);
	mocks.getCookie.mockReturnValue(user.id);
	mocks.findUser.mockResolvedValue(user);
	expect(await getCurrentUser()).toEqual(user);
	expect(mocks.findUser).toHaveBeenCalledExactlyOnceWith(user.id);
});

test("a valid browser session preserves its existing identity", async () => {
	const user = { id: randomUUID(), name: "Hamza" };
	mocks.getCookie.mockReturnValue(user.id);
	mocks.findUser.mockResolvedValue(user);
	expect(await registerUser({ data: { name: "Someone else" } })).toEqual(user);
	expect(await getCurrentUser()).toEqual(user);
	expect(mocks.findUser).toHaveBeenCalledWith(user.id);
	expect(mocks.createUser).not.toHaveBeenCalled();
	expect(mocks.setCookie).toHaveBeenCalledWith(
		"sid",
		user.id,
		expect.any(Object),
	);
});

test.each([
	"invalid",
	"4b0f4c1e-8a57-4c1a-9a8e-2f1b3c4d5e6f",
])("an unknown browser session (%s) creates a new identity", async (cookie) => {
	mocks.getCookie.mockReturnValue(cookie);
	const user = await registerUser({ data: { name: "Hamza" } });
	expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith("Hamza");
	expect(user.id).not.toBe(cookie);
	if (cookie === "invalid") expect(mocks.findUser).not.toHaveBeenCalled();
	else expect(mocks.findUser).toHaveBeenCalledExactlyOnceWith(cookie);
});

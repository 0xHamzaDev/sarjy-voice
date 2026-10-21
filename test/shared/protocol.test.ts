import { clientMessage } from "@shared/protocol";
import { expect, test } from "vitest";

test("accepts a valid hello", () => {
	const msg = clientMessage.parse({
		type: "hello",
		tz: "Asia/Riyadh",
		coords: { lat: 24.7, lon: 46.7 },
	});
	expect(msg.type).toBe("hello");
});

test("rejects unknown message types", () => {
	expect(clientMessage.safeParse({ type: "admin" }).success).toBe(false);
});

test("rejects blank or oversized text", () => {
	expect(clientMessage.safeParse({ type: "text", text: "   " }).success).toBe(
		false,
	);
	expect(
		clientMessage.safeParse({ type: "text", text: "a".repeat(501) }).success,
	).toBe(false);
});

test("rejects out-of-range coordinates and unknown timezones", () => {
	expect(
		clientMessage.safeParse({
			type: "hello",
			tz: "UTC",
			coords: { lat: 91, lon: 0 },
		}).success,
	).toBe(false);
	expect(
		clientMessage.safeParse({ type: "hello", tz: "Mars/Olympus", coords: null })
			.success,
	).toBe(false);
});

test("call start needs a language, other call actions do not", () => {
	expect(
		clientMessage.safeParse({ type: "call", action: "start", lang: "en" })
			.success,
	).toBe(true);
	expect(
		clientMessage.safeParse({ type: "call", action: "start" }).success,
	).toBe(false);
	expect(
		clientMessage.safeParse({ type: "call", action: "start", lang: "fr" })
			.success,
	).toBe(false);
	for (const action of ["mute", "unmute", "end"])
		expect(clientMessage.safeParse({ type: "call", action }).success).toBe(
			true,
		);
	expect(
		clientMessage.safeParse({ type: "call", action: "hold" }).success,
	).toBe(false);
});

import { LOCATION_COOKIE } from "@server/config";
import { locationFromCookieHeader } from "@server/location";
import { expect, test } from "vitest";

const cookie = (value: unknown) =>
	`sid=abc; ${LOCATION_COOKIE}=${encodeURIComponent(JSON.stringify(value))}`;

test("reads the stored location from the socket cookie header", () => {
	expect(
		locationFromCookieHeader(
			cookie({ lat: 21.543, lon: 39.173, tz: "Asia/Riyadh" }),
		),
	).toEqual({ lat: 21.543, lon: 39.173, tz: "Asia/Riyadh" });
});

test("rejects missing, malformed, or out-of-range locations", () => {
	expect(locationFromCookieHeader(undefined)).toBeNull();
	expect(locationFromCookieHeader(`${LOCATION_COOKIE}=%E0%A4%A`)).toBeNull();
	expect(
		locationFromCookieHeader(cookie({ lat: 91, lon: 0, tz: "Asia/Riyadh" })),
	).toBeNull();
	expect(
		locationFromCookieHeader(cookie({ lat: 0, lon: 0, tz: "Mars/Olympus" })),
	).toBeNull();
});

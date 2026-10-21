import { expect, test } from "vitest";
import { skyPhase } from "@/features/sky/skyPhase";

const times = {
	Fajr: "04:21",
	Sunrise: "05:39",
	Maghrib: "17:51",
	Isha: "19:21",
};

test("phase follows the prayer boundaries", () => {
	expect(skyPhase(times, "02:00")).toBe("night");
	expect(skyPhase(times, "04:21")).toBe("fajr");
	expect(skyPhase(times, "05:38")).toBe("fajr");
	expect(skyPhase(times, "05:39")).toBe("day");
	expect(skyPhase(times, "17:51")).toBe("maghrib");
	expect(skyPhase(times, "19:20")).toBe("maghrib");
	expect(skyPhase(times, "19:21")).toBe("night");
	expect(skyPhase(times, "23:59")).toBe("night");
});

test("missing prayer times fall back to night", () => {
	expect(skyPhase(null, "12:00")).toBe("night");
});

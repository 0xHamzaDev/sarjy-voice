import { qiblaOf } from "@server/tools/qibla";
import { expect, test } from "vitest";

test("computes the great-circle bearing and distance to the Kaaba", () => {
	expect(qiblaOf({ lat: 24.7136, lon: 46.6753 })).toEqual({
		bearing: 244,
		distanceKm: 790,
	});
	expect(qiblaOf({ lat: 21.5433, lon: 39.1728 })).toMatchObject({
		distanceKm: 69,
	});
	expect(qiblaOf({ lat: 51.5074, lon: -0.1278 }).bearing).toBe(119);
});

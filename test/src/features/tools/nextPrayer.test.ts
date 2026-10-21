import { expect, test } from "vitest";
import { nextPrayer } from "@/features/tools/nextPrayer";

const times = {
	fajr: "04:21",
	sunrise: "05:39",
	dhuhr: "11:45",
	asr: "15:09",
	maghrib: "17:51",
	isha: "19:21",
};

test("picks the next prayer strictly after the current time", () => {
	expect(nextPrayer(times, "02:00")).toBe("fajr");
	expect(nextPrayer(times, "04:21")).toBe("sunrise");
	expect(nextPrayer(times, "11:44")).toBe("dhuhr");
	expect(nextPrayer(times, "17:50")).toBe("maghrib");
	expect(nextPrayer(times, "19:21")).toBe("fajr");
	expect(nextPrayer(times, "23:59")).toBe("fajr");
});

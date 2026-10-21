import { expect, test } from "vitest";
import { clockLabel, phaseClock, timeLabel } from "@/features/sky/localClock";

test("labels the clock in 12-hour time with AM/PM in both languages", () => {
	const afternoon = new Date(2026, 8, 25, 15, 7);
	expect(clockLabel(afternoon, "en")).toBe("3:07 PM");
	expect(clockLabel(afternoon, "ar")).toBe("٣:٠٧ م");
	expect(clockLabel(new Date(2026, 8, 25, 0, 5), "en")).toBe("12:05 AM");
});

test("phase clock stays 24-hour local time for prayer-time comparison", () => {
	expect(phaseClock(new Date(2026, 8, 25, 4, 9))).toBe("04:09");
	expect(phaseClock(new Date(2026, 8, 25, 19, 30))).toBe("19:30");
});

test("prayer and forecast times from the API render in 12-hour time", () => {
	expect(timeLabel("18:17", "en")).toBe("6:17 PM");
	expect(timeLabel("04:57", "ar")).toBe("٤:٥٧ ص");
});

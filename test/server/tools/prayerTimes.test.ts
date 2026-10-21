import { toAladhanDate, todayIn } from "@server/tools/prayerTimes";
import { expect, test } from "vitest";

test("date helpers", () => {
	expect(toAladhanDate("2026-09-24")).toBe("24-09-2026");
	expect(todayIn("Asia/Riyadh", new Date("2026-09-24T22:30:00Z"))).toBe(
		"2026-09-25",
	);
});

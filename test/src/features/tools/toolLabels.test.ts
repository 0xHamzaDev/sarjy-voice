import { expect, test } from "vitest";
import { aqiLevel, compassPoint } from "@/features/tools/toolLabels";

test("maps US AQI to its EPA category", () => {
	expect(aqiLevel(12)).toBe("aqiGood");
	expect(aqiLevel(100)).toBe("aqiModerate");
	expect(aqiLevel(151)).toBe("aqiUnhealthy");
	expect(aqiLevel(654)).toBe("aqiHazardous");
});

test("names the nearest of eight compass points", () => {
	expect(compassPoint(0)).toBe("dirN");
	expect(compassPoint(100)).toBe("dirE");
	expect(compassPoint(244)).toBe("dirSW");
	expect(compassPoint(350)).toBe("dirN");
});

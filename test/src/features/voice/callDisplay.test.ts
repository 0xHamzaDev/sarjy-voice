import { expect, test } from "vitest";
import { formatCallDuration, quantizeWave } from "@/features/voice/callDisplay";

test("formats elapsed milliseconds as mm:ss", () => {
	expect(formatCallDuration(0)).toBe("0:00");
	expect(formatCallDuration(65_000)).toBe("1:05");
	expect(formatCallDuration(-500)).toBe("0:00");
});

test("quantizes samples into per-column peak levels", () => {
	expect(quantizeWave(new Uint8Array(8).fill(128), 4)).toEqual([0, 0, 0, 0]);
	const samples = new Uint8Array([128, 128, 0, 0, 192, 192, 128, 128]);
	expect(quantizeWave(samples, 4)).toEqual([0, 1, 0.5, 0]);
	expect(quantizeWave(new Uint8Array(0), 4)).toEqual([]);
});

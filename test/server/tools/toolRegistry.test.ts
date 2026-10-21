import { runTool } from "@server/tools/toolRegistry";
import { afterEach, expect, test, vi } from "vitest";

const context = () => ({
	user: { id: "test-user", name: "Test" },
	transcript: "weather?",
	coords: { lat: 24.7136, lon: 46.6753 },
	tz: "Asia/Riyadh",
	signal: new AbortController().signal,
	onResult: vi.fn(),
	onNameSaved: vi.fn(),
});

afterEach(() => vi.unstubAllGlobals());

test("unknown tools return an error", async () => {
	const result = await runTool(
		{ id: "1", name: "launch_rockets", arguments: "{}" },
		context(),
	);
	expect(JSON.parse(result)).toEqual({ error: "unknown_tool" });
});

test("prayer_times returns timings from Aladhan and shows the card on screen", async () => {
	vi.stubGlobal("fetch", async () =>
		Response.json({
			data: {
				timings: {
					Fajr: "04:21",
					Sunrise: "05:39",
					Dhuhr: "11:45",
					Asr: "15:09",
					Sunset: "17:51",
					Maghrib: "17:51",
					Isha: "19:21",
				},
				date: { hijri: { date: "02-04-1448" } },
			},
		}),
	);
	const ctx = context();
	const result = JSON.parse(
		await runTool({ id: "1", name: "prayer_times", arguments: "{}" }, ctx),
	);
	expect(result.timings.Maghrib).toBe("17:51");
	expect(result.hijri).toBe("02-04-1448");
	expect(ctx.onResult).toHaveBeenCalledWith({
		kind: "prayer",
		prayer: expect.objectContaining({
			cityAr: "الرياض",
			hijriDate: "02-04-1448",
			times: expect.objectContaining({ maghrib: "17:51", fajr: "04:21" }),
		}),
	});
});

test("prayer_times failure never invents data", async () => {
	vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
	const result = await runTool(
		{ id: "1", name: "prayer_times", arguments: "{}" },
		context(),
	);
	expect(JSON.parse(result)).toEqual({ error: "prayer_times_unavailable" });
});

test("weather with no or an empty city uses the user location and shows it on screen", async () => {
	vi.stubGlobal("fetch", async () =>
		Response.json({
			current: {
				temperature_2m: 30,
				apparent_temperature: 29,
				relative_humidity_2m: 20,
				wind_speed_10m: 12,
				weather_code: 0,
			},
			hourly: { time: ["2026-09-24T21:00"], temperature_2m: [30] },
		}),
	);
	const ctx = context();
	const result = await runTool(
		{ id: "1", name: "weather", arguments: '{"city":""}' },
		ctx,
	);
	expect(JSON.parse(result)).toMatchObject({
		cityAr: "الرياض",
		temperature: 30,
	});
	expect(ctx.onResult).toHaveBeenCalledWith({
		kind: "weather",
		weather: expect.objectContaining({ cityAr: "الرياض", temperature: 30 }),
	});
});

test("weather for an unknown city returns an error without showing a window", async () => {
	vi.stubGlobal("fetch", async () => Response.json({}));
	const ctx = context();
	const result = await runTool(
		{ id: "1", name: "weather", arguments: '{"city":"Atlantis"}' },
		ctx,
	);
	expect(JSON.parse(result)).toEqual({ error: "city_not_found" });
	expect(ctx.onResult).not.toHaveBeenCalled();
});

test("currency converts with live rates and shows the card", async () => {
	vi.stubGlobal("fetch", async (url: string) => {
		expect(String(url)).toMatch(/\/USD$/);
		return Response.json({
			result: "success",
			time_last_update_utc: "Fri, 25 Sep 2026 00:02:31 +0000",
			rates: { SAR: 3.75, EUR: 0.92 },
		});
	});
	const ctx = context();
	const result = await runTool(
		{ id: "1", name: "currency", arguments: '{"amount":100,"from":"usd"}' },
		ctx,
	);
	expect(JSON.parse(result)).toMatchObject({
		amount: 100,
		from: "USD",
		to: "SAR",
		result: 375,
	});
	expect(ctx.onResult).toHaveBeenCalledWith({
		kind: "currency",
		currency: expect.objectContaining({ result: 375, rate: 3.75 }),
	});
	expect(
		JSON.parse(
			await runTool(
				{ id: "2", name: "currency", arguments: '{"from":"USD","to":"XYZ"}' },
				ctx,
			),
		),
	).toEqual({ error: "unknown_currency" });
});

test("qibla points from the user's location without a network call", async () => {
	const ctx = context();
	const result = JSON.parse(
		await runTool({ id: "1", name: "qibla", arguments: "{}" }, ctx),
	);
	expect(result).toMatchObject({ cityAr: "الرياض", bearing: 244 });
	expect(ctx.onResult).toHaveBeenCalledWith({
		kind: "qibla",
		qibla: expect.objectContaining({ distanceKm: 790 }),
	});
});

test("hazardous air makes the weather result ask for a dust warning", async () => {
	vi.stubGlobal("fetch", async (url: URL) =>
		Response.json(
			String(url).includes("air-quality")
				? { current: { us_aqi: 654, pm10: 365, dust: 751 } }
				: {
						current: {
							temperature_2m: 34,
							apparent_temperature: 32,
							relative_humidity_2m: 10,
							wind_speed_10m: 8,
							weather_code: 0,
						},
						hourly: { time: ["2026-09-25T21:00"], temperature_2m: [34] },
					},
		),
	);
	const ctx = context();
	const result = JSON.parse(
		await runTool({ id: "1", name: "weather", arguments: "{}" }, ctx),
	);
	expect(result.air).toEqual({ aqi: 654, pm10: 365, dust: 751 });
	expect(result.mustMention).toMatch(/dust/);
});

test("a tool that finishes after its turn is aborted does not show its card", async () => {
	const controller = new AbortController();
	vi.stubGlobal("fetch", async () => {
		controller.abort();
		return Response.json({ name: "Jeddah", namedetails: { "name:ar": "جدة" } });
	});
	const ctx = {
		...context(),
		coords: { lat: 21.54, lon: 39.17 },
		signal: controller.signal,
	};
	await runTool({ id: "1", name: "qibla", arguments: "{}" }, ctx);
	expect(ctx.onResult).not.toHaveBeenCalled();
});

test("aborting one currency call does not fail a concurrent call for the same rates", async () => {
	vi.stubGlobal(
		"fetch",
		(_url: string, { signal }: { signal: AbortSignal }) =>
			new Promise((resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason));
				setTimeout(
					() =>
						resolve(
							Response.json({
								result: "success",
								time_last_update_utc: "Fri, 25 Sep 2026 00:02:31 +0000",
								rates: { SAR: 4.8 },
							}),
						),
					10,
				);
			}),
	);
	const aborted = new AbortController();
	const first = runTool(
		{ id: "1", name: "currency", arguments: '{"from":"GBP"}' },
		{ ...context(), signal: aborted.signal },
	);
	const second = runTool(
		{ id: "2", name: "currency", arguments: '{"from":"GBP"}' },
		context(),
	);
	aborted.abort();
	await expect(first).rejects.toThrow();
	expect(JSON.parse(await second)).toMatchObject({ result: 4.8 });
});

import { describeWeatherCode, toWeather } from "@server/tools/weather";
import { expect, test } from "vitest";

test("maps WMO codes to bilingual conditions", () => {
	expect(describeWeatherCode(0).condition).toBe("Clear skies");
	expect(describeWeatherCode(2).conditionAr).toBe("غائم جزئياً");
	expect(describeWeatherCode(95).condition).toBe("Thunderstorms");
});

test("shapes Open-Meteo data for the weather window", () => {
	const weather = toWeather(
		{
			current: {
				temperature_2m: 39.3,
				apparent_temperature: 35.4,
				relative_humidity_2m: 8,
				wind_speed_10m: 10.7,
				weather_code: 0,
			},
			hourly: {
				time: ["2026-09-24T18:00", "2026-09-24T19:00", "2026-09-24T20:00"],
				temperature_2m: [39.8, 38.9, 37.7],
			},
		},
		{ lat: 24.7, lon: 46.7, city: "Riyadh", cityAr: "الرياض" },
		null,
	);
	expect(weather).toMatchObject({
		cityAr: "الرياض",
		temperature: 39,
		feelsLike: 35,
		windKmh: 11,
	});
	expect(weather.hours).toEqual([
		{ time: "19:00", temperature: 39 },
		{ time: "20:00", temperature: 38 },
	]);
});

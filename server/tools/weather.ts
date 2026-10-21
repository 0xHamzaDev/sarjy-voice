import {
	AIR_WARNING_AQI,
	OPEN_METEO_AIR_URL,
	OPEN_METEO_GEOCODING_URL,
	OPEN_METEO_URL,
	TOOL_TIMEOUT_MS,
	WEATHER_FORECAST_HOURS,
} from "@server/config";
import type { ToolDefinition } from "@server/vendors/llm";
import { withTimeout } from "@server/withTimeout";
import type { AirQuality, Weather } from "@shared/protocol";
import { z } from "zod";
import { hereOf, type Place } from "./reverseGeocode";
import type { ToolContext } from "./toolRegistry";

const CITY_NAME_MAX_CHARS = 80;

const openMeteoResponse = z.object({
	current: z.object({
		temperature_2m: z.number(),
		apparent_temperature: z.number(),
		relative_humidity_2m: z.number(),
		wind_speed_10m: z.number(),
		weather_code: z.number(),
	}),
	hourly: z.object({
		time: z.array(z.string()),
		temperature_2m: z.array(z.number()),
	}),
});

const airResponse = z.object({
	current: z.object({
		us_aqi: z.number(),
		pm10: z.number(),
		dust: z.number(),
	}),
});

const geocodingResponse = z.object({
	results: z
		.array(
			z.object({
				name: z.string(),
				latitude: z.number(),
				longitude: z.number(),
			}),
		)
		.optional(),
});

type Condition = [maxCode: number, en: string, ar: string];

const CLEAR: Condition = [0, "Clear skies", "سماء صافية"];

const CONDITIONS: Condition[] = [
	CLEAR,
	[3, "Partly cloudy", "غائم جزئياً"],
	[48, "Foggy", "ضباب"],
	[67, "Rain", "مطر"],
	[77, "Snow", "ثلج"],
	[82, "Showers", "زخات مطر"],
	[99, "Thunderstorms", "عواصف رعدية"],
];

export function describeWeatherCode(code: number) {
	const [, condition, conditionAr] =
		CONDITIONS.find(([maxCode]) => code <= maxCode) ?? CLEAR;
	return { condition, conditionAr };
}

export function toWeather(
	data: z.infer<typeof openMeteoResponse>,
	place: Place,
	air: AirQuality | null,
): Weather {
	const { current, hourly } = data;
	return {
		city: place.city,
		cityAr: place.cityAr,
		temperature: Math.round(current.temperature_2m),
		feelsLike: Math.round(current.apparent_temperature),
		...describeWeatherCode(current.weather_code),
		windKmh: Math.round(current.wind_speed_10m),
		humidity: Math.round(current.relative_humidity_2m),
		hours: hourly.time.slice(1).map((time, index) => ({
			time: time.slice(11),
			temperature: Math.round(hourly.temperature_2m[index + 1] ?? 0),
		})),
		air,
	};
}

async function getJson<T>(url: URL, schema: z.ZodType<T>, signal: AbortSignal) {
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`${url.host} ${response.status}`);
	return schema.parse(await response.json());
}

async function searchCity(
	name: string,
	language: "en" | "ar",
	signal: AbortSignal,
) {
	const url = new URL(OPEN_METEO_GEOCODING_URL);
	url.searchParams.set("name", name);
	url.searchParams.set("count", "1");
	url.searchParams.set("language", language);
	const { results } = await getJson(url, geocodingResponse, signal);
	return results?.[0];
}

async function geocodeCity(
	nameEn: string,
	signal: AbortSignal,
): Promise<Place | null> {
	const [en, ar] = await Promise.all([
		searchCity(nameEn, "en", signal),
		searchCity(nameEn, "ar", signal),
	]);
	if (!en) return null;
	return {
		lat: en.latitude,
		lon: en.longitude,
		city: en.name,
		cityAr: ar?.name ?? en.name,
	};
}

async function fetchWeather(
	place: Place,
	signal: AbortSignal,
): Promise<Weather> {
	const url = new URL(OPEN_METEO_URL);
	url.searchParams.set("latitude", String(place.lat));
	url.searchParams.set("longitude", String(place.lon));
	url.searchParams.set(
		"current",
		"temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
	);
	url.searchParams.set("hourly", "temperature_2m");
	url.searchParams.set("timezone", "auto");
	url.searchParams.set("forecast_hours", String(WEATHER_FORECAST_HOURS + 1));
	const [forecast, air] = await Promise.all([
		getJson(url, openMeteoResponse, signal),
		fetchAirQuality(place, signal),
	]);
	return toWeather(forecast, place, air);
}

async function fetchAirQuality(
	place: Place,
	signal: AbortSignal,
): Promise<AirQuality | null> {
	const url = new URL(OPEN_METEO_AIR_URL);
	url.searchParams.set("latitude", String(place.lat));
	url.searchParams.set("longitude", String(place.lon));
	url.searchParams.set("current", "us_aqi,pm10,dust");
	try {
		const { current } = await getJson(url, airResponse, signal);
		return {
			aqi: Math.round(current.us_aqi),
			pm10: Math.round(current.pm10),
			dust: Math.round(current.dust),
		};
	} catch (error) {
		if (signal.aborted) throw error;
		console.error("air quality failed", error);
		return null;
	}
}

export const weatherArgs = z.object({
	city: z
		.string()
		.trim()
		.max(CITY_NAME_MAX_CHARS)
		.optional()
		.transform((city) => city || undefined),
});

export const weatherDefinition: ToolDefinition = {
	type: "function",
	function: {
		name: "weather",
		description:
			"Get current weather and the next hours' forecast. City is the English city name; omit it for the user's location. Call only when the user explicitly asks about the weather, temperature, rain, or wind for a place or 'outside'. Do not call for general advice or small talk. The forecast and air quality are shown on screen, so speak a short summary.",
		parameters: {
			type: "object",
			properties: { city: { type: "string" } },
		},
	},
};

export async function weatherTool(
	city: string | undefined,
	context: ToolContext,
): Promise<string> {
	const signal = withTimeout(context.signal, TOOL_TIMEOUT_MS);
	try {
		const place = city
			? await geocodeCity(city, signal)
			: await hereOf(context.coords);
		if (!place) return JSON.stringify({ error: "city_not_found" });
		const forecast = await fetchWeather(place, signal);
		context.onResult({ kind: "weather", weather: forecast });
		const unhealthy = (forecast.air?.aqi ?? 0) > AIR_WARNING_AQI;
		return JSON.stringify(
			unhealthy
				? {
						...forecast,
						mustMention:
							"The air is unhealthy with dust: warn the user in one short sentence.",
					}
				: forecast,
		);
	} catch (error) {
		if (context.signal.aborted) throw error;
		console.error("weather failed", error);
		return JSON.stringify({ error: "weather_unavailable" });
	}
}

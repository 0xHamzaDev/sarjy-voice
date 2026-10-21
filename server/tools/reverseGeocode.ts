import {
	FALLBACK_COORDS,
	NOMINATIM_REVERSE_URL,
	NOMINATIM_USER_AGENT,
	REVERSE_GEOCODE_CACHE_DECIMALS,
	REVERSE_GEOCODE_CITY_ZOOM,
	TOOL_TIMEOUT_MS,
} from "@server/config";
import type { City, Coords } from "@shared/protocol";
import { z } from "zod";

export type Place = Coords & City;

const RIYADH: City = { city: "Riyadh", cityAr: "الرياض" };
const NEARBY: City = { city: "Your location", cityAr: "موقعك" };

const nominatimResponse = z.object({
	name: z.string().min(1),
	namedetails: z
		.object({
			"name:ar": z.string().optional(),
			"name:en": z.string().optional(),
		})
		.nullish(),
});

const cache = new Map<string, Promise<City | null>>();

const keyOf = ({ lat, lon }: Coords) =>
	`${lat.toFixed(REVERSE_GEOCODE_CACHE_DECIMALS)},${lon.toFixed(REVERSE_GEOCODE_CACHE_DECIMALS)}`;

async function lookup({ lat, lon }: Coords): Promise<City | null> {
	const url = new URL(NOMINATIM_REVERSE_URL);
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("lat", String(lat));
	url.searchParams.set("lon", String(lon));
	url.searchParams.set("zoom", String(REVERSE_GEOCODE_CITY_ZOOM));
	url.searchParams.set("namedetails", "1");
	url.searchParams.set("accept-language", "en");
	const response = await fetch(url, {
		headers: { "user-agent": NOMINATIM_USER_AGENT },
		signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`nominatim ${response.status}`);
	const { name, namedetails } = nominatimResponse.parse(await response.json());
	const city = namedetails?.["name:en"] ?? name;
	return { city, cityAr: namedetails?.["name:ar"] ?? city };
}

export const isFallbackCoords = ({ lat, lon }: Coords) =>
	lat === FALLBACK_COORDS.lat && lon === FALLBACK_COORDS.lon;

export function cityOf(coords: Coords): Promise<City | null> {
	if (isFallbackCoords(coords)) return Promise.resolve(RIYADH);
	const key = keyOf(coords);
	const cached = cache.get(key);
	if (cached) return cached;
	const pending = lookup(coords).catch((error) => {
		console.error("reverse geocode failed", error);
		cache.delete(key);
		return null;
	});
	cache.set(key, pending);
	return pending;
}

export const hereOf = async (coords: Coords): Promise<Place> => ({
	...coords,
	...((await cityOf(coords)) ?? NEARBY),
});

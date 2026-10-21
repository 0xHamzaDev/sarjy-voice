import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { setLocation } from "./sky.functions";

const GEO_OPTIONS: PositionOptions = {
	enableHighAccuracy: true,
	maximumAge: 600_000,
	timeout: 10_000,
};
const COORD_DECIMALS = 3;

const rounded = (value: number) => Number(value.toFixed(COORD_DECIMALS));

export function useLocation() {
	const router = useRouter();
	useEffect(() => {
		let active = true;
		navigator.geolocation?.getCurrentPosition(
			async ({ coords }) => {
				if (!active) return;
				try {
					const changed = await setLocation({
						data: {
							lat: rounded(coords.latitude),
							lon: rounded(coords.longitude),
							tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
						},
					});
					if (changed && active) await router.invalidate();
				} catch (error) {
					console.error("location save failed", error);
				}
			},
			(error) => console.warn("location unavailable", error.message),
			GEO_OPTIONS,
		);
		return () => {
			active = false;
		};
	}, [router]);
}

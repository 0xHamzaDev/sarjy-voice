import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function useClock() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		let timer: number | undefined;
		const tick = () => {
			setNow(new Date());
			timer = window.setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS));
		};
		tick();
		return () => window.clearTimeout(timer);
	}, []);
	return now;
}

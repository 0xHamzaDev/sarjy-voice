const TIMER_PAD = 2;
const CENTER_BYTE = 128;

export function formatCallDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(TIMER_PAD, "0")}`;
}

export function quantizeWave(samples: Uint8Array, columns: number): number[] {
	if (samples.length === 0) return [];
	const chunk = Math.max(1, Math.floor(samples.length / columns));
	return Array.from({ length: columns }, (_, column) => {
		const start = column * chunk;
		const end = Math.min(samples.length, start + chunk);
		let peak = 0;
		for (let i = start; i < end; i++) {
			const value =
				Math.abs((samples[i] ?? CENTER_BYTE) - CENTER_BYTE) / CENTER_BYTE;
			if (value > peak) peak = value;
		}
		return peak;
	});
}

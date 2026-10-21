export function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
	return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

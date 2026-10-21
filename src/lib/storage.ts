import { useCallback, useEffect, useState } from "react";

export const readStored = (key: string) => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};

export const store = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {}
};

export function useStored<T extends string>(
	key: string,
	fallback: T,
	options: readonly T[],
) {
	const [value, setValue] = useState(fallback);
	useEffect(() => {
		const stored = options.find((option) => option === readStored(key));
		if (stored) setValue(stored);
	}, [key, options]);
	const update = useCallback(
		(next: T) => {
			setValue(next);
			store(key, next);
		},
		[key],
	);
	return [value, update] as const;
}

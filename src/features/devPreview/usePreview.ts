import type { Lang } from "@shared/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createPreviewPlayer,
	PREVIEW_START,
	type PreviewState,
	type View,
} from "./previewStates";

export function usePreview() {
	const [preview, setPreview] = useState<View | null>(null);
	const previewPlayerRef = useRef<ReturnType<
		typeof createPreviewPlayer
	> | null>(null);

	const start = useCallback(() => {
		previewPlayerRef.current?.dispose();
		const previewPlayer = createPreviewPlayer((patch) =>
			setPreview((current) => (current ? { ...current, ...patch } : current)),
		);
		previewPlayerRef.current = previewPlayer;
		setPreview(PREVIEW_START);
		return previewPlayer;
	}, []);

	const show = useCallback(
		(value: PreviewState, lang: Lang, name: string) =>
			start().show(value, lang, name),
		[start],
	);

	const play = useCallback(
		(lang: Lang, name: string) => start().play(lang, name),
		[start],
	);

	const leave = useCallback(() => {
		previewPlayerRef.current?.dispose();
		previewPlayerRef.current = null;
		setPreview(null);
	}, []);

	useEffect(() => () => previewPlayerRef.current?.dispose(), []);

	return { preview, show, play, leave };
}

import type { ToolResult } from "@shared/protocol";
import { useCallback, useEffect, useState } from "react";
import type { PreviewState } from "@/features/devPreview/previewStates";

export function useToolWindow(result: ToolResult | null, state: PreviewState) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (state === "error" || state === "memory-learned") setOpen(false);
	}, [state]);

	useEffect(() => {
		setOpen(result !== null);
	}, [result]);

	const close = useCallback(() => setOpen(false), []);

	return { shown: result !== null && open, close };
}

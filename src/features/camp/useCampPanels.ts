import type { ToolResult } from "@shared/protocol";
import { useCallback, useEffect, useState } from "react";
import type { PreviewState } from "@/features/devPreview/previewStates";
import { useToolWindow } from "@/features/tools/useToolWindow";

export function useCampPanels(
	toolResult: ToolResult | null,
	state: PreviewState,
	onEscape: () => void,
) {
	const [introFinished, setIntroFinished] = useState(false);
	const finishIntro = useCallback(() => setIntroFinished(true), []);
	const [memoriesOpen, setMemoriesOpen] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const { shown: toolShown, close: closeTool } = useToolWindow(
		toolResult,
		state,
	);

	useEffect(() => {
		if (!introFinished) return;
		const talk = document.querySelector<HTMLButtonElement>("#microphone");
		(talk && !talk.disabled ? talk : document.getElementById("world"))?.focus({
			preventScroll: true,
		});
	}, [introFinished]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || document.querySelector("dialog[open]"))
				return;
			onEscape();
			closeTool();
			setSelected(null);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onEscape, closeTool]);

	return {
		introFinished,
		finishIntro,
		memoriesOpen,
		setMemoriesOpen,
		selected,
		setSelected,
		toolShown,
		closeTool,
	};
}

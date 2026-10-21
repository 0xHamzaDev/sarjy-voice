import type { Lang } from "@shared/protocol";
import { useEffect, useRef, useState } from "react";
import { type StringKey, translate } from "@/i18n/strings";
import type { Memory } from "./starSlots";

type MemoryDialogProps = {
	open: boolean;
	lang: Lang;
	memories: Memory[];
	onClose: () => void;
	onForget: (id: number) => Promise<void>;
	onForgetAll: () => Promise<void>;
	onLocate: (id: number) => void;
};

export const MemoryDialog = ({
	open,
	lang,
	memories,
	onClose,
	onForget,
	onForgetAll,
	onLocate,
}: MemoryDialogProps) => {
	const t = translate(lang);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const [confirming, setConfirming] = useState(false);
	const [feedback, setFeedback] = useState<StringKey | null>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			setConfirming(false);
			setFeedback(null);
			dialog.showModal();
		}
		if (!open && dialog.open) dialog.close();
	}, [open]);

	const run = async (action: Promise<void>, done: StringKey) => {
		try {
			await action;
			setFeedback(done);
		} catch {
			setFeedback("forgetFailed");
		}
		setConfirming(false);
		closeRef.current?.focus();
	};

	return (
		<dialog
			id="memory-dialog"
			ref={dialogRef}
			aria-labelledby="memory-title"
			onClose={onClose}
		>
			<div className="panel-heading">
				<h2 id="memory-title">{t("yourMemories")}</h2>
				<button
					id="close-memories"
					type="button"
					className="quiet close"
					ref={closeRef}
					onClick={onClose}
				>
					{t("close")}
				</button>
			</div>
			<p id="memory-storage">{t("savedMemories")}</p>
			<p id="memory-empty" hidden={memories.length > 0}>
				{t("memoryEmpty")}
			</p>
			<ul id="memory-list">
				{memories.map((memory) => (
					<li key={memory.id}>
						<button
							type="button"
							className="quiet memory-content"
							dir="auto"
							onClick={() => onLocate(memory.id)}
						>
							{memory.content}
						</button>
						<button
							type="button"
							className="quiet"
							aria-label={`${t("forget")}: ${memory.content}`}
							onClick={() => run(onForget(memory.id), "forgot")}
						>
							{t("forget")}
						</button>
					</li>
				))}
			</ul>
			<button
				id="clear-memories"
				type="button"
				className="quiet"
				hidden={memories.length === 0}
				onClick={() => setConfirming(true)}
			>
				{t("clearMemories")}
			</button>
			<div id="clear-confirm" hidden={!confirming}>
				<p>{t("clearConfirm")}</p>
				<button
					id="confirm-clear"
					type="button"
					onClick={() => run(onForgetAll(), "cleared")}
				>
					{t("confirmClear")}
				</button>
				<button
					id="cancel-clear"
					type="button"
					className="quiet"
					onClick={() => setConfirming(false)}
				>
					{t("cancel")}
				</button>
			</div>
			<p id="memory-feedback" aria-live="polite">
				{feedback && t(feedback)}
			</p>
		</dialog>
	);
};

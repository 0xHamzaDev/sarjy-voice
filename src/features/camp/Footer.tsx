import type { Lang } from "@shared/protocol";
import { useEffect, useState } from "react";
import { DevPanel } from "@/features/devPreview/DevPanel";
import type { PreviewState } from "@/features/devPreview/previewStates";
import { LatencyPanel } from "@/features/latency/LatencyPanel";
import type { Phase, SkyTimes } from "@/features/sky/skyPhase";
import type { WaterfallData } from "@/features/voice/voiceState";
import { translate } from "@/i18n/strings";

type PanelId = "latency" | "dev";

type FooterProps = {
	lang: Lang;
	count: number;
	onMemories: () => void;
	timings: WaterfallData | null;
	timingNote: string;
	phase: Phase;
	onPhase: (phase: Phase) => void;
	state: PreviewState;
	onPreview: (state: PreviewState | "replay") => void;
	sky: SkyTimes | null;
};

export const Footer = ({
	lang,
	count,
	onMemories,
	timings,
	timingNote,
	phase,
	onPhase,
	state,
	onPreview,
	sky,
}: FooterProps) => {
	const t = translate(lang);
	const [panel, setPanel] = useState<PanelId | null>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPanel(null);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const close = () => setPanel(null);
	const onPanel = (id: PanelId) =>
		setPanel((current) => (current === id ? null : id));
	return (
		<>
			<footer>
				<button
					id="memories-toggle"
					type="button"
					className="quiet"
					aria-haspopup="dialog"
					aria-controls="memory-dialog"
					onClick={onMemories}
				>
					<span aria-hidden="true">✧</span>{" "}
					<span id="memory-count">{`${count} ${t("memoryLabel")}`}</span>
				</button>
				<div className="footer-tools">
					<button
						id="latency-toggle"
						type="button"
						className="quiet"
						aria-expanded={panel === "latency"}
						aria-controls="latency-panel"
						onClick={() => onPanel("latency")}
					>
						<span aria-hidden="true">▥</span> <span>{t("latency")}</span>
					</button>
					{import.meta.env.DEV && (
						<button
							id="dev-toggle"
							type="button"
							className="quiet"
							aria-expanded={panel === "dev"}
							aria-controls="dev-panel"
							aria-label={t("sceneControls")}
							onClick={() => onPanel("dev")}
						>
							&lt;/&gt;
						</button>
					)}
				</div>
			</footer>
			{panel === "latency" && (
				<LatencyPanel
					lang={lang}
					timings={timings}
					note={timingNote}
					onClose={close}
				/>
			)}
			{panel === "dev" && (
				<DevPanel
					lang={lang}
					phase={phase}
					onPhase={onPhase}
					state={state}
					onState={onPreview}
					onAddMemory={() => {
						close();
						onPreview("memory-learned");
					}}
					onReplay={() => {
						close();
						onPreview("replay");
					}}
					prayerTimes={
						sky
							? `Fajr ${sky.Fajr} / Sunrise ${sky.Sunrise} · Maghrib ${sky.Maghrib} / Isha ${sky.Isha}`
							: "—"
					}
					onClose={close}
				/>
			)}
		</>
	);
};

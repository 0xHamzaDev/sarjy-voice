import type { Lang } from "@shared/protocol";
import { useEffect, useRef } from "react";
import { PHASES, type Phase } from "@/features/sky/skyPhase";
import { translate } from "@/i18n/strings";
import { PREVIEW_STATES, type PreviewState } from "./previewStates";

const PHASE_OPTIONS: Record<Phase, string> = {
	night: "After Isha · العشاء",
	fajr: "Fajr · الفجر",
	day: "Daylight · النهار",
	maghrib: "Maghrib · المغرب",
};

type DevPanelProps = {
	lang: Lang;
	phase: Phase;
	onPhase: (phase: Phase) => void;
	state: PreviewState;
	onState: (state: PreviewState) => void;
	onAddMemory: () => void;
	onReplay: () => void;
	prayerTimes: string;
	onClose: () => void;
};

export const DevPanel = ({
	lang,
	phase,
	onPhase,
	state,
	onState,
	onAddMemory,
	onReplay,
	prayerTimes,
	onClose,
}: DevPanelProps) => {
	const t = translate(lang);
	const closeRef = useRef<HTMLButtonElement>(null);
	useEffect(() => closeRef.current?.focus(), []);
	return (
		<aside id="dev-panel" className="panel">
			<div className="panel-heading">
				<h2>{t("sceneControls")}</h2>
				<button
					type="button"
					className="quiet close"
					aria-label={t("close")}
					ref={closeRef}
					onClick={onClose}
				>
					×
				</button>
			</div>
			<p>{t("mockNote")}</p>
			<label htmlFor="phase">{t("timeOfDay")}</label>
			<select
				id="phase"
				value={phase}
				onChange={(event) => {
					const next = PHASES.find((item) => item === event.target.value);
					if (next) onPhase(next);
				}}
			>
				{PHASES.map((item) => (
					<option key={item} value={item}>
						{PHASE_OPTIONS[item]}
					</option>
				))}
			</select>
			<span className="panel-label">{t("stateLabel")}</span>
			<div id="state-buttons" className="state-buttons">
				{PREVIEW_STATES.map((value) => (
					<button
						key={value}
						type="button"
						data-state={value}
						aria-pressed={state === value}
						onClick={() => onState(value)}
					>
						{t(value)}
					</button>
				))}
			</div>
			<button id="new-memory" type="button" onClick={onAddMemory}>
				{t("addMemory")}
			</button>
			<button id="replay" type="button" onClick={onReplay}>
				{t("replay")}
			</button>
			<div className="prayer-times" dir="ltr">
				{prayerTimes}
			</div>
		</aside>
	);
};

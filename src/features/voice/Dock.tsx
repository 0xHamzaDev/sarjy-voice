import type { Lang } from "@shared/protocol";
import type { ReactNode } from "react";
import { translate } from "@/i18n/strings";
import type { CallState } from "./voiceState";

const MIC_PATH =
	"M9 1h6v2h2v12h-2v2H9v-2H7V3h2zM3 11h2v7h2v2h10v-2h2v-7h2v9h-2v2h-6v3h4v2H7v-2h4v-3H5v-2H3z";
const SLASH_PATH =
	"M1 2h2v3h-2zM3 4h2v3h-2zM5 6h2v3h-2zM7 8h2v3h-2zM9 10h2v3h-2zM11 12h2v3h-2zM13 14h2v3h-2zM15 16h2v3h-2zM17 18h2v3h-2zM19 20h2v3h-2zM21 22h2v3h-2z";
const SLASH_GAP_PATH =
	"M0 1h4v5h-4zM2 3h4v5h-4zM4 5h4v5h-4zM6 7h4v5h-4zM8 9h4v5h-4zM10 11h4v5h-4zM12 13h4v5h-4zM14 15h4v5h-4zM16 17h4v5h-4zM18 19h4v5h-4zM20 21h4v5h-4z";
const HANG_UP_PATH = `${SLASH_PATH}M21 2h2v3h-2zM19 4h2v3h-2zM17 6h2v3h-2zM15 8h2v3h-2zM13 10h2v3h-2zM11 12h2v3h-2zM9 14h2v3h-2zM7 16h2v3h-2zM5 18h2v3h-2zM3 20h2v3h-2zM1 22h2v3h-2z`;
const PHONE_PATH = "M3 2h5v6H5v3l8 8h3v-3h6v5h-2v2h-5l-4-2-8-8-2-4V4h2z";

type DockProps = {
	lang: Lang;
	transcript: string;
	showTranscript: boolean;
	call: CallState;
	hint: string;
	connecting: boolean;
	onMic: () => void;
	onEnd: () => void;
	callDuration: string | null;
	note: ReactNode;
};

export const Dock = ({
	lang,
	transcript,
	showTranscript,
	call,
	hint,
	connecting,
	onMic,
	onEnd,
	callDuration,
	note,
}: DockProps) => {
	const t = translate(lang);
	return (
		<section
			className="voice-controls"
			aria-label={t("voiceControls")}
			data-call={call}
		>
			<p
				id="transcript"
				aria-live="polite"
				dir="auto"
				style={{ opacity: showTranscript ? 1 : 0 }}
			>
				{transcript}
			</p>
			<div className="mic-copy">
				<output id="mic-hint">{hint}</output>
				{callDuration && (
					<span id="call-timer" dir="ltr">
						{callDuration}
					</span>
				)}
				<div id="voice-note">{note}</div>
			</div>
			<div className="call-actions">
				<button
					id="microphone"
					type="button"
					aria-describedby="mic-hint"
					aria-pressed={call === "off" ? undefined : call === "muted"}
					disabled={connecting}
					onClick={onMic}
				>
					<svg viewBox="0 0 24 28" aria-hidden="true">
						<mask id="mic-gap">
							<rect width="24" height="28" fill="#fff" />
							{call === "muted" && <path d={SLASH_GAP_PATH} fill="#000" />}
						</mask>
						<path
							d={call === "off" ? PHONE_PATH : MIC_PATH}
							mask="url(#mic-gap)"
						/>
						{call === "muted" && <path d={SLASH_PATH} />}
					</svg>
					<span>
						{t(
							call === "off"
								? "callSarjy"
								: call === "muted"
									? "unmute"
									: "mute",
						)}
					</span>
				</button>
				{call !== "off" && (
					<button
						id="end-call"
						type="button"
						className="hang-up"
						aria-keyshortcuts="Escape"
						onClick={() => {
							onEnd();
							requestAnimationFrame(() =>
								document.getElementById("microphone")?.focus(),
							);
						}}
					>
						<svg viewBox="0 0 24 26" aria-hidden="true">
							<path d={HANG_UP_PATH} />
						</svg>
						<span>{t(connecting ? "cancelCall" : "endCall")}</span>
					</button>
				)}
			</div>
		</section>
	);
};

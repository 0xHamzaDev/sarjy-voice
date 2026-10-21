import type { Lang } from "@shared/protocol";
import { translate } from "@/i18n/strings";
import { CallWave } from "./CallWave";
import { MicSelect } from "./MicSelect";
import type { useVoice } from "./useVoice";
import { hostState } from "./voiceState";

type DockNoteProps = {
	lang: Lang;
	previewing: boolean;
	voice: ReturnType<typeof useVoice>;
};

export const DockNote = ({ lang, previewing, voice }: DockNoteProps) => {
	const t = translate(lang);
	if (previewing) return t("demoNote");
	const canChoose = voice.mics.length > 1;
	return (
		<>
			<span>
				{t(
					voice.phase === "connecting"
						? "micPermissionNote"
						: voice.prepareTimedOut
							? "prepareTimeout"
							: voice.call === "muted"
								? "mutedNote"
								: voice.phase === "ready"
									? "talkNote"
									: "callNote",
				)}
			</span>
			{voice.audioBlocked && (
				<button type="button" className="quiet" onClick={voice.resumeAudio}>
					{t("resumeAudio")}
				</button>
			)}
			{canChoose && (
				<details className="mic-settings">
					<summary>{t("microphone")}</summary>
					<MicSelect
						mics={voice.mics}
						value={voice.micId}
						onChange={voice.chooseMic}
						label={t("microphone")}
						defaultLabel={t("defaultMic")}
					/>
				</details>
			)}
			{voice.call !== "off" && (
				<CallWave
					mode={
						voice.phase === "preparing"
							? "calling"
							: voice.call === "muted"
								? "muted"
								: hostState(voice.state, voice.call)
					}
					micAnalyser={voice.micAnalyser}
					sarjyAnalyser={voice.sarjyAnalyser}
					label={
						voice.phase === "preparing" ? t("connecting") : t("inputLevel")
					}
				/>
			)}
		</>
	);
};

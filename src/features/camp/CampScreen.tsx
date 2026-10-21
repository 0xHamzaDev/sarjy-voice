import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePreview } from "@/features/devPreview/usePreview";
import { Constellation } from "@/features/memories/Constellation";
import { MemoryDialog } from "@/features/memories/MemoryDialog";
import {
	forgetAllMemories,
	forgetMemory,
} from "@/features/memories/memories.functions";
import type { Memory } from "@/features/memories/starSlots";
import { CampCanvas } from "@/features/scene/CampCanvas";
import { sceneState } from "@/features/scene/sceneState";
import { useSceneAssets } from "@/features/scene/useSceneAssets";
import { clockLabel } from "@/features/sky/localClock";
import { SkyCaption } from "@/features/sky/SkyCaption";
import type { getSky } from "@/features/sky/sky.functions";
import { useLocation } from "@/features/sky/useLocation";
import { useCampSounds } from "@/features/sounds/useCampSounds";
import { ToolWindow } from "@/features/tools/ToolWindow";
import { Dock } from "@/features/voice/Dock";
import { DockNote } from "@/features/voice/DockNote";
import { ErrorChip } from "@/features/voice/ErrorChip";
import { useVoice } from "@/features/voice/useVoice";
import { VoiceStage } from "@/features/voice/VoiceStage";
import { registerUser } from "@/features/welcome/user.functions";
import { WelcomeDialog } from "@/features/welcome/WelcomeDialog";
import { translate } from "@/i18n/strings";
import { useLang } from "@/i18n/useLang";
import { Footer } from "./Footer";
import { Masthead } from "./Masthead";
import { useCallControl } from "./useCallControl";
import { useCampPanels } from "./useCampPanels";
import { useCampScene } from "./useCampScene";
import { useCampStatus } from "./useCampStatus";

type CampScreenProps = {
	loading: boolean;
	user: { id: string; name: string } | null;
	sky: Awaited<ReturnType<typeof getSky>>;
	memories: Memory[];
};

export function CampScreen({ loading, user, sky, memories }: CampScreenProps) {
	const router = useRouter();
	const [lang, setLang] = useLang();
	const t = translate(lang);
	useLocation();
	const campSounds = useCampSounds();
	const assets = useSceneAssets();
	const voice = useVoice(user !== null);
	const { preview, show, play, leave } = usePreview();
	const scene = sceneState(
		voice.state,
		voice.call,
		voice.level,
		memories,
		preview,
	);
	const { view } = scene;
	const { state } = view;
	const control = useCallControl(voice, lang, scene.busy, leave);
	const panels = useCampPanels(voice.state.toolResult, state, control.hangUp);
	const camp = useCampScene(sky.times, view);
	const status = useCampStatus(t, voice, scene, control, campSounds.failed);
	const lastMemoryId = voice.state.lastMemoryId;

	useEffect(() => {
		if (lastMemoryId !== null) void router.invalidate();
	}, [lastMemoryId, router]);

	const refresh = async (action: Promise<unknown>) => {
		await action;
		await router.invalidate();
	};
	const name = voice.state.name ?? user?.name ?? null;
	const toggleLang = () => setLang(lang === "ar" ? "en" : "ar");

	return (
		<>
			<main
				id="world"
				tabIndex={-1}
				inert={!panels.introFinished}
				data-phase={camp.phase}
				data-state={state}
				data-speaking-pose={camp.pose}
				data-entrance={preview ? "seated" : control.entrance}
				className={panels.toolShown ? "has-result" : undefined}
			>
				<CampCanvas
					phase={camp.phase}
					level={view.level}
					sceneRef={camp.sceneRef}
					arrivalRef={control.arrivalRef}
					label={status.hostLabel}
					pressed={scene.active}
					hostName={t("hostName")}
					onHost={control.onHost}
				/>
				<Masthead
					lang={lang}
					soundOn={campSounds.soundOn}
					onSound={campSounds.toggle}
					onLanguage={() => {
						leave();
						toggleLang();
					}}
				/>
				<SkyCaption
					lang={lang}
					phase={camp.phase}
					clock={clockLabel(camp.now, lang)}
					place={sky.place}
				/>
				<Constellation
					stars={camp.stars}
					lang={lang}
					selected={panels.selected}
					onSelect={panels.setSelected}
					newId={view.newId}
					referencedId={view.referencedId}
					onNewStar={camp.onNewStar}
				/>
				<VoiceStage
					lang={lang}
					name={name}
					showIdle={
						state === "idle" || state === "listening" || state === "error"
					}
					thinking={state === "thinking"}
					reply={control.entering ? null : scene.reply}
				/>
				{voice.state.toolResult && (
					<ToolWindow
						result={voice.state.toolResult}
						lang={lang}
						open={panels.toolShown}
						onClose={() => {
							panels.closeTool();
							document.getElementById("microphone")?.focus();
						}}
					/>
				)}
				<div
					id="memory-notice"
					aria-live="polite"
					hidden={state !== "memory-learned"}
				>
					{t("learned")}
				</div>
				<ErrorChip
					code={status.errorKey}
					lang={lang}
					onRetry={status.onRetry}
				/>
				<Dock
					lang={lang}
					transcript={view.transcript}
					showTranscript={scene.active && state !== "memory-learned"}
					call={voice.call}
					hint={status.hint}
					connecting={control.dockDisabled}
					onMic={control.onMic}
					onEnd={control.hangUp}
					callDuration={status.callDuration}
					note={
						<DockNote lang={lang} previewing={preview !== null} voice={voice} />
					}
				/>
				<Footer
					lang={lang}
					count={view.memories.length}
					onMemories={() => {
						leave();
						panels.setMemoriesOpen(true);
					}}
					timings={view.timings}
					timingNote={
						voice.state.timings
							? `${t("latencyNote")} ${voice.state.timings.llmProvider} · ${voice.state.timings.pipeline}`
							: t("latencyEmpty")
					}
					phase={camp.phase}
					onPhase={camp.setPhaseOverride}
					state={state}
					onPreview={(value) => {
						control.stopCall();
						const guest = name || t("friend");
						value === "replay" ? play(lang, guest) : show(value, lang, guest);
					}}
					sky={sky.times}
				/>
				<p id="announcer" className="sr-only" aria-live="polite">
					{status.announcer}
				</p>
				<MemoryDialog
					open={panels.memoriesOpen}
					lang={lang}
					memories={memories}
					onClose={() => panels.setMemoriesOpen(false)}
					onForget={(id) => refresh(forgetMemory({ data: { id } }))}
					onForgetAll={() => refresh(forgetAllMemories())}
					onLocate={(id) => {
						panels.setMemoriesOpen(false);
						panels.setSelected(id);
						requestAnimationFrame(() =>
							document
								.querySelector<HTMLButtonElement>(
									`.memory-star[data-id="${id}"]`,
								)
								?.focus(),
						);
					}}
				/>
			</main>
			{!panels.introFinished && (
				<WelcomeDialog
					lang={lang}
					loading={loading || assets === "loading"}
					ready={user !== null}
					assetsFailed={assets === "failed"}
					onEntered={panels.finishIntro}
					mics={voice.mics}
					micId={voice.micId}
					onMic={voice.chooseMic}
					onLanguage={toggleLang}
					onSubmit={(name) => refresh(registerUser({ data: { name } }))}
				/>
			)}
		</>
	);
}

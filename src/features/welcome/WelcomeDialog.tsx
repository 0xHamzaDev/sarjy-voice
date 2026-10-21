import { type Lang, NAME_MAX_CHARS } from "@shared/protocol";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MicSelect } from "@/features/voice/MicSelect";
import { translate } from "@/i18n/strings";
import { FalconFlight } from "./FalconFlight";
import { exitIntro, INTRO_EXIT_MS } from "./introTransition";

type WelcomeDialogProps = {
	lang: Lang;
	loading: boolean;
	ready: boolean;
	assetsFailed: boolean;
	mics: MediaDeviceInfo[];
	micId: string;
	onMic: (deviceId: string) => void;
	onLanguage: () => void;
	onSubmit: (name: string) => Promise<void>;
	onEntered: () => void;
};

export const WelcomeDialog = ({
	lang,
	loading,
	ready,
	assetsFailed,
	mics,
	micId,
	onMic,
	onLanguage,
	onSubmit,
	onEntered,
}: WelcomeDialogProps) => {
	const t = translate(lang);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const waiting = loading || pending || ready;

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		dialog.close();
		dialog.showModal();
		return () => dialog.close();
	}, []);

	useEffect(() => {
		if (ready && !loading && !assetsFailed) setLeaving(true);
	}, [ready, loading, assetsFailed]);

	useEffect(() => {
		if (!leaving || !dialogRef.current) return;
		const controller = new AbortController();
		void exitIntro(dialogRef.current, controller.signal)
			.then((complete) => {
				if (complete) onEntered();
			})
			.catch((error) => {
				console.error("intro transition failed", error);
				onEntered();
			});
		return () => controller.abort();
	}, [leaving, onEntered]);

	useEffect(() => {
		if (!waiting && !assetsFailed)
			dialogRef.current?.querySelector<HTMLInputElement>("#name")?.focus();
	}, [waiting, assetsFailed]);

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = String(
			new FormData(event.currentTarget).get("name") ?? "",
		).trim();
		setPending(true);
		setFailed(false);
		try {
			await onSubmit(name);
		} catch {
			setFailed(true);
			setPending(false);
		}
	};

	return (
		<dialog
			id="welcome"
			open
			ref={dialogRef}
			aria-labelledby="welcome-title"
			aria-busy={waiting && !assetsFailed && !leaving}
			data-stage={leaving ? "leaving" : waiting ? "loading" : "welcome"}
			style={{ "--intro-exit-ms": `${INTRO_EXIT_MS}ms` } as CSSProperties}
			onCancel={(event) => event.preventDefault()}
		>
			<div className="intro-veil" aria-hidden="true" />
			<div className="intro-screen">
				<span className="welcome-star" aria-hidden="true">
					✦
				</span>
				<div className="eyebrow">{t("welcomeEyebrow")}</div>
				<h2 id="welcome-title">{t(waiting ? "introTitle" : "welcomeTitle")}</h2>
				<p>{t("welcomeBody")}</p>
				<div className="intro-content">
					<output className="intro-status" hidden={!waiting && !assetsFailed}>
						<span className="intro-stars" aria-hidden="true">
							✦ · ✦ · ✦
						</span>
						<span>
							{t(
								assetsFailed
									? "introFailed"
									: leaving
										? "introReady"
										: "introLoading",
							)}
						</span>
						{assetsFailed ? (
							<button type="button" onClick={() => location.reload()}>
								{t("retry")}
							</button>
						) : (
							<span className="intro-loading-line" aria-hidden="true" />
						)}
					</output>
					<form
						id="name-form"
						onSubmit={submit}
						aria-hidden={waiting || assetsFailed}
						inert={waiting || assetsFailed}
					>
						<label htmlFor="name">{t("yourName")}</label>
						<input
							id="name"
							name="name"
							required
							pattern=".*\S.*"
							maxLength={NAME_MAX_CHARS}
							autoComplete="given-name"
							dir="auto"
						/>
						<div className="intro-mic">
							<label htmlFor="welcome-mic">{t("preferredMic")}</label>
							<MicSelect
								id="welcome-mic"
								mics={mics}
								value={micId}
								onChange={onMic}
								label={t("preferredMic")}
								defaultLabel={t("defaultMic")}
							/>
						</div>
						<button className="enter" type="submit" disabled={pending}>
							{t("enter")}
						</button>
						<button
							type="button"
							className="quiet"
							aria-label={t("switchLanguage")}
							onClick={onLanguage}
						>
							{t("languageButton")}
						</button>
						{failed && <p role="alert">{t("welcomeFailed")}</p>}
						<span className="dialog-note">{t("firstVisit")}</span>
					</form>
				</div>
			</div>
			{leaving && <FalconFlight />}
		</dialog>
	);
};

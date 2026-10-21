import type { Lang } from "@shared/protocol";
import { translate } from "@/i18n/strings";

type MastheadProps = {
	lang: Lang;
	soundOn: boolean;
	onSound: () => void;
	onLanguage: () => void;
};

export const Masthead = ({
	lang,
	soundOn,
	onSound,
	onLanguage,
}: MastheadProps) => {
	const t = translate(lang);
	return (
		<header className="masthead">
			<a className="wordmark" href="/" aria-label={t("home")}>
				<span className="brand-star" aria-hidden="true">
					✦
				</span>
				<span>
					SARJY
					<span className="brand-ar" lang="ar">
						سرجي
					</span>
				</span>
			</a>
			<div className="top-controls">
				<button
					id="ambience-toggle"
					type="button"
					className="quiet"
					aria-pressed={soundOn}
					onClick={onSound}
				>
					{t(soundOn ? "soundOn" : "soundOff")}
				</button>
				<button
					id="language"
					type="button"
					className="quiet language"
					lang={lang === "ar" ? "en" : "ar"}
					aria-label={t("switchLanguage")}
					onClick={onLanguage}
				>
					{t("languageButton")}
				</button>
			</div>
		</header>
	);
};

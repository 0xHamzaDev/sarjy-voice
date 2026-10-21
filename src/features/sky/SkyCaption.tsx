import type { City, Lang } from "@shared/protocol";
import { translate } from "@/i18n/strings";
import type { Phase } from "./skyPhase";

type SkyCaptionProps = {
	lang: Lang;
	phase: Phase;
	clock: string;
	place: City | null;
};

export const SkyCaption = ({ lang, phase, clock, place }: SkyCaptionProps) => {
	const t = translate(lang);
	const city = place && (lang === "ar" ? place.cityAr : place.city);
	return (
		<div className="scene-caption">
			<span className="tiny-star" aria-hidden="true">
				+
			</span>
			<span suppressHydrationWarning>
				{city ? t("skyOf").replace("{city}", city.toUpperCase()) : t("sky")}
			</span>
			<span className="caption-line" />
			<span id="phase-label" suppressHydrationWarning>
				{`${t(phase)} · ${clock}`}
			</span>
		</div>
	);
};

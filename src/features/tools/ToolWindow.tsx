import type { Lang, ToolResult } from "@shared/protocol";
import { useEffect, useRef } from "react";
import { type StringKey, translate } from "@/i18n/strings";
import { CurrencyBody } from "./CurrencyBody";
import { PrayerBody } from "./PrayerBody";
import { QiblaBody } from "./QiblaBody";
import { WeatherBody } from "./WeatherBody";

const TITLES: Record<ToolResult["kind"], StringKey> = {
	weather: "weatherTitle",
	prayer: "prayerTitle",
	currency: "currencyTitle",
	qibla: "qiblaTitle",
};

type ToolWindowProps = {
	result: ToolResult;
	lang: Lang;
	open: boolean;
	onClose: () => void;
};

export const ToolWindow = ({
	result,
	lang,
	open,
	onClose,
}: ToolWindowProps) => {
	const t = translate(lang);
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		if (open) titleRef.current?.focus({ preventScroll: true });
	}, [open]);

	return (
		<section
			id="weather-window"
			aria-labelledby="weather-title"
			hidden={!open}
			inert={!open}
		>
			<header className="weather-heading">
				<span>{t(TITLES[result.kind])}</span>
				<button
					id="close-weather"
					type="button"
					className="quiet"
					aria-label={t("closeTool")}
					onClick={onClose}
				>
					×
				</button>
			</header>
			{result.kind === "weather" && (
				<WeatherBody weather={result.weather} lang={lang} titleRef={titleRef} />
			)}
			{result.kind === "prayer" && (
				<PrayerBody prayer={result.prayer} lang={lang} titleRef={titleRef} />
			)}
			{result.kind === "currency" && (
				<CurrencyBody
					currency={result.currency}
					lang={lang}
					titleRef={titleRef}
				/>
			)}
			{result.kind === "qibla" && (
				<QiblaBody qibla={result.qibla} lang={lang} titleRef={titleRef} />
			)}
		</section>
	);
};

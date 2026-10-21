import type { Lang, PrayerCard, PrayerTimes } from "@shared/protocol";
import type { RefObject } from "react";
import { phaseClock, timeLabel } from "@/features/sky/localClock";
import { type StringKey, translate } from "@/i18n/strings";
import { nextPrayer, PRAYER_ORDER } from "./nextPrayer";

type PrayerBodyProps = {
	prayer: PrayerCard;
	lang: Lang;
	titleRef: RefObject<HTMLHeadingElement | null>;
};

const LABEL_KEYS: Record<keyof PrayerTimes, StringKey> = {
	fajr: "prayerFajr",
	sunrise: "prayerSunrise",
	dhuhr: "prayerDhuhr",
	asr: "prayerAsr",
	maghrib: "prayerMaghrib",
	isha: "prayerIsha",
};

export const PrayerBody = ({ prayer, lang, titleRef }: PrayerBodyProps) => {
	const t = translate(lang);
	const next = nextPrayer(prayer.times, phaseClock(new Date()));
	return (
		<>
			<div className="weather-current">
				<div>
					<h2 id="weather-title" ref={titleRef} tabIndex={-1}>
						{lang === "ar" ? prayer.cityAr : prayer.city}
					</h2>
					<p
						id="prayer-date"
						dir="ltr"
					>{`${prayer.date} · ${prayer.hijriDate}`}</p>
				</div>
			</div>
			<div id="prayer-times" className="weather-hours prayer-times">
				{PRAYER_ORDER.map((key) => (
					<div key={key} data-next={key === next || undefined}>
						<span>{t(LABEL_KEYS[key])}</span>
						<time dateTime={prayer.times[key]}>
							{timeLabel(prayer.times[key], lang)}
						</time>
					</div>
				))}
			</div>
			<p className="weather-sample">{t("prayerLive")}</p>
		</>
	);
};

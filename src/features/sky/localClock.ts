import type { Lang } from "@shared/protocol";

export const LOCALES: Record<Lang, string> = { ar: "ar-SA", en: "en-US" };

const labelFormat = (lang: Lang) =>
	new Intl.DateTimeFormat(LOCALES[lang], {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});

const LABEL_FORMATS: Record<Lang, Intl.DateTimeFormat> = {
	ar: labelFormat("ar"),
	en: labelFormat("en"),
};

export const clockLabel = (date: Date, lang: Lang) =>
	LABEL_FORMATS[lang].format(date);

const pad = (value: number) => String(value).padStart(2, "0");

export const phaseClock = (date: Date) =>
	`${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const minutesOf = (clock: string) =>
	Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

export const timeLabel = (clock: string, lang: Lang) => {
	const date = new Date();
	date.setHours(0, minutesOf(clock), 0, 0);
	return clockLabel(date, lang);
};

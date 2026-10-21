import { foldArabic } from "@server/voice/listen/cleanTranscript";
import { ARABIC_LETTER } from "@server/voice/listen/detectLanguage";
import { counted, spellArabicNumbers, toLatinDigits } from "./arabicNumbers";

const DIGIT = "[0-9٠-٩]";
const ISO_DATETIME = new RegExp(
	`(${DIGIT}{4})-(${DIGIT}{2})-(${DIGIT}{2})(?:[T ](${DIGIT}{1,2}:${DIGIT}{2})(?::${DIGIT}{2})?(?:[+-]${DIGIT}{2}:${DIGIT}{2}|Z)?)?`,
	"g",
);
const HIJRI_DATE = new RegExp(
	`(?<!${DIGIT})(${DIGIT}{1,2})-(${DIGIT}{1,2})-([1١][3-5٣-٥]${DIGIT}{2})(?!${DIGIT})(\\s*هـ)?`,
	"g",
);
const CLOCK_TIME = new RegExp(
	`(?<![0-9٠-٩])(${DIGIT}{1,2}:${DIGIT}{2})(?::${DIGIT}{2})?(?![0-9٠-٩])`,
	"g",
);
const ENGLISH_CLOCK_TIME =
	/(?<![\d:])(\d{1,2}:\d{2})(?::\d{2})?(?![\d:])(?!\s*[ap]\.?m\b)/gi;
const DEGREES = new RegExp(`(-?${DIGIT}+)\\s*°\\s*[CF]?`, "g");
const ARABIC_KM = new RegExp(
	`(?<=${DIGIT}\\s*)(?:كم|km)(\\s*/\\s*(?:ساعة|س|h))?(?!\\p{L})`,
	"gu",
);
const ENGLISH_UNIT =
	/(-?\d+(?:\.\d+)?)\s*(°\s*[CF]?|km\s*\/\s*h|kmh|kph|km)(?![a-z])/gi;
const ZERO_FRACTION = /(\d)\.0+(?!\d)/g;

const HIJRI_MONTHS_AR =
	"محرم،صفر،ربيع الأول،ربيع الآخر،جمادى الأولى،جمادى الآخرة،رجب،شعبان،رمضان،شوال،ذو القعدة،ذو الحجة".split(
		"،",
	);
const HIJRI_MONTHS_EN =
	"Muharram,Safar,Rabi al-Awwal,Rabi al-Thani,Jumada al-Ula,Jumada al-Akhirah,Rajab,Shaban,Ramadan,Shawwal,Dhul Qadah,Dhul Hijjah".split(
		",",
	);
const LAST_HIJRI_YEAR = 1600;

const PERIODS: [untilHour: number, word: string][] = [
	[4, "فجرًا"],
	[12, "صباحًا"],
	[15, "ظهرًا"],
	[17, "عصرًا"],
	[21, "مساءً"],
	[24, "ليلًا"],
];
const PERIOD_WORDS = new Set(
	[
		...PERIODS.map(([, word]) => word),
		..."الفجر الصبح الصباح الظهر العصر المغرب مساء المسا المساء الليل بالليل بعد ص م".split(
			" ",
		),
	].map(foldArabic),
);
const LEADING_WORD = /^[\p{L}\p{M}]+/u;

const HOURS = [
	"اثنعش",
	"وحدة",
	"ثنتين",
	"ثلاث",
	"أربع",
	"خمس",
	"ست",
	"سبع",
	"ثمان",
	"تسع",
	"عشر",
	"احدعش",
];
const MINUTES_PAST: Record<number, string> = {
	5: "وخمس",
	10: "وعشر",
	15: "وربع",
	20: "وثلث",
	30: "ونص",
};
const MINUTES_TO: Record<number, string> = {
	40: "إلا ثلث",
	45: "إلا ربع",
	50: "إلا عشر",
	55: "إلا خمس",
};
const HOURS_PER_HALF_DAY = 12;

const parseClock = (time: string) => {
	const [hourText = "", minuteText = ""] = toLatinDigits(time).split(":");
	return {
		hour: Number(hourText),
		minute: Number(minuteText),
		twentyFourHour:
			hourText.length === 2 || Number(hourText) > HOURS_PER_HALF_DAY,
	};
};

function speakClock(time: string, periodAllowed: boolean): string {
	const { hour, minute, twentyFourHour } = parseClock(time);
	const before = MINUTES_TO[minute];
	const spokenHour = HOURS[(hour + (before ? 1 : 0)) % HOURS_PER_HALF_DAY];
	const spoken = before
		? `${spokenHour} ${before}`
		: minute
			? `${spokenHour} ${MINUTES_PAST[minute] ?? `و${counted(minute, "دقيقة", "دقيقتين", "دقايق")}`}`
			: `${spokenHour}`;
	if (!periodAllowed || !twentyFourHour) return spoken;
	const period = PERIODS.find(([until]) => hour < until)?.[1] ?? "ليلًا";
	return `${spoken} ${period}`;
}

function speakEnglishClock(time: string): string {
	const { hour, minute, twentyFourHour } = parseClock(time);
	if (!twentyFourHour) return time;
	const twelveHour = hour % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY;
	const minutes = minute ? `:${String(minute).padStart(2, "0")}` : "";
	return `${twelveHour}${minutes} ${hour < HOURS_PER_HALF_DAY ? "AM" : "PM"}`;
}

const monthName = (month: number, locale: string) =>
	new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
		Date.UTC(2000, month - 1, 1),
	);

function speakDate(year: string, month: string, day: string): string {
	const [y, m, d] = [year, month, day].map((part) =>
		Number(toLatinDigits(part)),
	);
	const name =
		(y ?? 0) < LAST_HIJRI_YEAR
			? HIJRI_MONTHS_AR[(m ?? 0) - 1]
			: monthName(m ?? 0, "ar");
	return `${d} ${name ?? month} ${y}`;
}

function speakEnglishDate(year: string, month: string, day: string): string {
	const [y = 0, m = 0, d = 0] = [year, month, day].map(Number);
	const name =
		y < LAST_HIJRI_YEAR ? HIJRI_MONTHS_EN[m - 1] : monthName(m, "en-US");
	return y < LAST_HIJRI_YEAR ? `${d} ${name} ${y}` : `${name} ${d}, ${y}`;
}

function speakEnglishUnit(_: string, amount: string, unit: string): string {
	const plural = Math.abs(Number(amount)) === 1 ? "" : "s";
	if (unit.startsWith("°")) return `${amount} degree${plural}`;
	if (unit.toLowerCase() === "km") return `${amount} kilometer${plural}`;
	return `${amount} kilometer${plural} per hour`;
}

function speakableEnglish(sentence: string): string {
	return sentence
		.replace(ISO_DATETIME, (_, year, month, day, time) =>
			time
				? `${speakEnglishDate(year, month, day)} at ${speakEnglishClock(time)}`
				: speakEnglishDate(year, month, day),
		)
		.replace(HIJRI_DATE, (_, day, month, year) =>
			speakEnglishDate(year, month, day),
		)
		.replace(ENGLISH_CLOCK_TIME, (_, time) => speakEnglishClock(time))
		.replace(ZERO_FRACTION, "$1")
		.replace(ENGLISH_UNIT, speakEnglishUnit);
}

export function speakable(sentence: string): string {
	if (!ARABIC_LETTER.test(sentence)) return speakableEnglish(sentence);
	return spellArabicNumbers(
		sentence
			.replace(ISO_DATETIME, (_, year, month, day, time) =>
				time
					? `${speakDate(year, month, day)} الساعة ${speakClock(time, true)}`
					: speakDate(year, month, day),
			)
			.replace(
				HIJRI_DATE,
				(_, day, month, year, hijriMark) =>
					`${speakDate(year, month, day)}${hijriMark ? " هجري" : ""}`,
			)
			.replace(CLOCK_TIME, (match, time, offset: number, whole: string) => {
				const after = whole.slice(offset + match.length).trimStart();
				const nextWord = foldArabic(after.match(LEADING_WORD)?.[0] ?? "");
				return speakClock(time, !PERIOD_WORDS.has(nextWord));
			})
			.replace(DEGREES, "$1 درجة")
			.replace(ARABIC_KM, (_, perHour) => (perHour ? "كيلو بالساعة" : "كيلو")),
	);
}

export function stripMarkup(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/https?:\/\/\S+/g, "")
		.replace(/^\s*(?:#{1,6}|>|[-*•]|\d+[.)])\s+/gm, "")
		.replace(/[*_`~|#]+/g, "")
		.replace(/\p{Extended_Pictographic}️?/gu, "")
		.replace(/[^\P{L}\p{Script=Latin}\p{Script=Arabic}]+[!?.,]*/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}

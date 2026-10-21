const ONES = [
	"صفر",
	"واحد",
	"اثنين",
	"ثلاثة",
	"أربعة",
	"خمسة",
	"ستة",
	"سبعة",
	"ثمانية",
	"تسعة",
	"عشرة",
	"احدعش",
	"اثنعش",
	"ثلطعش",
	"أربعطعش",
	"خمسطعش",
	"ستطعش",
	"سبعطعش",
	"ثمنطعش",
	"تسعطعش",
];
const TENS = [
	"",
	"",
	"عشرين",
	"ثلاثين",
	"أربعين",
	"خمسين",
	"ستين",
	"سبعين",
	"ثمانين",
	"تسعين",
];
const HUNDREDS = [
	"",
	"مية",
	"ميتين",
	"ثلاث مية",
	"أربع مية",
	"خمس مية",
	"ست مية",
	"سبع مية",
	"ثمان مية",
	"تسع مية",
];
const COUNTED = [
	"",
	"",
	"",
	"ثلاث",
	"أربع",
	"خمس",
	"ست",
	"سبع",
	"ثمان",
	"تسع",
	"عشر",
];
const SCALES: [value: number, one: string, two: string, plural: string][] = [
	[1e9, "مليار", "مليارين", "مليارات"],
	[1e6, "مليون", "مليونين", "ملايين"],
	[1e3, "ألف", "ألفين", "آلاف"],
];
const MAX_SPOKEN = 1e12;
const MAX_WHOLE_DIGITS = 9;

function belowThousand(n: number): string {
	const rest = n % 100;
	const units = rest % 10;
	const tensWord =
		rest < 20
			? ONES[rest]
			: units
				? `${ONES[units]} و${TENS[Math.floor(rest / 10)]}`
				: TENS[rest / 10];
	return [HUNDREDS[Math.floor(n / 100)], rest ? tensWord : ""]
		.filter(Boolean)
		.join(" و");
}

export function counted(
	count: number,
	one: string,
	two: string,
	plural: string,
): string {
	if (count === 1) return one;
	if (count === 2) return two;
	if (count <= 10) return `${COUNTED[count]} ${plural}`;
	return `${arabicInteger(count)} ${one}`;
}

export function arabicInteger(n: number): string {
	if (n === 0) return ONES[0] ?? "";
	const parts: string[] = [];
	let rest = n;
	for (const scale of SCALES) {
		const count = Math.floor(rest / scale[0]);
		if (count) parts.push(counted(count, scale[1], scale[2], scale[3]));
		rest %= scale[0];
	}
	if (rest) parts.push(belowThousand(rest));
	return parts.join(" و");
}

const digitByDigit = (digits: string) =>
	[...digits].map((digit) => ONES[Number(digit)]).join(" ");

export const toLatinDigits = (text: string) =>
	text.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

export function speakArabicNumber(raw: string): string {
	const negative = raw.startsWith("-");
	const percent = /[%٪]$/.test(raw);
	const [whole = "", fraction] = toLatinDigits(raw)
		.replace(/[-%٪,٬]/g, "")
		.split(/[.٫]/);
	const value = Number(whole);
	const spokenWhole =
		(whole.length > 1 && whole.startsWith("0")) ||
		whole.length > MAX_WHOLE_DIGITS ||
		value >= MAX_SPOKEN
			? digitByDigit(whole)
			: arabicInteger(value);
	const spokenFraction =
		fraction && /[1-9]/.test(fraction)
			? ` فاصلة ${fraction.startsWith("0") ? digitByDigit(fraction) : arabicInteger(Number(fraction))}`
			: "";
	return `${negative ? "سالب " : ""}${spokenWhole}${spokenFraction}${percent ? " بالمية" : ""}`;
}

const NUMBER =
	/(?<![\p{N}.٫])(?:(?<=^|\s)-)?[0-9٠-٩]+(?:[,٬][0-9٠-٩]{3})*(?:[.٫][0-9٠-٩]+)?[%٪]?/gu;

const COUNTED_NOUN =
	/^\s+(?:دقايق|دقائق|ساعات|أيام|ايام|أسابيع|اسابيع|شهور|أشهر|سنين|سنوات)/u;

export const spellArabicNumbers = (sentence: string) =>
	sentence.replace(NUMBER, (raw: string, offset: number, whole: string) => {
		const count = Number(toLatinDigits(raw));
		const countsNoun =
			Number.isInteger(count) &&
			count >= 3 &&
			count <= 10 &&
			COUNTED_NOUN.test(whole.slice(offset + raw.length));
		return countsNoun ? (COUNTED[count] ?? raw) : speakArabicNumber(raw);
	});

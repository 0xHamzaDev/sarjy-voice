import {
	arabicInteger,
	speakArabicNumber,
	spellArabicNumbers,
} from "@server/voice/speak/arabicNumbers";
import { expect, test } from "vitest";

test("spells integers the way Saudis say them", () => {
	expect(arabicInteger(0)).toBe("صفر");
	expect(arabicInteger(8)).toBe("ثمانية");
	expect(arabicInteger(12)).toBe("اثنعش");
	expect(arabicInteger(20)).toBe("عشرين");
	expect(arabicInteger(34)).toBe("أربعة وثلاثين");
	expect(arabicInteger(100)).toBe("مية");
	expect(arabicInteger(244)).toBe("ميتين وأربعة وأربعين");
	expect(arabicInteger(375)).toBe("ثلاث مية وخمسة وسبعين");
	expect(arabicInteger(2000)).toBe("ألفين");
	expect(arabicInteger(2026)).toBe("ألفين وستة وعشرين");
	expect(arabicInteger(5000)).toBe("خمس آلاف");
	expect(arabicInteger(15000)).toBe("خمسطعش ألف");
	expect(arabicInteger(250000)).toBe("ميتين وخمسين ألف");
	expect(arabicInteger(3_500_000)).toBe("ثلاث ملايين وخمس مية ألف");
});

test("handles decimals, percents, negatives, separators and long digit runs", () => {
	expect(speakArabicNumber("208.98")).toBe("ميتين وثمانية فاصلة ثمانية وتسعين");
	expect(speakArabicNumber("3.05")).toBe("ثلاثة فاصلة صفر خمسة");
	expect(speakArabicNumber("375.00")).toBe("ثلاث مية وخمسة وسبعين");
	expect(speakArabicNumber("٨٪")).toBe("ثمانية بالمية");
	expect(speakArabicNumber("-5")).toBe("سالب خمسة");
	expect(speakArabicNumber("1,500")).toBe("ألف وخمس مية");
	expect(speakArabicNumber("0551234567")).toBe(
		"صفر خمسة خمسة واحد اثنين ثلاثة أربعة خمسة ستة سبعة",
	);
});

test("counts minutes, hours and days the Saudi way", () => {
	expect(spellArabicNumbers("باقي 5 دقايق و3 ساعات و١٠ أيام")).toBe(
		"باقي خمس دقايق وثلاث ساعات وعشر أيام",
	);
	expect(spellArabicNumbers("باقي 25 دقيقة و5 ريال")).toBe(
		"باقي خمسة وعشرين دقيقة وخمسة ريال",
	);
});

test("rewrites every number inside an Arabic sentence", () => {
	expect(spellArabicNumbers("الحرارة ٣٤ درجة والرطوبة 8%")).toBe(
		"الحرارة أربعة وثلاثين درجة والرطوبة ثمانية بالمية",
	);
	expect(spellArabicNumbers("مئة دولار يساوي ٣٧٥ ريال، والفرق 10-20")).toBe(
		"مئة دولار يساوي ثلاث مية وخمسة وسبعين ريال، والفرق عشرة-عشرين",
	);
});

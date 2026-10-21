import { speakable, stripMarkup } from "@server/voice/speak/speakable";
import { expect, test } from "vitest";

test("speaks raw clock times with a period of day", () => {
	expect(speakable("الفجر الساعة 03:45")).toBe(
		"الفجر الساعة أربع إلا ربع فجرًا",
	);
	expect(speakable("المغرب 18:00.")).toBe("المغرب ست مساءً.");
	expect(speakable("العشاء ٢١:٣٠")).toBe("العشاء تسع ونص ليلًا");
	expect(speakable("العصر 15:40")).toBe("العصر أربع إلا ثلث عصرًا");
	expect(speakable("الظهر 12:17")).toBe("الظهر اثنعش وسبعطعش دقيقة ظهرًا");
});

test("keeps a period word the model already wrote", () => {
	expect(speakable("الساعة 3:00 مساءً")).toBe("الساعة ثلاث مساءً");
	expect(speakable("الفجر 04:05 الصبح.")).toBe("الفجر أربع وخمس الصبح.");
	expect(speakable("العصر 15:30 بعد الظهر")).toBe("العصر ثلاث ونص بعد الظهر");
});

test("never guesses the period of an ambiguous 12-hour time", () => {
	expect(speakable("المغرب الساعة 6:21.")).toBe(
		"المغرب الساعة ست وواحد وعشرين دقيقة.",
	);
});

test("speaks minutes with Saudi counting", () => {
	expect(speakable("المغرب 18:01")).toBe("المغرب ست ودقيقة مساءً");
	expect(speakable("المغرب 18:02")).toBe("المغرب ست ودقيقتين مساءً");
	expect(speakable("الظهر 12:05")).toBe("الظهر اثنعش وخمس ظهرًا");
	expect(speakable("المغرب 18:07")).toBe("المغرب ست وسبع دقايق مساءً");
	expect(speakable("العشاء 19:50")).toBe("العشاء ثمان إلا عشر مساءً");
	expect(speakable("العشاء 19:55")).toBe("العشاء ثمان إلا خمس مساءً");
});

test("speaks Hijri dates", () => {
	expect(speakable("التاريخ الهجري 07-04-1448.")).toBe(
		"التاريخ الهجري سبعة ربيع الآخر ألف وأربع مية وثمانية وأربعين.",
	);
	expect(speakable("اليوم ٧-٤-١٤٤٨ هـ")).toBe(
		"اليوم سبعة ربيع الآخر ألف وأربع مية وثمانية وأربعين هجري",
	);
});

test("speaks ISO dates and datetimes", () => {
	expect(speakable("موعدك 2026-08-13")).toBe(
		"موعدك ثلطعش أغسطس ألفين وستة وعشرين",
	);
	expect(speakable("في 2026-08-20T14:30:00+03:00")).toBe(
		"في عشرين أغسطس ألفين وستة وعشرين الساعة ثنتين ونص ظهرًا",
	);
});

test("speaks temperatures", () => {
	expect(speakable("الحرارة 35°C")).toBe("الحرارة خمسة وثلاثين درجة");
});

test("speaks Arabic distances and speeds", () => {
	expect(speakable("الرياح 15 كم/س")).toBe("الرياح خمسطعش كيلو بالساعة");
	expect(speakable("الرياح 20 km/h")).toBe("الرياح عشرين كيلو بالساعة");
	expect(speakable("مكة تبعد 870 كم.")).toBe("مكة تبعد ثمان مية وسبعين كيلو.");
	expect(speakable("كم الساعة؟ 3 كمية")).toBe("كم الساعة؟ ثلاثة كمية");
});

test("speaks English temperatures and distances", () => {
	expect(speakable("It's 35°C, feels like 38°.")).toBe(
		"It's 35 degrees, feels like 38 degrees.",
	);
	expect(speakable("Wind at 15 km/h, 1 km away.")).toBe(
		"Wind at 15 kilometers per hour, 1 kilometer away.",
	);
	expect(speakable("Makkah is 870km away, gusts 20kph.")).toBe(
		"Makkah is 870 kilometers away, gusts 20 kilometers per hour.",
	);
	expect(speakable("Take 5 kmart bags")).toBe("Take 5 kmart bags");
});

test("speaks English 24-hour times and dates the way people say them", () => {
	expect(speakable("Fajr is at 04:03 on 2026-08-13.")).toBe(
		"Fajr is at 4:03 AM on August 13, 2026.",
	);
	expect(speakable("Maghrib is at 18:21, Isha at 19:00.")).toBe(
		"Maghrib is at 6:21 PM, Isha at 7 PM.",
	);
	expect(speakable("Dhuhr 12:05, midnight 00:30.")).toBe(
		"Dhuhr 12:05 PM, midnight 12:30 AM.",
	);
	expect(speakable("Meet 2026-08-20T14:30:00+03:00.")).toBe(
		"Meet August 20, 2026 at 2:30 PM.",
	);
	expect(speakable("The Hijri date is 07-04-1448.")).toBe(
		"The Hijri date is 7 Rabi al-Thani 1448.",
	);
	expect(speakable("100 USD is 375.00 SAR.")).toBe("100 USD is 375 SAR.");
});

test("leaves English times that already say AM or PM, or are ambiguous", () => {
	expect(speakable("Maghrib is at 6:21 PM, or 6:21 pm.")).toBe(
		"Maghrib is at 6:21 PM, or 6:21 pm.",
	);
	expect(speakable("Around 6:21 then.")).toBe("Around 6:21 then.");
});

test("no markdown, list markers, links or emoji reach TTS", () => {
	expect(stripMarkup("**Sure!** Here are _three_ ideas:")).toBe(
		"Sure! Here are three ideas:",
	);
	expect(stripMarkup("1. Luna")).toBe("Luna");
	expect(stripMarkup("- جرب تمشي شوي")).toBe("جرب تمشي شوي");
	expect(stripMarkup("### Weather")).toBe("Weather");
	expect(stripMarkup("See [the forecast](https://x.y) 🌙☀️")).toBe(
		"See the forecast",
	);
	expect(stripMarkup("Visit https://example.com now")).toBe("Visit now");
	expect(stripMarkup("الحرارة 35°C")).toBe("الحرارة 35°C");
	expect(stripMarkup("تمام، الساعة عشرة الصبح.祝你一天顺利!")).toBe(
		"تمام، الساعة عشرة الصبح.",
	);
});

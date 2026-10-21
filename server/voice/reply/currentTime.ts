import { foldArabic } from "@server/voice/listen/cleanTranscript";
import type { Lang } from "@shared/protocol";

const ARABIC_TIME_QUESTION =
	/^(?:(?:كم|وش|ايش) (?:الساعه|الوقت)|(?:الساعه|الوقت) كم)(?: (?:الحين|الان|دحين|عندي))*$/;
const ENGLISH_TIME_QUESTION =
	/^(?:what(?:['’]s| is) the (?:current |local )?time|what time is it|(?:can you )?tell me the time)(?: (?:now|right now))?(?: please)?$/;

export function currentTimeReply(
	transcript: string,
	lang: Lang,
	tz: string,
	now: Date,
): string | null {
	const question = foldArabic(transcript.toLowerCase())
		.trim()
		.replace(/[.!?؟]+$/, "")
		.replace(/\s+/g, " ")
		.trim();
	if (
		!ARABIC_TIME_QUESTION.test(question) &&
		!ENGLISH_TIME_QUESTION.test(question)
	)
		return null;
	const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
		timeZone: tz,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(now);
	return lang === "ar"
		? `الساعة الحين ${time.replace(/ ص$/, " صباحًا").replace(/ م$/, " مساءً")}.`
		: `It's ${time}.`;
}

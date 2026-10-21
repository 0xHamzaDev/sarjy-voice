import { currentTimeReply } from "@server/voice/reply/currentTime";
import { speakable } from "@server/voice/speak/speakable";
import { expect, test } from "vitest";

const now = new Date("2026-09-26T15:01:00Z");

test.each([
	"كم الساعة الحين؟",
	"كم الساعه الآن؟",
	"الساعة كم؟",
	"وش الوقت عندي الحين؟",
])("answers %s from the local clock with the correct spoken period", (question) => {
	const reply = currentTimeReply(question, "ar", "Asia/Riyadh", now);
	expect(reply).toBe("الساعة الحين ٦:٠١ مساءً.");
	expect(speakable(reply ?? "")).toBe("الساعة الحين ست ودقيقة مساءً.");
});

test.each([
	["America/New_York", "2026-07-01T15:01:00Z", "11:01 AM"],
	["America/New_York", "2026-12-01T15:01:00Z", "10:01 AM"],
	["Asia/Kathmandu", "2026-09-26T15:01:00Z", "8:46 PM"],
	["Pacific/Kiritimati", "2026-09-26T10:01:00Z", "12:01 AM"],
])("uses %s including daylight saving and fractional offsets", (tz, date, time) => {
	expect(currentTimeReply("What time is it?", "en", tz, new Date(date))).toBe(
		`It's ${time}.`,
	);
});

test.each([
	"What's the time?",
	"What's the local time right now?",
	"Can you tell me the time please?",
])("recognizes the direct English request: %s", (question) =>
	expect(currentTimeReply(question, "en", "Asia/Riyadh", now)).toBe(
		"It's 6:01 PM.",
	));

test.each([
	"What time is Maghrib?",
	"What time is it in Tokyo?",
	"كم باقي على المغرب؟",
	"كم الساعة الحين وهل الجو حار؟",
	"قل كم الساعة بالإنجليزي",
	"لا تقول لي كم الساعة",
])("leaves unrelated, mixed and other-city questions to the assistant: %s", (question) =>
	expect(currentTimeReply(question, "ar", "Asia/Riyadh", now)).toBeNull());

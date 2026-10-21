import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	calls: 0,
	shouldThrow: false,
}));

vi.mock("@server/vendors/textToSpeech", () => ({
	tts: async function* ({ sentences }: { sentences: AsyncIterable<string> }) {
		mocks.calls++;
		if (mocks.shouldThrow) throw new Error("synthesis failed");
		for await (const text of sentences)
			yield { type: "audio", pcm: Buffer.from(text) };
	},
}));

const { FILLER_TEXT, getPhraseAudio, getReadyPhraseAudio } = await import(
	"@server/voice/speak/fillerAudio"
);

afterEach(() => {
	mocks.shouldThrow = false;
});

test("cold filler is skipped until its existing synthesis has completed", async () => {
	const text = "Checking that for you.";
	expect(getReadyPhraseAudio(text)).toBeNull();
	const pending = getPhraseAudio(text, "en");
	expect(getReadyPhraseAudio(text)).toBeNull();
	const ready = await pending;
	expect(getReadyPhraseAudio(text)).toEqual(ready);
});

test("caches synthesis per phrase and returns the concatenated audio", async () => {
	mocks.calls = 0;
	const [first, second] = await Promise.all([
		getPhraseAudio(FILLER_TEXT.ar, "ar"),
		getPhraseAudio(FILLER_TEXT.ar, "ar"),
	]);
	expect(mocks.calls).toBe(1);
	expect(first?.length).toBeGreaterThan(0);
	expect(first).toEqual(second);
});

test("a failed synthesis resolves to null and is not cached", async () => {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.calls = 0;
	mocks.shouldThrow = true;
	const failed = await getPhraseAudio(FILLER_TEXT.en, "en");
	expect(failed).toBeNull();
	expect(mocks.calls).toBe(1);

	mocks.shouldThrow = false;
	const retried = await getPhraseAudio(FILLER_TEXT.en, "en");
	expect(retried?.length).toBeGreaterThan(0);
	expect(mocks.calls).toBe(2);
	spy.mockRestore();
});

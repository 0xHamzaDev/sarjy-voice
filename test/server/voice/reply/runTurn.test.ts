import { env } from "@server/env";
import { runTurn, type TurnContext } from "@server/voice/reply/runTurn";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	insert: vi.fn(),
	memories: vi.fn(),
	chat: vi.fn(),
	ttsFails: false,
	needsTool: false,
	runTool: vi.fn(),
	warmFiller: vi.fn(),
}));

vi.mock("@server/db/client", () => ({
	db: { insert: () => ({ values: mocks.insert }) },
}));
vi.mock("@server/env", () => ({
	env: {
		PIPELINE: "streaming",
		FILLER: false,
	},
}));
vi.mock("@server/memory/memoryStore", () => ({
	memoriesForPrompt: mocks.memories,
}));
vi.mock("@server/tools/toolRegistry", () => ({
	toolDefinitions: [],
	runTool: mocks.runTool,
}));
vi.mock("@server/voice/speak/fillerAudio", async (importOriginal) => ({
	...(await importOriginal<typeof import("@server/voice/speak/fillerAudio")>()),
	getReadyPhraseAudio: () => null,
	getPhraseAudio: mocks.warmFiller,
}));
vi.mock("@server/vendors/llm", () => ({
	chat: async function* () {
		mocks.chat();
		if (mocks.needsTool) {
			mocks.needsTool = false;
			yield { type: "text", text: "Mag" };
			yield {
				type: "tool_calls",
				calls: [{ id: "weather1", name: "weather", arguments: "{}" }],
			};
			return;
		}
		yield { type: "text", text: "Hello there, how are you?" };
	},
}));
vi.mock("@server/vendors/textToSpeech", () => ({
	tts: async function* ({ sentences }: { sentences: AsyncIterable<string> }) {
		if (mocks.ttsFails) throw new Error("speech unavailable");
		for await (const sentence of sentences) {
			yield { type: "audio", pcm: Buffer.from(sentence) };
		}
	},
}));

const context = (signal: AbortSignal, transcript = "hello"): TurnContext => ({
	transcript,
	marks: {},
	user: { id: "test-user", name: "Test" },
	tz: "Asia/Riyadh",
	coords: { lat: 24.7136, lon: 46.6753 },
	turnNumber: 1,
	memories: Promise.resolve([]),
	history: [],
	signal,
	sendJson: vi.fn(),
	sendAudio: vi.fn(),
	onNameSaved: vi.fn(),
});

beforeEach(() => {
	mocks.insert.mockReset().mockResolvedValue(undefined);
	mocks.memories.mockReset().mockResolvedValue([]);
	mocks.chat.mockClear();
	mocks.ttsFails = false;
	mocks.needsTool = false;
	mocks.runTool.mockReset().mockResolvedValue("Sunny");
	mocks.warmFiller.mockReset().mockResolvedValue(null);
	env.FILLER = false;
});

test("text the model writes alongside a tool call is never spoken", async () => {
	mocks.needsTool = true;
	const turn = context(new AbortController().signal);
	const result = await runTurn(turn);
	expect(result?.reply).toBe("Hello there, how are you?");
	const spoken = vi
		.mocked(turn.sendAudio)
		.mock.calls.map(([pcm]) => String(pcm))
		.join(" ");
	expect(spoken).not.toContain("Mag");
});

test("cold filler retries in the background without delaying a tool response", async () => {
	env.FILLER = true;
	mocks.needsTool = true;
	mocks.warmFiller.mockImplementation(() => new Promise(() => {}));
	const result = await runTurn(
		context(new AbortController().signal, "weather?"),
	);
	expect(mocks.warmFiller).toHaveBeenCalledOnce();
	expect(mocks.runTool).toHaveBeenCalledOnce();
	expect(result?.reply).toBe("Hello there, how are you?");
});

test("cancellation during persistence cannot complete the old turn", async () => {
	let finishInsert = () => {};
	mocks.insert.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finishInsert = resolve;
			}),
	);
	const controller = new AbortController();
	const turn = runTurn(context(controller.signal));
	await vi.waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
	controller.abort();
	finishInsert();
	expect(await turn).toBeNull();
});

test("cancellation during memory lookup never starts generation", async () => {
	let finishLookup = () => {};
	mocks.memories.mockImplementation(
		() =>
			new Promise<[]>((resolve) => {
				finishLookup = () => resolve([]);
			}),
	);
	const controller = new AbortController();
	const turn = runTurn(context(controller.signal));
	controller.abort();
	finishLookup();
	expect(await turn).toBeNull();
	expect(mocks.chat).not.toHaveBeenCalled();
});

test("persists the provider that actually generated audio", async () => {
	await runTurn(context(new AbortController().signal));
	expect(mocks.insert).toHaveBeenCalledWith(
		expect.objectContaining({
			vendors: expect.objectContaining({ tts: "elevenlabs" }),
		}),
	);
});

test("speaks the user's current local time without asking the language model", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-09-26T15:01:00Z"));
	const turnContext = context(new AbortController().signal, "كم الساعة الحين؟");
	turnContext.history = [
		{ role: "assistant", content: "الساعة ثمانية وعشرين دقيقة مساءً." },
	];
	try {
		const result = await runTurn(turnContext);
		expect(result?.reply).toBe("الساعة الحين ٦:٠١ مساءً.");
		expect(result?.provider).toBe("local");
		expect(mocks.chat).not.toHaveBeenCalled();
		expect(turnContext.sendAudio).toHaveBeenCalledWith(
			Buffer.from("الساعة الحين ست ودقيقة مساءً."),
		);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				vendors: expect.objectContaining({ llm: "local" }),
			}),
		);
	} finally {
		vi.useRealTimers();
	}
});

test("speech failure still returns the text reply and a typed error", async () => {
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	mocks.ttsFails = true;
	const turnContext = context(new AbortController().signal);
	try {
		const result = await runTurn(turnContext);
		expect(result?.reply).toBe("Hello there, how are you?");
		expect(turnContext.sendJson).toHaveBeenCalledWith({
			type: "error",
			code: "tts_failed",
		});
		expect(turnContext.sendJson).toHaveBeenCalledWith(
			expect.objectContaining({ type: "reply", text: result?.reply }),
		);
	} finally {
		error.mockRestore();
	}
});

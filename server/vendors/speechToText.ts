import {
	GROQ_BASE_URL,
	WHISPER_MODEL,
	WHISPER_TIMEOUT_MS,
} from "@server/config";
import { env } from "@server/env";
import { withTimeout } from "@server/withTimeout";
import { type Lang, MIC_SAMPLE_RATE } from "@shared/protocol";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { pcmToWav } from "./wav";

const groq = new OpenAI({
	apiKey: env.GROQ_API_KEY,
	baseURL: GROQ_BASE_URL,
	maxRetries: 0,
});

const verboseTranscription = z.object({
	text: z.string(),
	language: z.string().nullish(),
	segments: z
		.array(
			z.object({
				avg_logprob: z.number(),
				no_speech_prob: z.number(),
			}),
		)
		.nullish(),
});

export type Transcription = {
	text: string;
	language: string | null;
	avgLogprobs: number[];
};

export async function transcribe(
	pcm: Buffer,
	{
		language,
		prompt,
		signal,
	}: { language?: Lang; prompt: string; signal: AbortSignal },
): Promise<Transcription> {
	const response = await groq.audio.transcriptions.create(
		{
			file: await toFile(pcmToWav(pcm, MIC_SAMPLE_RATE), "speech.wav"),
			model: WHISPER_MODEL,
			...(language ? { language } : {}),
			prompt,
			response_format: "verbose_json",
			temperature: 0,
		},
		{ signal: withTimeout(signal, WHISPER_TIMEOUT_MS) },
	);
	const parsed = verboseTranscription.parse(response);
	return {
		text: parsed.text,
		language: parsed.language ?? null,
		avgLogprobs: (parsed.segments ?? []).map((segment) => segment.avg_logprob),
	};
}

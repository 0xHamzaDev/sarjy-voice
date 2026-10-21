import { z } from "zod";

const schema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(8787),
	DATABASE_URL: z.url(),
	GROQ_API_KEY: z.string().min(1),
	ELEVENLABS_API_KEY: z.string().min(1),
	GEMINI_API_KEY: z.string().min(1),
	PIPELINE: z.enum(["streaming", "baseline"]).default("streaming"),
	DB_KEEPALIVE: z.stringbool().default(false),
	FILLER: z.stringbool().default(false),
	VOICE_DEBUG: z.stringbool().default(false),
});

export const env = schema.parse(process.env);

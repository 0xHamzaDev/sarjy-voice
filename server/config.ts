export const TURNS_PER_MINUTE = 10;
export const RATE_WINDOW_MS = 60_000;
export const SESSION_MAX_MS = 20 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
export const CALL_IDLE_MS = 60_000;
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;
export const SERVER_RESTART_CLOSE_CODE = 1012;
export const DB_SHUTDOWN_TIMEOUT_S = 3;

export const LLM_MODEL = "openai/gpt-oss-120b";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const LLM_REASONING_EFFORT = "low";
export const LLM_MAX_TOKENS = 300;
export const LLM_TIMEOUT_MS = 12_000;
export const MAX_TOOL_ROUNDS = 3;
export const TOOL_CALL_LEAK_MARKER = "<function=";
export const HISTORY_MAX_MESSAGES = 12;
export const MAX_SPOKEN_SENTENCES = 3;
export const TOOL_TIMEOUT_MS = 4000;
export const FILLER_TIMEOUT_MS = 10_000;

export const MAX_CHUNK_CHARS = 160;
export const MIN_CHUNK_CHARS = 12;

export const CODE_SWITCH_MIN_MINORITY_WORDS = 2;
export const CODE_SWITCH_MIN_MINORITY_RATIO = 0.25;

export const WHISPER_MODEL = "whisper-large-v3-turbo";
export const WHISPER_TIMEOUT_MS = 6000;
export const WHISPER_MIN_AVG_LOGPROB = -1.5;
export const WHISPER_PROMPT =
	"هلا سرجي، ذكرني بعد صلاة المغرب today، okay؟ طيب، ايه، يلا، مشكور، نعم، تمام. الرياض، الفجر، العشاء. Hey Sarjy, what time is Maghrib in Riyadh today? Fajr, Dhuhr, Asr, Isha.";

export const VAD_MIN_SPEECH_DB = -55;
export const VAD_ENTER_PROB = 0.5;
export const VAD_EXIT_PROB = 0.35;
export const VAD_START_MS = 80;
export const VAD_CONFIRM_MS = 120;
export const VAD_BARGE_IN_MS = 400;
export const VAD_HANGOVER_MS = 800;
export const VAD_SHORT_UTTERANCE_MS = 1000;
export const VAD_SHORT_HANGOVER_MS = 1100;
export const VAD_PREROLL_MS = 300;
export const VAD_TAIL_MS = 200;
export const VAD_SPECULATE_MS = 200;
export const VAD_MAX_UTTERANCE_MS = 30_000;

export const ELEVENLABS_URL = "wss://api.elevenlabs.io/v1/text-to-speech";
export const ELEVENLABS_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_VOICE_ID = "kr4VZw8MSZMHE0y2m40n";
export const ELEVENLABS_VOICE_SETTINGS = { stability: 0.4, style: 0, speed: 1 };

export const MEMORY_TOP_K = 5;
export const MEMORY_PROMPT_MAX = 40;
export const EMBEDDING_DIMENSIONS = 768;
export const GEMINI_EMBED_URL =
	"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
export const MEMORY_TIMEOUT_MS = 1500;
export const MEMORY_FACT_MAX_CHARS = 300;
export const MEMORY_DUPLICATE_DISTANCE = 0.015;
export const MEMORY_EXTRACTION_MODEL = "openai/gpt-oss-20b";
export const MEMORY_EXTRACTION_MAX_FACTS = 3;
export const MEMORY_EXTRACTION_TIMEOUT_MS = 8000;
export const MEMORY_BACKGROUND_TIMEOUT_MS = 20_000;

export const FALLBACK_COORDS = { lat: 24.7136, lon: 46.6753 };
export const SKY_TIME_ZONE = "Asia/Riyadh";
export const LOCATION_COOKIE = "sarjy.loc";
export const LOCATION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;
export const NOMINATIM_REVERSE_URL =
	"https://nominatim.openstreetmap.org/reverse";
export const NOMINATIM_USER_AGENT = "Sarjy/1.0 (voice assistant demo)";
export const REVERSE_GEOCODE_CITY_ZOOM = 10;
export const REVERSE_GEOCODE_CACHE_DECIMALS = 2;

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_GEOCODING_URL =
	"https://geocoding-api.open-meteo.com/v1/search";
export const OPEN_METEO_AIR_URL =
	"https://air-quality-api.open-meteo.com/v1/air-quality";
export const WEATHER_FORECAST_HOURS = 4;
export const AIR_WARNING_AQI = 100;

export const ALADHAN_URL = "https://api.aladhan.com/v1/timings";
export const ALADHAN_METHOD_UMM_AL_QURA = 4;

export const KAABA_COORDS = { lat: 21.4225, lon: 39.8262 };
export const EARTH_RADIUS_KM = 6371;

export const EXCHANGE_RATES_URL = "https://open.er-api.com/v6/latest";
export const EXCHANGE_RATES_CACHE_MS = 60 * 60 * 1000;

export const DB_KEEPALIVE_MS = 4 * 60 * 1000;

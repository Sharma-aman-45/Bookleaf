import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function numeric(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  ai: {
    get provider() {
      return process.env.AI_PROVIDER_NAME ?? "groq";
    },
    get baseUrl() {
      return (process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
    },
    get apiKey() {
      return process.env.AI_API_KEY ?? "";
    },
    get classifyModel() {
      return process.env.AI_CLASSIFY_MODEL ?? "openai/gpt-oss-20b";
    },
    get draftModel() {
      return process.env.AI_DRAFT_MODEL ?? "openai/gpt-oss-120b";
    },
    get reasoningEffort() {
      return process.env.AI_REASONING_EFFORT ?? "low";
    },
    get timeoutMs() {
      return numeric("AI_TIMEOUT_MS", 12000);
    },
    get inputCostPerMTok() {
      return numeric("AI_INPUT_COST_PER_MTOK", 0);
    },
    get outputCostPerMTok() {
      return numeric("AI_OUTPUT_COST_PER_MTOK", 0);
    }
  }
};

import "dotenv/config";

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppConfig {
  botToken: string;
  databaseUrl: string;
  supportGroupId: number;
  logLevel: string;
  ai: AiConfig;
}

export interface DatabaseConfig {
  databaseUrl: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredNumber(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

function loadAiConfig(): AiConfig {
  const enabled = (process.env.AI_ENABLED ?? "").toLowerCase() === "true";
  const apiKey = process.env.AI_API_KEY ?? "";
  const baseUrl = process.env.AI_BASE_URL ?? "https://byesu.com/v1";
  const model = process.env.AI_MODEL ?? "gpt-5.5";

  // AI is opt-in. If it is enabled the key is mandatory so we fail fast instead
  // of silently degrading every reply to "needs a human".
  if (enabled && !apiKey) {
    throw new Error("AI_ENABLED=true requires AI_API_KEY to be set");
  }

  return { enabled, baseUrl, apiKey, model };
}

export function loadConfig(): AppConfig {
  return {
    botToken: required("BOT_TOKEN"),
    databaseUrl: required("DATABASE_URL"),
    supportGroupId: requiredNumber("SUPPORT_GROUP_ID"),
    logLevel: process.env.LOG_LEVEL ?? "info",
    ai: loadAiConfig()
  };
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    databaseUrl: required("DATABASE_URL")
  };
}

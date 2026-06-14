import "dotenv/config";

export interface AppConfig {
  botToken: string;
  databaseUrl: string;
  supportGroupId: number;
  logLevel: string;
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

export function loadConfig(): AppConfig {
  return {
    botToken: required("BOT_TOKEN"),
    databaseUrl: required("DATABASE_URL"),
    supportGroupId: requiredNumber("SUPPORT_GROUP_ID"),
    logLevel: process.env.LOG_LEVEL ?? "info"
  };
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    databaseUrl: required("DATABASE_URL")
  };
}

import { describe, expect, it, vi } from "vitest";
import { AiAssistant, SYSTEM_PROMPT } from "../src/ai.js";
import type { AiConfig } from "../src/config.js";
import { KNOWLEDGE_BASE } from "../src/knowledgeBase.js";
import { Logger } from "../src/logger.js";

const logger = new Logger("error");

const enabledConfig: AiConfig = {
  enabled: true,
  baseUrl: "https://example.test/v1",
  apiKey: "sk-test",
  model: "test-model"
};

function assistantWithMockedCreate(create: () => Promise<unknown>): AiAssistant {
  const assistant = new AiAssistant(enabledConfig, logger);
  // Replace the underlying OpenAI client's completions.create with a stub.
  (assistant as unknown as { client: { chat: { completions: { create: unknown } } } }).client.chat.completions.create =
    create as never;
  return assistant;
}

describe("KNOWLEDGE_BASE", () => {
  it("covers all major product areas", () => {
    expect(KNOWLEDGE_BASE).toContain("Быстрый старт");
    expect(KNOWLEDGE_BASE).toContain("Пополнение баланса");
    expect(KNOWLEDGE_BASE).toContain("Byesu Code");
    expect(KNOWLEDGE_BASE).toContain("Ошибки API");
    expect(KNOWLEDGE_BASE).toContain("Генерация изображений");
    expect(KNOWLEDGE_BASE).toContain("Claude Code");
    expect(KNOWLEDGE_BASE).toContain("insufficient_balance");
  });
});

describe("AiAssistant", () => {
  it("is disabled when config.enabled is false", () => {
    const assistant = new AiAssistant({ ...enabledConfig, enabled: false }, logger);
    expect(assistant.enabled).toBe(false);
  });

  it("disabled assistant always returns not-confident", async () => {
    const assistant = new AiAssistant({ ...enabledConfig, enabled: false }, logger);
    expect(await assistant.tryAnswer("test")).toEqual({ confident: false, answer: "" });
  });

  it("returns the answer when the model is confident", async () => {
    const assistant = assistantWithMockedCreate(async () => ({
      choices: [{ message: { content: JSON.stringify({ confident: true, answer: "Используйте /v1." }) } }]
    }));
    expect(await assistant.tryAnswer("Какой base url?")).toEqual({
      confident: true,
      answer: "Используйте /v1."
    });
  });

  it("falls back to not-confident when the model is unsure", async () => {
    const assistant = assistantWithMockedCreate(async () => ({
      choices: [{ message: { content: JSON.stringify({ confident: false, answer: "" }) } }]
    }));
    expect(await assistant.tryAnswer("personal account question")).toEqual({ confident: false, answer: "" });
  });

  it("treats confident=true with an empty answer as not-confident", async () => {
    const assistant = assistantWithMockedCreate(async () => ({
      choices: [{ message: { content: JSON.stringify({ confident: true, answer: "   " }) } }]
    }));
    expect((await assistant.tryAnswer("q")).confident).toBe(false);
  });

  it("falls back to not-confident on API errors", async () => {
    const assistant = assistantWithMockedCreate(async () => {
      throw new Error("timeout");
    });
    expect(await assistant.tryAnswer("q")).toEqual({ confident: false, answer: "" });
  });

  it("falls back to not-confident on malformed JSON", async () => {
    const assistant = assistantWithMockedCreate(async () => ({
      choices: [{ message: { content: "not json" } }]
    }));
    expect(await assistant.tryAnswer("q")).toEqual({ confident: false, answer: "" });
  });
});

describe("SYSTEM_PROMPT anti-chatbot rules", () => {
  it("forbids general model knowledge", () => {
    expect(SYSTEM_PROMPT).toMatch(/НЕ используй общие знания/i);
  });

  it("explicitly prohibits off-topic categories", () => {
    expect(SYSTEM_PROMPT).toMatch(/анекдот/i);
    expect(SYSTEM_PROMPT).toMatch(/погода/i);
    expect(SYSTEM_PROMPT).toMatch(/политик/i);
    expect(SYSTEM_PROMPT).toMatch(/перевод/i);
    expect(SYSTEM_PROMPT).toMatch(/биткоин/i);
  });

  it("instructs confident=false for prompt injection attempts", () => {
    expect(SYSTEM_PROMPT).toMatch(/prompt injection/i);
    expect(SYSTEM_PROMPT).toMatch(/игнорировать правила/i);
  });

  it("instructs confident=false for account/payment-specific questions", () => {
    expect(SYSTEM_PROMPT).toMatch(/аккаунт|заказ|платеж/i);
  });

  it("instructs confident=false when uncertain", () => {
    expect(SYSTEM_PROMPT).toMatch(/не уверен/i);
  });

  it("names the documentation sources", () => {
    expect(SYSTEM_PROMPT).toMatch(/docs\.byesu\.com/);
    expect(SYSTEM_PROMPT).toMatch(/byesu\.ru\/docs/);
  });

  it("is used in the model request (smoke-test via mocked call)", async () => {
    let capturedMessages: unknown[] = [];
    const assistant = new AiAssistant(enabledConfig, logger);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (assistant as any).client.chat.completions.create = async (params: { messages: unknown[] }) => {
      capturedMessages = params.messages;
      return { choices: [{ message: { content: JSON.stringify({ confident: false, answer: "" }) } }] };
    };
    await assistant.tryAnswer("тест");
    const systemMsg = capturedMessages.find((m) => (m as { role: string }).role === "system") as { content: string } | undefined;
    expect(systemMsg?.content).toContain("НЕ используй общие знания");
  });
});

// Keep vi referenced for environments that tree-shake unused imports.
void vi;

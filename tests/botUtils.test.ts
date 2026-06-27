import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MS,
  RATE_LIMIT_NOTICE_MS,
  PENDING_QUESTION_TTL_MS,
  AI_ANSWER_MAX_CHARS,
  TELEGRAM_MSG_LIMIT,
  type PendingQuestion,
  hasText,
  isCommandMessage,
  isRateLimited,
  shouldSendRateLimitNotice,
  pruneStalePendingQuestions,
  isAiAnswerUsable,
  formatModeratorEscalationContext,
  formatModeratorNewMessageContext
} from "../src/botUtils.js";

// ---------------------------------------------------------------------------
// hasText
// ---------------------------------------------------------------------------
describe("hasText", () => {
  it("returns true for a text message", () => {
    expect(hasText({ text: "hello" } as never)).toBe(true);
  });

  it("returns false for a photo message", () => {
    expect(hasText({ photo: [] } as never)).toBe(false);
  });

  it("returns false for a voice message", () => {
    expect(hasText({ voice: {} } as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCommandMessage
// ---------------------------------------------------------------------------
describe("isCommandMessage", () => {
  it("returns true for /start", () => {
    expect(isCommandMessage({ text: "/start" } as never)).toBe(true);
  });

  it("returns true for /help with arguments", () => {
    expect(isCommandMessage({ text: "/help me" } as never)).toBe(true);
  });

  it("returns false for a regular message", () => {
    expect(isCommandMessage({ text: "hello bot" } as never)).toBe(false);
  });

  it("returns false for a non-text message", () => {
    expect(isCommandMessage({ photo: [] } as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRateLimited
// ---------------------------------------------------------------------------
describe("isRateLimited", () => {
  it("returns false when the user has never sent a message", () => {
    const map = new Map<number, number>();
    expect(isRateLimited(map, 1, Date.now())).toBe(false);
  });

  it("returns true when the last message was within the limit window", () => {
    const map = new Map<number, number>();
    const now = 1_000_000;
    map.set(1, now - RATE_LIMIT_MS + 1);
    expect(isRateLimited(map, 1, now)).toBe(true);
  });

  it("returns false when the last message was exactly at the limit boundary", () => {
    const map = new Map<number, number>();
    const now = 1_000_000;
    map.set(1, now - RATE_LIMIT_MS);
    expect(isRateLimited(map, 1, now)).toBe(false);
  });

  it("does not affect other users", () => {
    const map = new Map<number, number>();
    const now = 1_000_000;
    map.set(1, now - 1); // user 1 is rate-limited
    expect(isRateLimited(map, 2, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldSendRateLimitNotice
// ---------------------------------------------------------------------------
describe("shouldSendRateLimitNotice", () => {
  it("returns true when the user has never been noticed", () => {
    const map = new Map<number, number>();
    expect(shouldSendRateLimitNotice(map, 1, Date.now())).toBe(true);
  });

  it("returns false when the notice was sent recently", () => {
    const map = new Map<number, number>();
    const now = 1_000_000;
    map.set(1, now - RATE_LIMIT_NOTICE_MS + 1);
    expect(shouldSendRateLimitNotice(map, 1, now)).toBe(false);
  });

  it("returns true after the notice cooldown expires", () => {
    const map = new Map<number, number>();
    const now = 1_000_000;
    map.set(1, now - RATE_LIMIT_NOTICE_MS);
    expect(shouldSendRateLimitNotice(map, 1, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pruneStalePendingQuestions
// ---------------------------------------------------------------------------
describe("pruneStalePendingQuestions", () => {
  function makeMap(entries: Array<[number, number]>): Map<number, PendingQuestion> {
    return new Map(entries.map(([id, at]) => [id, { text: "q", aiAnswer: "a", at }]));
  }

  it("removes entries older than the TTL", () => {
    const now = 1_000_000_000;
    const map = makeMap([
      [1, now - PENDING_QUESTION_TTL_MS - 1], // stale
      [2, now - PENDING_QUESTION_TTL_MS + 1]  // fresh
    ]);
    pruneStalePendingQuestions(map, now);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(true);
  });

  it("keeps entries exactly at the TTL boundary", () => {
    const now = 1_000_000_000;
    const map = makeMap([[1, now - PENDING_QUESTION_TTL_MS]]);
    pruneStalePendingQuestions(map, now);
    expect(map.has(1)).toBe(true);
  });

  it("does nothing on an empty map", () => {
    const map = new Map<number, PendingQuestion>();
    pruneStalePendingQuestions(map, Date.now());
    expect(map.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isAiAnswerUsable
// ---------------------------------------------------------------------------
describe("isAiAnswerUsable", () => {
  it("returns true for a confident answer with non-empty text", () => {
    expect(isAiAnswerUsable({ confident: true, answer: "Use /v1 endpoint." })).toBe(true);
  });

  it("returns false when confident is false", () => {
    expect(isAiAnswerUsable({ confident: false, answer: "some text" })).toBe(false);
  });

  it("returns false when answer is an empty string", () => {
    expect(isAiAnswerUsable({ confident: true, answer: "" })).toBe(false);
  });

  it("returns false when answer is only whitespace", () => {
    expect(isAiAnswerUsable({ confident: true, answer: "   " })).toBe(false);
  });

  it("returns false for the NOT_CONFIDENT sentinel value", () => {
    expect(isAiAnswerUsable({ confident: false, answer: "" })).toBe(false);
  });

  it("returns false when answer exceeds AI_ANSWER_MAX_CHARS", () => {
    const longAnswer = "a".repeat(AI_ANSWER_MAX_CHARS + 1);
    expect(isAiAnswerUsable({ confident: true, answer: longAnswer })).toBe(false);
  });

  it("returns true when answer is exactly AI_ANSWER_MAX_CHARS", () => {
    const maxAnswer = "a".repeat(AI_ANSWER_MAX_CHARS);
    expect(isAiAnswerUsable({ confident: true, answer: maxAnswer })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatModeratorEscalationContext
// ---------------------------------------------------------------------------
describe("formatModeratorEscalationContext", () => {
  it("includes the user question", () => {
    const result = formatModeratorEscalationContext("Как пополнить?", "Пополните через раздел X.");
    expect(result).toContain("Как пополнить?");
  });

  it("includes the AI answer", () => {
    const result = formatModeratorEscalationContext("Как пополнить?", "Пополните через раздел X.");
    expect(result).toContain("Пополните через раздел X.");
  });

  it("indicates the user requested a human", () => {
    const result = formatModeratorEscalationContext("q", "a");
    expect(result).toContain("оператора");
  });

  it("never exceeds TELEGRAM_MSG_LIMIT for short inputs", () => {
    const result = formatModeratorEscalationContext("short", "short answer");
    expect(result.length).toBeLessThanOrEqual(TELEGRAM_MSG_LIMIT);
  });

  it("never exceeds TELEGRAM_MSG_LIMIT when both fields are very long", () => {
    const long = "x".repeat(4000);
    const result = formatModeratorEscalationContext(long, long);
    expect(result.length).toBeLessThanOrEqual(TELEGRAM_MSG_LIMIT);
  });

  it("truncates the question and includes truncation marker", () => {
    const long = "q".repeat(4000);
    const result = formatModeratorEscalationContext(long, "short");
    expect(result).toContain("…[обрезано]");
  });

  it("preserves section headers even when fields are truncated", () => {
    const long = "x".repeat(4000);
    const result = formatModeratorEscalationContext(long, long);
    expect(result).toContain("❓ Вопрос пользователя:");
    expect(result).toContain("🤖 Ответ ИИ:");
  });
});

// ---------------------------------------------------------------------------
// formatModeratorNewMessageContext
// ---------------------------------------------------------------------------
describe("formatModeratorNewMessageContext", () => {
  it("includes old question, AI answer, and new message", () => {
    const result = formatModeratorNewMessageContext("Старый вопрос", "Ответ ИИ", "Новое сообщение");
    expect(result).toContain("Старый вопрос");
    expect(result).toContain("Ответ ИИ");
    expect(result).toContain("Новое сообщение");
  });

  it("distinguishes new message from old question", () => {
    const result = formatModeratorNewMessageContext("original", "ai", "followup");
    const newMsgIdx = result.indexOf("followup");
    const oldQIdx = result.indexOf("original");
    expect(newMsgIdx).toBeGreaterThan(oldQIdx);
  });

  it("never exceeds TELEGRAM_MSG_LIMIT for short inputs", () => {
    const result = formatModeratorNewMessageContext("q", "a", "n");
    expect(result.length).toBeLessThanOrEqual(TELEGRAM_MSG_LIMIT);
  });

  it("never exceeds TELEGRAM_MSG_LIMIT when all fields are very long", () => {
    const long = "x".repeat(4000);
    const result = formatModeratorNewMessageContext(long, long, long);
    expect(result.length).toBeLessThanOrEqual(TELEGRAM_MSG_LIMIT);
  });

  it("preserves all section headers even when fields are truncated", () => {
    const long = "x".repeat(4000);
    const result = formatModeratorNewMessageContext(long, long, long);
    expect(result).toContain("❓ Исходный вопрос:");
    expect(result).toContain("🤖 Ответ ИИ:");
    expect(result).toContain("💬 Новое сообщение:");
  });
});

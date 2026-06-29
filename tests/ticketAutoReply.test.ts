import { describe, expect, it } from "vitest";
import {
  PAYMENT_ACKNOWLEDGMENT,
  PROBLEM_503_AUTO_ANSWER,
  PROBLEM_401_AUTO_ANSWER,
  getProblemAutoAnswer,
  get503AutoAnswer,
  get401AutoAnswer,
} from "../src/ticketAutoReply.js";
import { detectSupportLanguage } from "../src/botUtils.js";

describe("PAYMENT_ACKNOWLEDGMENT", () => {
  it("mentions Telegram username, order number, amount, and time", () => {
    expect(PAYMENT_ACKNOWLEDGMENT).toContain("Telegram username");
    expect(PAYMENT_ACKNOWLEDGMENT).toContain("номер заказа");
    expect(PAYMENT_ACKNOWLEDGMENT).toContain("сумм");
    expect(PAYMENT_ACKNOWLEDGMENT).toContain("время");
  });

  it("explicitly says card details are not needed", () => {
    expect(PAYMENT_ACKNOWLEDGMENT).toContain("Реквизиты карты не нужны");
  });

  it("stays within Telegram message limit", () => {
    expect(PAYMENT_ACKNOWLEDGMENT.length).toBeLessThan(4096);
  });

  it("does not promise SLA, refund timelines, or delivery estimates", () => {
    expect(PAYMENT_ACKNOWLEDGMENT).not.toMatch(/минут|час|сутк|рабочи|гарантир|возврат/i);
  });
});

describe("getProblemAutoAnswer — 503 patterns", () => {
  const cases503 = [
    "получил ошибку 503",
    "503 Service Unavailable",
    "stream disconnect при запросе",
    "сервис недоступен",
    "временная перегрузка",
    "перегрузка серверов",
  ];

  for (const msg of cases503) {
    it(`matches 503 pattern: "${msg}"`, () => {
      const result = getProblemAutoAnswer(msg);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.text).toBe(get503AutoAnswer(detectSupportLanguage(msg)));
      }
    });
  }

  it("503 answer mentions retry and alternative model", () => {
    expect(PROBLEM_503_AUTO_ANSWER).toContain("Подождите");
    expect(PROBLEM_503_AUTO_ANSWER).toContain("другую модель");
  });

  it("503 answer is within Telegram message limit", () => {
    expect(PROBLEM_503_AUTO_ANSWER.length).toBeLessThan(4096);
  });
});

describe("getProblemAutoAnswer — 401 patterns", () => {
  const cases401 = [
    "ошибка 401",
    "401 Unauthorized",
    "Invalid token при запросе",
    "ключ не принят",
    "недействительный ключ",
    "неверный токен",
    "ключ не работает",
  ];

  for (const msg of cases401) {
    it(`matches 401 pattern: "${msg}"`, () => {
      const result = getProblemAutoAnswer(msg);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.text).toBe(get401AutoAnswer(detectSupportLanguage(msg)));
      }
    });
  }

  it("401 answer mentions console and key format", () => {
    expect(PROBLEM_401_AUTO_ANSWER).toContain("консоли");
    expect(PROBLEM_401_AUTO_ANSWER).toContain("sk-");
  });

  it("401 answer is within Telegram message limit", () => {
    expect(PROBLEM_401_AUTO_ANSWER.length).toBeLessThan(4096);
  });
});

describe("getProblemAutoAnswer — 403 stays docs-first (no auto-answer)", () => {
  const cases403 = [
    "ошибка 403",
    "403 Forbidden",
    "403 при запросе к модели",
  ];

  for (const msg of cases403) {
    it(`does NOT auto-answer 403: "${msg}"`, () => {
      const result = getProblemAutoAnswer(msg);
      expect(result.matched).toBe(false);
    });
  }
});

describe("getProblemAutoAnswer — unrecognised messages", () => {
  const unknownCases = [
    "платёж прошёл, но промокод не пришёл",
    "как настроить Codex",
    "insufficient_balance",
    "model_not_found",
    "",
    "непонятная ошибка",
  ];

  for (const msg of unknownCases) {
    it(`returns no match for: "${msg}"`, () => {
      expect(getProblemAutoAnswer(msg).matched).toBe(false);
    });
  }
});

describe("getProblemAutoAnswer — 503 takes priority over 401 if both patterns appear", () => {
  it("returns 503 answer when message contains both error codes", () => {
    const result = getProblemAutoAnswer("сначала была 401, теперь 503");
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.text).toBe(PROBLEM_503_AUTO_ANSWER);
    }
  });
});

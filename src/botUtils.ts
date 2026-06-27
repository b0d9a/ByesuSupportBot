import type { Message } from "telegraf/types";
import type { AiAnswer } from "./ai.js";

export const RATE_LIMIT_MS = 1000;
export const RATE_LIMIT_NOTICE_MS = 10_000;
export const RATE_LIMIT_TTL_MS = 60_000;
export const PENDING_QUESTION_TTL_MS = 30 * 60_000;
export const AI_ANSWER_MAX_CHARS = 3500;
export const TELEGRAM_MSG_LIMIT = 4096;

const TRUNCATION_SUFFIX = "\n…[обрезано]";

export interface PendingQuestion {
  text: string;
  aiAnswer: string;
  at: number;
}

export function hasText(message: Message): message is Message.TextMessage {
  return "text" in message;
}

export function isCommandMessage(message: Message): boolean {
  return hasText(message) && message.text.startsWith("/");
}

export function isRateLimited(lastMessageAt: Map<number, number>, userId: number, now: number): boolean {
  const last = lastMessageAt.get(userId) ?? 0;
  return now - last < RATE_LIMIT_MS;
}

export function shouldSendRateLimitNotice(lastNoticeAt: Map<number, number>, userId: number, now: number): boolean {
  const lastNotice = lastNoticeAt.get(userId) ?? 0;
  return now - lastNotice >= RATE_LIMIT_NOTICE_MS;
}

export function pruneStalePendingQuestions(pendingQuestions: Map<number, PendingQuestion>, now: number): void {
  const cutoff = now - PENDING_QUESTION_TTL_MS;
  for (const [id, q] of pendingQuestions) {
    if (q.at < cutoff) {
      pendingQuestions.delete(id);
    }
  }
}

export function isAiAnswerUsable(result: AiAnswer): result is { confident: true; answer: string } {
  return result.confident && typeof result.answer === "string" && result.answer.trim().length > 0 && result.answer.length <= AI_ANSWER_MAX_CHARS;
}

function truncateField(text: string, budget: number): string {
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

export function formatModeratorEscalationContext(question: string, aiAnswer: string): string {
  const header = "⚠️ Пользователь запросил оператора после ответа ИИ.\n\n❓ Вопрос пользователя:\n";
  const middle = "\n\n🤖 Ответ ИИ:\n";
  const fixed = header.length + middle.length;
  const remaining = TELEGRAM_MSG_LIMIT - fixed;
  // Give each field at most half the remaining budget; answer gets the rest.
  const questionBudget = Math.floor(remaining / 2);
  const q = truncateField(question, questionBudget);
  const a = truncateField(aiAnswer, remaining - q.length);
  return `${header}${q}${middle}${a}`;
}

export function formatModeratorNewMessageContext(oldQuestion: string, aiAnswer: string, newMessage: string): string {
  const h1 = "⚠️ Пользователь написал новый вопрос во время ожидания ответа ИИ.\n\n❓ Исходный вопрос:\n";
  const h2 = "\n\n🤖 Ответ ИИ:\n";
  const h3 = "\n\n💬 Новое сообщение:\n";
  const fixed = h1.length + h2.length + h3.length;
  const remaining = TELEGRAM_MSG_LIMIT - fixed;
  // Split budget: old question 30%, AI answer 40%, new message 30%.
  const qBudget = Math.floor(remaining * 0.3);
  const aBudget = Math.floor(remaining * 0.4);
  const nBudget = remaining - qBudget - aBudget;
  const q = truncateField(oldQuestion, qBudget);
  const a = truncateField(aiAnswer, aBudget);
  const n = truncateField(newMessage, nBudget);
  return `${h1}${q}${h2}${a}${h3}${n}`;
}

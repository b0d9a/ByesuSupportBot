import type { Message } from "telegraf/types";
import type { AiAnswer } from "./ai.js";

export const RATE_LIMIT_MS = 1000;
export const RATE_LIMIT_NOTICE_MS = 10_000;
export const RATE_LIMIT_TTL_MS = 60_000;
export const PENDING_QUESTION_TTL_MS = 30 * 60_000;

export interface PendingQuestion {
  text: string;
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
  return result.confident && typeof result.answer === "string" && result.answer.trim().length > 0;
}

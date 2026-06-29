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

// Patterns that reliably identify off-topic messages not related to Byesu support.
// Conservative: only block obvious chatbot abuse, never Byesu-related queries.
// Note: \b does not work with Cyrillic in JS; use (?<![а-яёА-ЯЁ]) / (?![а-яёА-ЯЁ]) or
// rely on word position context in the pattern itself.
const CYR_START = "(?<![а-яёА-ЯЁa-zA-Z0-9])";
const CYR_END = "(?![а-яёА-ЯЁa-zA-Z0-9])";

const OFF_TOPIC_PATTERNS: RegExp[] = [
  // Jokes / stories / poems
  /расскажи.{0,20}(анекдот|шутк|историю|стих|сказк)/iu,
  // Weather
  new RegExp(`${CYR_START}погод[аеуы]${CYR_END}`, "iu"),
  // Politics — president/PM + country context
  /(президент|премьер.?министр).{0,40}(сша|росси|стран|мир[ае])/iu,
  // Explicit translation imperative — "переведи" but not "перевод по СБП"
  new RegExp(`${CYR_START}переведи${CYR_END}`, "iu"),
  /\btranslate\b/iu,
  // Crypto price
  new RegExp(`${CYR_START}(биткоин|bitcoin)${CYR_END}`, "iu"),
  /курс.{0,20}(btc|eth|крипт|доллар|евро)/iu,
  // Generic off-topic coding — "напиши скрипт/функцию/программу" but NOT "напиши запрос/пример"
  /напиши.{0,40}(скрипт|функци[юя]|программ[уа]|(?<![а-яёА-ЯЁ])класс(?![а-яёА-ЯЁ]))/iu,
  // Prompt injection / jailbreak
  /(игнорируй|забудь).{0,30}(инструкци|правил|систем)/iu,
  /ты теперь.{0,20}(бот|агент|ии|ai|gpt|другой)/iu,
  /\b(roleplay|jailbreak)\b/iu,
  /(system prompt|системный промпт)/iu,
  /(твои правила|твои инструкци)/iu,
  // Identity / capability questions
  /(^|[^а-яёА-ЯЁ])(кто ты|что ты умеешь|что ты можешь)([^а-яёА-ЯЁ]|$)/iu,
  /ты.{0,10}(chatgpt|gpt-[0-9]|claude-[a-z]|gemini)/iu,
  /^ты\s+(бот|чатбот|ии|ai)\??$/iu,
  // Time / date
  /какая сегодня (погода|дата|температур)/iu,
  /какой сейчас (год|день|час)/iu,
];

const HUMAN_ONLY_SUPPORT_PATTERNS: RegExp[] = [
  // Payment/order/account balance issues require operator lookup.
  /(плат[её]ж|оплат[аиыл]|пополнил|пополнение|деп(озит)?).{0,80}(не\s+(приш[её]л|зачисл|появил)|не\s+получил|висит|не\s+прош[её]л)/iu,
  /(баланс|деньги|средств[ао]).{0,80}(не\s+(приш[её]л|зачисл|появил)|исчез|обнули|снял|списал|пропал|меньше)/iu,
  /(промокод|код).{0,60}(не\s+(приш[её]л|подходит|действител)|invalid|недействител)/iu,
  /\b(txid|transaction\s+hash|hash|usr\d+[a-z0-9]*)\b|0x[a-f0-9]{6,}/iu,
  /(крипто|usdt|trc20|solscan|bscscan|tronscan).{0,80}(не\s+(приш[её]л|зачисл|прош[её]л)|оплат|пополнил|перев[её]л|txid|hash)/iu,
  // Cross-site balance transfers and account-specific restoration/compensation.
  /(перенес|перенести|перевести|перевод).{0,80}(баланс|деньги|средств).{0,80}(стар|нов|site|сайт|byesu)/iu,
  /(баланс|деньги|средств).{0,80}(стар(ом|ого|ый)\s+сайт|code\.byesu\.com|api\.byesu\.com).{0,80}(перенес|перенести|перевести|перевод)/iu,
  /(стар(ого|ый)\s+сайт|code\.byesu\.com|api\.byesu\.com).{0,80}(нов(ый|ого)\s+сайт|byesu\.com|баланс|перенос)/iu,
  /(верните|восстановите|восстановить|компенсируйте|компенсац).{0,80}(баланс|деньги|средств|кредит)/iu,
  /(реферал|партн[её]р|скидк|лимит|тестов(ый|ого)\s+баланс|тестовые\s+кредиты|аккаунт\s+(chatgpt|claude|max|plus))/iu,
];

/**
 * Returns true when the message is clearly unrelated to Byesu support.
 * Used as a cheap pre-filter before calling the AI API.
 */
export function isOffTopicMessage(text: string): boolean {
  return OFF_TOPIC_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true when the message is related to Byesu but requires operator-only
 * account/order/log lookup, so the AI must not answer it substantively.
 */
export function isHumanOnlySupportMessage(text: string): boolean {
  return HUMAN_ONLY_SUPPORT_PATTERNS.some((re) => re.test(text));
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

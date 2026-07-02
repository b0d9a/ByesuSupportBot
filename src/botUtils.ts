import type { Message } from "telegraf/types";
import type { AiAnswer } from "./ai.js";

export const RATE_LIMIT_MS = 1000;
export const RATE_LIMIT_NOTICE_MS = 10_000;
export const RATE_LIMIT_TTL_MS = 60_000;
export const PENDING_QUESTION_TTL_MS = 30 * 60_000;
export const AI_ANSWER_MAX_CHARS = 3500;
export const TELEGRAM_MSG_LIMIT = 4096;

const TRUNCATION_SUFFIX = "\n…[обрезано]";

// Intent tag on a pending answer session. Lets a follow-up message that repeats
// the same known deterministic issue be answered again instead of escalating.
export type PendingIntent = "problem_401" | "problem_503" | "ai_docs" | "docs_codex_setup";

export interface PendingQuestion {
  text: string;
  aiAnswer: string;
  at: number;
  intent?: PendingIntent;
  // Category to prefer if this pending session later escalates to a ticket.
  category?: string;
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
  /\b(402|insufficient_quota|insufficient_balance)\b/iu,
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
  // Account / order / log lookups require an operator to look up the specific record.
  /(провер|посмотр|найд|гля[нь]|уточн)[а-яё]*\s+(мой|моё|мою|наш)?\s*(заказ|платёж|платеж|транзакц|аккаунт|лог|историю\s+платеж)/iu,
  /(check|look\s*up|find|verify)\s+(my\s+)?(order|payment|transaction|account|log)/iu,
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

// Codex (the OpenAI CLI tool) setup/config intent words.
// Must NOT match error-code messages like "Codex пишет 401" or general coding requests.
// Note: \b does not work with Cyrillic — use case-insensitive substring match instead.
const CODEX_TOOL_PATTERNS: RegExp[] = [
  /codex/iu,
  /кодекс/iu,
];

const SETUP_INTENT_PATTERNS: RegExp[] = [
  /наст(роить|ройк[аеи]|роен)/iu,
  /подключ(ить|ение|ил)/iu,
  /конфи(г|ги|гурац)/iu,
  /\bconfig\b|config\.(toml|json|yaml)/iu,
  /set\s*up|setup/iu,
  /connect/iu,
  /дай\s+(конфиг|настройк|пример)/iu,
  /как\s+(все|всё)\s+настроить/iu,
  /не\s+знаю\s+как/iu,
  // Colloquial RU "make it work / what is needed" intent (Codex mention required separately).
  /(что|че|чё)\s+(надо|нужно).*(работал|работало|заработал)/iu,
  /как\s+сделать.*(работал|работало|заработал)/iu,
  /(не\s+работает).*(наст(роить|роен)|подключ|что\s+(нужно|надо))/iu,
  /(что\s+(нужно|надо)).*(наст(роить|роен)|подключ)/iu,
];

// Patterns that disqualify a Codex mention from being a setup question.
const CODEX_SETUP_DISQUALIFIERS: RegExp[] = [
  /\b(401|402|403|502|503)\b/,
  /invalid\s+token/i,
  /unauthorized/i,
  /напиши\s+код/iu,
  /write\s+(code|a\s+(script|function|program))/iu,
];

/**
 * Returns true when the message is a Codex CLI setup/configuration question
 * that is covered by the Byesu knowledge base. Used to short-circuit AI
 * and give a deterministic KB-grounded answer without opening a ticket.
 */
export function isDocsCoveredSetupQuestion(text: string): boolean {
  if (CODEX_SETUP_DISQUALIFIERS.some((re) => re.test(text))) return false;
  return CODEX_TOOL_PATTERNS.some((re) => re.test(text)) && SETUP_INTENT_PATTERNS.some((re) => re.test(text));
}

// Phrases that signal dissatisfaction with the bot answer (the previous answer
// did not resolve the issue). A follow-up matching these escalates only when it
// carries no fresh deterministic intent to answer instead.
const DISSATISFACTION_PATTERNS: RegExp[] = [
  // RU
  /не\s+помог(ло|ает|ла)?/iu,
  /(всё|все)\s+равно\s+(не\s+работает|ошибк|та\s+же)/iu,
  /после\s+проверки.{0,40}(всё|все)\s+равно/iu,
  /проверил.{0,40}(та\s+же|всё\s+равно|не\s+помог|ошибк)/iu,
  /(так|всё)\s+же\s+(самое|ошибк)/iu,
  /не\s+решил/iu,
  // EN
  /still\s+(not\s+working|doesn.?t\s+work|failing|broken|the\s+same)/iu,
  /(didn.?t|does\s?n.?t|not)\s+help/iu,
  /i\s+checked.{0,40}(same|still)/iu,
  /same\s+(error|issue|problem)/iu,
];

// Phrases that explicitly ask for a human/operator. These outrank a deterministic
// answer: if the user asks for a human, escalate even when the message also names
// a known error (e.g. "401 нужен оператор").
const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  // RU
  /нужен\s+(человек|оператор|поддержк)/iu,
  /(позов|дай|хочу|нужен|свяж).{0,20}(оператор|человек|поддержк)/iu,
  new RegExp(`${CYR_START}оператор${CYR_END}`, "iu"),
  new RegExp(`${CYR_START}человек${CYR_END}`, "iu"),
  // EN
  /(call|need|talk\s+to|want|get)\s+(a\s+)?(human|operator|agent|support|person)/iu,
  /\bhuman\b/iu,
];

/**
 * Returns true when a follow-up explicitly asks for a human/operator.
 * Outranks a deterministic answer in the pending-follow-up flow.
 */
export function isHumanRequest(text: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true when a follow-up signals dissatisfaction with the previous answer.
 */
export function isDissatisfaction(text: string): boolean {
  return DISSATISFACTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true when a follow-up message signals dissatisfaction with the bot
 * answer or an explicit request for a human. Such follow-ups must escalate
 * unless a fresh deterministic intent can be answered instead.
 */
export function isEscalationSignal(text: string): boolean {
  return isDissatisfaction(text) || isHumanRequest(text);
}

export type SupportLanguage = "ru" | "en" | "zh";

/**
 * Detects whether a message is predominantly Russian, English, or Chinese.
 * Counts Cyrillic, Latin, and CJK Han characters; the majority wins.
 * Falls back to the explicit fallback (default "ru") when counts are equal or empty.
 */
export function detectSupportLanguage(text: string, fallback: SupportLanguage = "ru"): SupportLanguage {
  let cyr = 0;
  let lat = 0;
  let han = 0;
  for (const ch of text) {
    const c = ch.toLowerCase();
    if (c >= "а" && c <= "я" || c === "ё") cyr++;
    else if (c >= "a" && c <= "z") lat++;
    else {
      const cp = ch.codePointAt(0) ?? 0;
      if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2a6df)) han++;
    }
  }
  if (cyr === 0 && lat === 0 && han === 0) return fallback;
  if (han > cyr && han > lat) return "zh";
  return lat > cyr ? "en" : "ru";
}

function truncateField(text: string, budget: number): string {
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

export function formatModeratorQuestionMessage(question: string): string {
  const header = "❓ Вопрос пользователя:\n";
  return header + truncateField(question, TELEGRAM_MSG_LIMIT - header.length);
}

export function formatModeratorBotAnswerMessage(botAnswer: string): string {
  const header = "🤖 Ответ бота:\n";
  return header + truncateField(botAnswer, TELEGRAM_MSG_LIMIT - header.length);
}

export function formatModeratorFollowUpMessage(followUp: string): string {
  const header = "💬 Следующее сообщение пользователя:\n";
  return header + truncateField(followUp, TELEGRAM_MSG_LIMIT - header.length);
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

/**
 * Ticket-open auto-replies grounded in src/knowledgeBase.ts.
 *
 * payment — structured acknowledgment asking for the info support needs.
 * problem  — KB-covered auto-answers for 503 and 401 sent before the human
 *            operator sees the ticket, reducing median first-reply latency.
 * 403      — remains docs-first (User-Agent issue unverified); no auto-answer.
 *
 * All user-facing strings are available in "ru" and "en" so the reply matches
 * the language the user wrote in (determined by detectSupportLanguage).
 */

import { detectSupportLanguage, type SupportLanguage } from "./botUtils.js";

// ---------------------------------------------------------------------------
// Payment acknowledgment
// ---------------------------------------------------------------------------

const PAYMENT_ACKNOWLEDGMENT_RU = [
  "Обращение принято. Чтобы мы могли проверить платёж, пожалуйста, укажите:",
  "",
  "• Telegram username",
  "• номер заказа",
  "• сумму и примерное время оплаты",
  "",
  "Реквизиты карты не нужны — мы их не запрашиваем."
].join("\n");

const PAYMENT_ACKNOWLEDGMENT_EN = [
  "Your request has been received. To look up your payment, please provide:",
  "",
  "• Telegram username",
  "• order number",
  "• amount and approximate time of payment",
  "",
  "Card details are not required — we never ask for them."
].join("\n");

const PAYMENT_ACKNOWLEDGMENT_ZH = [
  "您的请求已收到。为了查找您的付款，请提供：",
  "",
  "• Telegram 用户名",
  "• 订单号",
  "• 金额和大约付款时间",
  "",
  "不需要提供卡片信息——我们从不索要。"
].join("\n");

/** @deprecated use getPaymentAcknowledgment(lang) for localized output */
export const PAYMENT_ACKNOWLEDGMENT = PAYMENT_ACKNOWLEDGMENT_RU;

export function getPaymentAcknowledgment(lang: SupportLanguage): string {
  if (lang === "en") return PAYMENT_ACKNOWLEDGMENT_EN;
  if (lang === "zh") return PAYMENT_ACKNOWLEDGMENT_ZH;
  return PAYMENT_ACKNOWLEDGMENT_RU;
}

// ---------------------------------------------------------------------------
// Problem auto-answer: 503 / 502 / capacity / stream disconnect
// ---------------------------------------------------------------------------

const PROBLEM_503_AUTO_ANSWER_RU = [
  "503 — временная перегрузка группы моделей.",
  "",
  "Что попробовать:",
  "1. Подождите немного и повторите запрос.",
  "2. Переключитесь на другую модель в консоли byesu.com.",
  "",
  "Если ошибка не исчезает — оператор уже видит обращение и ответит здесь."
].join("\n");

const PROBLEM_503_AUTO_ANSWER_EN = [
  "502/503 — the model group is temporarily overloaded.",
  "",
  "What to try:",
  "1. Wait a moment and retry your request.",
  "2. Switch to a different model in the byesu.com console.",
  "",
  "If the error persists, an operator has already seen your ticket and will reply here."
].join("\n");

const PROBLEM_503_AUTO_ANSWER_ZH = [
  "502/503 — 模型组临时过载。",
  "",
  "建议操作：",
  "1. 稍等片刻后重试请求。",
  "2. 在 byesu.com 控制台切换到其他模型。",
  "",
  "如果错误持续，操作员已看到您的工单并将在此处回复。"
].join("\n");

/** @deprecated use get503AutoAnswer(lang) for localized output */
export const PROBLEM_503_AUTO_ANSWER = PROBLEM_503_AUTO_ANSWER_RU;

export function get503AutoAnswer(lang: SupportLanguage): string {
  if (lang === "en") return PROBLEM_503_AUTO_ANSWER_EN;
  if (lang === "zh") return PROBLEM_503_AUTO_ANSWER_ZH;
  return PROBLEM_503_AUTO_ANSWER_RU;
}

// ---------------------------------------------------------------------------
// Problem auto-answer: 401 / invalid token
// ---------------------------------------------------------------------------

const PROBLEM_401_AUTO_ANSWER_RU = [
  "401 — ключ не принят. Частые причины:",
  "",
  "1. Лишние пробелы при копировании — вставьте ключ заново.",
  "2. Ключ удалён или деактивирован — проверьте в консоли byesu.com → Токены.",
  "3. Формат sk-xxxx — убедитесь, что ключ скопирован полностью.",
  "",
  "Если после проверки ошибка остаётся — оператор ответит здесь."
].join("\n");

const PROBLEM_401_AUTO_ANSWER_EN = [
  "401 — key not accepted. Common causes:",
  "",
  "1. Extra spaces when copying — paste the key again.",
  "2. Key deleted or deactivated — check under byesu.com console → Tokens.",
  "3. Format is sk-xxxx — make sure you copied the full key.",
  "",
  "If the error continues after checking, an operator will reply here."
].join("\n");

const PROBLEM_401_AUTO_ANSWER_ZH = [
  "401 — 密钥未被接受。常见原因：",
  "",
  "1. 复制时有多余空格——请重新粘贴密钥。",
  "2. 密钥已删除或停用——请在 byesu.com 控制台 → 令牌下检查。",
  "3. 格式为 sk-xxxx——请确保完整复制了密钥。",
  "",
  "检查后如果错误仍然存在，操作员将在此处回复。"
].join("\n");

/** @deprecated use get401AutoAnswer(lang) for localized output */
export const PROBLEM_401_AUTO_ANSWER = PROBLEM_401_AUTO_ANSWER_RU;

export function get401AutoAnswer(lang: SupportLanguage): string {
  if (lang === "en") return PROBLEM_401_AUTO_ANSWER_EN;
  if (lang === "zh") return PROBLEM_401_AUTO_ANSWER_ZH;
  return PROBLEM_401_AUTO_ANSWER_RU;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

const PATTERNS_503 = [
  /\b(502|503)\b/,
  /stream\s+disconnect/i,
  /service\s+unavailable/i,
  /selected\s+model\s+is\s+at\s+capacity/i,
  /временн\w+\s+(недоступ|перегруз)/i,
  /перегру(зка|жен)/i,
  /сервис\s+недоступ/i,
];

const PATTERNS_401 = [
  /\b401\b/,
  /invalid\s+token/i,
  /unauthorized/i,
  /недействительн/i,
  /ключ\s+не\s+(принят|работает|действ)/i,
  /неверн/i,
];

export type ProblemAutoAnswer = { matched: true; text: string } | { matched: false };

/**
 * Returns a KB-grounded auto-answer if the first message of a problem ticket
 * clearly matches a known error pattern. The reply is in the same language as
 * the user's message (detected by detectSupportLanguage).
 * Returns {matched: false} for 403 and anything else — those stay docs-first / human-only.
 */
export function getProblemAutoAnswer(firstMessage: string): ProblemAutoAnswer {
  if (PATTERNS_503.some((re) => re.test(firstMessage))) {
    const lang = detectSupportLanguage(firstMessage);
    return { matched: true, text: get503AutoAnswer(lang) };
  }
  if (PATTERNS_401.some((re) => re.test(firstMessage))) {
    const lang = detectSupportLanguage(firstMessage);
    return { matched: true, text: get401AutoAnswer(lang) };
  }
  return { matched: false };
}

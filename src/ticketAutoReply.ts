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

import { detectSupportLanguage, isDocsCoveredSetupQuestion, isHumanOnlySupportMessage, isOffTopicMessage, type SupportLanguage } from "./botUtils.js";
import type { CategoryCode } from "./categories.js";

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
  "Если ошибка не исчезает — нажмите «Нужен человек», и мы передадим обращение оператору."
].join("\n");

const PROBLEM_503_AUTO_ANSWER_EN = [
  "502/503 — the model group is temporarily overloaded.",
  "",
  "What to try:",
  "1. Wait a moment and retry your request.",
  "2. Switch to a different model in the byesu.com console.",
  "",
  "If the error persists, tap “Need a human” and we’ll pass the case to an operator."
].join("\n");

const PROBLEM_503_AUTO_ANSWER_ZH = [
  "502/503 — 模型组临时过载。",
  "",
  "建议操作：",
  "1. 稍等片刻后重试请求。",
  "2. 在 byesu.com 控制台切换到其他模型。",
  "",
  "如果错误持续，请点击“需要人工”，我们会转交给操作员。"
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
  "Если ошибка не исчезает — нажмите «Нужен человек», и мы передадим обращение оператору."
].join("\n");

const PROBLEM_401_AUTO_ANSWER_EN = [
  "401 — key not accepted. Common causes:",
  "",
  "1. Extra spaces when copying — paste the key again.",
  "2. Key deleted or deactivated — check under byesu.com console → Tokens.",
  "3. Format is sk-xxxx — make sure you copied the full key.",
  "",
  "If the error persists, tap “Need a human” and we’ll pass the case to an operator."
].join("\n");

const PROBLEM_401_AUTO_ANSWER_ZH = [
  "401 — 密钥未被接受。常见原因：",
  "",
  "1. 复制时有多余空格——请重新粘贴密钥。",
  "2. 密钥已删除或停用——请在 byesu.com 控制台 → 令牌下检查。",
  "3. 格式为 sk-xxxx——请确保完整复制了密钥。",
  "",
  "如果错误持续，请点击“需要人工”，我们会转交给操作员。"
].join("\n");

/** @deprecated use get401AutoAnswer(lang) for localized output */
export const PROBLEM_401_AUTO_ANSWER = PROBLEM_401_AUTO_ANSWER_RU;

export function get401AutoAnswer(lang: SupportLanguage): string {
  if (lang === "en") return PROBLEM_401_AUTO_ANSWER_EN;
  if (lang === "zh") return PROBLEM_401_AUTO_ANSWER_ZH;
  return PROBLEM_401_AUTO_ANSWER_RU;
}

// ---------------------------------------------------------------------------
// Codex CLI setup answer
// ---------------------------------------------------------------------------

const CODEX_SETUP_ANSWER_RU = [
  "Для подключения Codex CLI к byesu.com:",
  "",
  "1. Получите ключ в консоли byesu.com → Токены → Добавить токен.",
  "2. Конфиг (~/.codex/config.toml):",
  "   model_provider = \"OpenAI\"",
  "   model = \"gpt-5.5\"",
  "   review_model = \"gpt-5.5\"",
  "   model_reasoning_effort = \"medium\"",
  "   disable_response_storage = true",
  "   network_access = \"enabled\"",
  "",
  "   [model_providers.OpenAI]",
  "   name = \"OpenAI\"",
  "   base_url = \"https://byesu.com/v1\"",
  "   wire_api = \"responses\"",
  "   requires_openai_auth = true",
  "",
  "3. Ключ (~/.codex/auth.json):",
  "   { \"OPENAI_API_KEY\": \"sk-your-key\" }",
  "",
  "Если что-то не работает — нажмите «Нужен человек» и опишите ошибку.",
].join("\n");

const CODEX_SETUP_ANSWER_EN = [
  "To connect Codex CLI to byesu.com:",
  "",
  "1. Get your key from byesu.com console → Tokens → Add token.",
  "2. Config (~/.codex/config.toml):",
  "   model_provider = \"OpenAI\"",
  "   model = \"gpt-5.5\"",
  "   review_model = \"gpt-5.5\"",
  "   model_reasoning_effort = \"medium\"",
  "   disable_response_storage = true",
  "   network_access = \"enabled\"",
  "",
  "   [model_providers.OpenAI]",
  "   name = \"OpenAI\"",
  "   base_url = \"https://byesu.com/v1\"",
  "   wire_api = \"responses\"",
  "   requires_openai_auth = true",
  "",
  "3. Key (~/.codex/auth.json):",
  "   { \"OPENAI_API_KEY\": \"sk-your-key\" }",
  "",
  "If something isn't working — tap 'Need a human' and describe the error.",
].join("\n");

export function getCodexSetupAnswer(lang: SupportLanguage): string {
  if (lang === "en") return CODEX_SETUP_ANSWER_EN;
  return CODEX_SETUP_ANSWER_RU;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

const PATTERNS_503 = [
  /\b(502|503)\b/,
  /stream\s+disconnect/i,
  /service\s+unavailable/i,
  /bad\s+gateway/i,
  /selected\s+model\s+is\s+at\s+capacity/i,
  /временн\w+\s+(недоступ|перегруз)/i,
  /перегру(зка|жен)/i,
  /модел[а-яё]*\s+(перегру|недоступ|не\s+доступ)/iu,
  /сервис\s+недоступ/i,
  // Chinese: 502/503 error, model overloaded / at capacity, service unavailable
  /(502|503)\s*错误/u,
  /模型.{0,6}(超载|已满|满载|过载|繁忙|不可用)/u,
  /服务.{0,4}(不可用|繁忙|过载)/u,
];

const PATTERNS_401 = [
  /\b401\b/,
  /invalid\s+token/i,
  /unauthorized/i,
  /key\s+not\s+accepted/i,
  /недействительн/i,
  /ключ\s+не\s+(принят|работает|действ)/i,
  /неверн/i,
  // Chinese: 401 error, invalid token, unauthorized, key not accepted
  /401\s*(错误|无效|未授权)/u,
  /(令牌|token|密钥|key)\s*(无效|错误|未被接受|不正确)/iu,
  /(无效|错误)\s*(令牌|token|密钥)/iu,
  /未授权|未经授权/u,
];

export type ProblemIntent = "problem_401" | "problem_503";
export type ProblemAutoAnswer = { matched: true; intent: ProblemIntent; text: string } | { matched: false };

/**
 * Returns a KB-grounded auto-answer if the first message of a problem ticket
 * clearly matches a known error pattern. The reply is in the same language as
 * the user's message (detected by detectSupportLanguage). The returned intent
 * lets a pending session recognise same-issue follow-ups without escalating.
 * Returns {matched: false} for 403 and anything else — those stay docs-first / human-only.
 */
export function getProblemAutoAnswer(firstMessage: string): ProblemAutoAnswer {
  if (PATTERNS_503.some((re) => re.test(firstMessage))) {
    const lang = detectSupportLanguage(firstMessage);
    return { matched: true, intent: "problem_503", text: get503AutoAnswer(lang) };
  }
  if (PATTERNS_401.some((re) => re.test(firstMessage))) {
    const lang = detectSupportLanguage(firstMessage);
    return { matched: true, intent: "problem_401", text: get401AutoAnswer(lang) };
  }
  return { matched: false };
}

// ---------------------------------------------------------------------------
// Support-intent classifier
// ---------------------------------------------------------------------------

export type SupportIntentKind =
  | "human_only"
  | "problem_401"
  | "problem_503"
  | "docs_codex_setup"
  | "off_topic"
  | "unknown";

export interface SupportIntent {
  kind: SupportIntentKind;
  confidence: "high" | "medium" | "low";
  suggestedCategory?: CategoryCode;
}

/**
 * Routes a support message by its intent, independent of the selected category.
 *
 * Priority (highest first):
 *   1. human_only        — payment/crypto/balance/refund/referral topics (operator-only)
 *   2. problem_401 / 503 — deterministic KB-covered API errors
 *   3. docs_codex_setup  — deterministic docs-covered Codex CLI setup
 *   4. off_topic         — jailbreak / general chatbot / unrelated (no AI, no auto-answer)
 *   5. unknown           — falls through to the AI docs path, then ticket creation
 *
 * Human-only always wins over deterministic API/docs answers so a payment message
 * that also mentions "502" is never given an API auto-answer.
 */
export function classifySupportIntent(text: string): SupportIntent {
  if (isHumanOnlySupportMessage(text)) {
    return { kind: "human_only", confidence: "high", suggestedCategory: "payment" };
  }
  const problem = getProblemAutoAnswer(text);
  if (problem.matched) {
    return { kind: problem.intent, confidence: "high", suggestedCategory: "problem" };
  }
  if (isDocsCoveredSetupQuestion(text)) {
    return { kind: "docs_codex_setup", confidence: "high", suggestedCategory: "question" };
  }
  if (isOffTopicMessage(text)) {
    return { kind: "off_topic", confidence: "high" };
  }
  return { kind: "unknown", confidence: "low" };
}

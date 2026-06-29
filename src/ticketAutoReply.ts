/**
 * Ticket-open auto-replies grounded in src/knowledgeBase.ts.
 *
 * payment — structured acknowledgment asking for the info support needs.
 * problem  — KB-covered auto-answers for 503 and 401 sent before the human
 *            operator sees the ticket, reducing median first-reply latency.
 * 403      — remains docs-first (User-Agent issue unverified); no auto-answer.
 */

/** Sent immediately when a payment ticket opens. Grounded in KB §2. */
export const PAYMENT_ACKNOWLEDGMENT = [
  "Обращение принято. Чтобы мы могли проверить платёж, пожалуйста, укажите:",
  "",
  "• Telegram username",
  "• номер заказа",
  "• сумму и примерное время оплаты",
  "",
  "Реквизиты карты не нужны — мы их не запрашиваем."
].join("\n");

/** Sent immediately when a problem ticket opens and the first message matches 503. Grounded in KB §5. */
export const PROBLEM_503_AUTO_ANSWER = [
  "503 — временная перегрузка группы моделей.",
  "",
  "Что попробовать:",
  "1. Подождите 1–2 минуты и повторите запрос.",
  "2. Переключитесь на другую модель в консоли byesu.com.",
  "",
  "Если ошибка не исчезает более 10 минут — оператор уже видит обращение и ответит здесь."
].join("\n");

/** Sent immediately when a problem ticket opens and the first message matches 401. Grounded in KB §5. */
export const PROBLEM_401_AUTO_ANSWER = [
  "401 — ключ не принят. Частые причины:",
  "",
  "1. Лишние пробелы при копировании — вставьте ключ заново.",
  "2. Ключ удалён или деактивирован — проверьте в консоли byesu.com → Токены.",
  "3. Формат sk-xxxx — убедитесь, что ключ скопирован полностью.",
  "",
  "Если после проверки ошибка остаётся — оператор ответит здесь."
].join("\n");

const PATTERNS_503 = [
  /\b503\b/,
  /stream\s+disconnect/i,
  /service\s+unavailable/i,
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
 * clearly matches a known error pattern. Returns {matched: false} for 403 and
 * anything else — those stay docs-first / human-only.
 */
export function getProblemAutoAnswer(firstMessage: string): ProblemAutoAnswer {
  if (PATTERNS_503.some((re) => re.test(firstMessage))) {
    return { matched: true, text: PROBLEM_503_AUTO_ANSWER };
  }
  if (PATTERNS_401.some((re) => re.test(firstMessage))) {
    return { matched: true, text: PROBLEM_401_AUTO_ANSWER };
  }
  return { matched: false };
}

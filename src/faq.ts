import { Markup } from "telegraf";
import type { SupportLanguage } from "./botUtils.js";
import { t } from "./i18n.js";

export interface FaqSection {
  id: string;
  title: string;
  text: string;
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "start",
    title: "Быстрый старт",
    text: [
      "Быстрый старт",
      "",
      "1. Зарегистрируйтесь в консоли Byesu.",
      "2. Пополните баланс или активируйте промокод.",
      "3. Создайте API-ключ: Консоль → Токены → Добавить токен.",
      "4. Подключите ключ к нужному инструменту.",
      "5. Укажите точное название модели из консоли.",
      "",
      "base_url зависит от клиента:",
      "— OpenAI/Codex/Roo/Hermes/OpenCode: https://byesu.com/v1",
      "— Claude Code: https://byesu.com (без /v1)",
      "— Gemini: https://byesu.com",
      "",
      "Полная документация: https://docs.byesu.com"
    ].join("\n")
  },
  {
    id: "topup",
    title: "Оплата и баланс",
    text: [
      "Оплата и баланс",
      "",
      "Если платёж прошёл, но код или баланс не появился — напишите в поддержку.",
      "",
      "Сразу укажите:",
      "— Telegram username",
      "— номер заказа",
      "— сумму",
      "— примерное время оплаты",
      "— TxID/hash, если платили криптовалютой",
      "",
      "Реквизиты карты не нужны — поддержка их не запрашивает.",
      "",
      "Перенос баланса со старого сайта на новый — ручная проверка.",
      "Укажите email/username/ID аккаунта на обоих сайтах.",
      "",
      "Если баланс исчез, стал меньше или списался неверно — создайте обращение.",
      "Такие случаи нельзя закрыть автоответом."
    ].join("\n")
  },
  {
    id: "models",
    title: "Модели и цены",
    text: [
      "Модели и цены",
      "",
      "Актуальный список и калькулятор: https://byesu.ru/prices",
      "",
      "Группы моделей:",
      "— GPT Plus / GPT Pro — модели OpenAI.",
      "— Gemini — модели Google.",
      "— Claude MAX / Claude Kiro — модели Anthropic.",
      "— media/media-gen — генерация изображений и видео.",
      "",
      "Один ключ = одна группа. Для другой группы создайте отдельный ключ.",
      "Ошибка «no available channels» — модель не входит в группу вашего ключа или временно нет канала.",
      "",
      "Если группа временно нестабильна — попробуйте другую модель или группу."
    ].join("\n")
  },
  {
    id: "clients",
    title: "Настройка клиентов",
    text: [
      "Настройка клиентов",
      "",
      "Полная документация: https://docs.byesu.com/clients",
      "",
      "Codex CLI: base_url = https://byesu.com/v1, wire_api = \"responses\"",
      "Claude Code: ANTHROPIC_BASE_URL = https://byesu.com (без /v1)",
      "Roo Code (VS Code): OpenAI Compatible, https://byesu.com/v1",
      "OpenCode / Kilo Code / Cline / OpenClaw / Hermes: OpenAI Compatible, https://byesu.com/v1",
      "Cherry Studio и GUI-клиенты: https://byesu.com/v1",
      "",
      "Для любого OpenAI-совместимого клиента: base_url https://byesu.com/v1 + ваш sk-ключ.",
      "",
      "Если через curl работает, а конкретный клиент зависает или даёт 403 — пришлите название клиента, версию, конфиг и текст ошибки."
    ].join("\n")
  },
  {
    id: "media",
    title: "Генерация изображений и видео",
    text: [
      "Генерация изображений и видео",
      "",
      "Требует токена группы media/media-gen.",
      "",
      "Веб-плейграунд (без кода): https://byesu.com/media/playground.html",
      "API: POST /v1/images/generations → возвращает base64.",
      "",
      "Модели изображений: GPT-Image-2, Nano-Banana-2, Flux Kontext Max, Adobe Firefly.",
      "Модели видео: Gemini Veo 3.1, Runway Gen4 Turbo, Adobe Firefly Video.",
      "",
      "«no available channels» — используйте токен именно группы media/media-gen."
    ].join("\n")
  },
  {
    id: "errors",
    title: "Ошибки API",
    text: [
      "Ошибки API",
      "",
      "401 — недействительный ключ. Проверьте в консоли, нет ли лишних пробелов.",
      "403 — модель недоступна для этого ключа. Проверьте группу токена.",
      "404 — неверный base URL (нужен /v1 для OpenAI-клиентов, без /v1 для Claude Code).",
      "429 — слишком много запросов. Уменьшите параллелизм.",
      "500/белый экран в консоли — отключите автоперевод страницы.",
      "502/503/stream disconnected/capacity — временная недоступность модели или группы. Повторите позже или смените модель.",
      "insufficient_balance — пополните баланс на https://byesu.ru",
      "model_not_found — скопируйте точное ID модели с https://byesu.ru/prices",
      "no available channels — модель не в группе ключа.",
      "",
      "Timeout в Codex/Claude Code — проверьте VPN и пропишите прокси в конфиге.",
      "",
      "403, платежи, переносы и проблемы с балансом часто требуют ручной проверки."
    ].join("\n")
  },
  {
    id: "support",
    title: "Поддержка",
    text: [
      "Поддержка",
      "",
      "Бот: @byesu_support_bot",
      "Чат сообщества: https://t.me/byesuchat",
      "Канал: https://t.me/byesuE",
      "",
      "При проблеме с API укажите: клиент, модель, текст ошибки, наличие VPN.",
      "При проблеме с оплатой: Telegram username, номер заказа, сумму, время, TxID/hash.",
      "",
      "Реквизиты карты и API-ключи не передавайте.",
      "",
      "Всегда передаётся человеку:",
      "— платёж/крипта не зачислились",
      "— перенос баланса",
      "— баланс исчез или списался неверно",
      "— возвраты",
      "— партнёрство, тестовый баланс, индивидуальные лимиты"
    ].join("\n")
  }
];

export function findFaqSection(id: string): FaqSection | null {
  return FAQ_SECTIONS.find((section) => section.id === id) ?? null;
}

export function faqListText(lang: SupportLanguage = "ru"): string {
  return t(lang, "faqListPrompt");
}

export function faqListKeyboard(lang: SupportLanguage = "ru") {
  return Markup.inlineKeyboard([
    ...FAQ_SECTIONS.map((section) => [
      Markup.button.callback(section.title, `faq:section:${section.id}`)
    ]),
    [Markup.button.callback(t(lang, "btnBack"), "menu:start")]
  ]);
}

export function faqSectionKeyboard(lang: SupportLanguage = "ru") {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, "btnBackToFaq"), "faq:list")],
    [Markup.button.callback(t(lang, "btnNewTicket"), "menu:new_ticket")]
  ]);
}

export function formatFaqSection(section: FaqSection): string {
  return section.text;
}

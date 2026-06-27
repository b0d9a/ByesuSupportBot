import { Markup } from "telegraf";

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
      "1. Зарегистрируйтесь на https://byesu.ru",
      "2. Пополните баланс.",
      "3. Создайте API-ключ: Консоль → Токены → Добавить токен.",
      "4. Подключите ключ к нужному инструменту.",
      "",
      "base_url зависит от клиента:",
      "— OpenAI/Codex: https://byesu.com/v1",
      "— Claude Code: https://byesu.com (без /v1)",
      "— Gemini: https://byesu.com",
      "",
      "Полная документация: https://docs.byesu.com"
    ].join("\n")
  },
  {
    id: "topup",
    title: "Пополнение баланса",
    text: [
      "Пополнение баланса",
      "",
      "Платите рублями → получаете промокод в USD → активируете в консоли.",
      "",
      "Статусы заказа:",
      "— PENDING: платёж ожидает подтверждения.",
      "— CONFIRMED: платёж подтверждён, код выдан.",
      "— CANCELLED/FAILED: оплата не завершена.",
      "— CHARGEBACKED: открыт спор, нужна ручная проверка.",
      "",
      "Формула: RUB = USD × (Rapira USDT/RUB × 1,01) × 1,085",
      "",
      "Если деньги списались, но код не пришёл — напишите в поддержку.",
      "Укажите: Telegram username, номер заказа, сумму и время оплаты."
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
      "Ошибка «no available channels» — модель не входит в группу вашего ключа."
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
      "OpenClaw / Hermes: Custom OpenAI Compatible, https://byesu.com/v1",
      "Cherry Studio и GUI-клиенты: https://byesu.com/v1",
      "",
      "Для любого OpenAI-совместимого клиента: base_url https://byesu.com/v1 + ваш sk-ключ."
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
      "503 — временная перегрузка. Подождите и повторите.",
      "insufficient_balance — пополните баланс на https://byesu.ru",
      "model_not_found — скопируйте точное ID модели с https://byesu.ru/prices",
      "no available channels — модель не в группе ключа.",
      "",
      "Timeout в Codex/Claude Code — проверьте VPN и пропишите прокси в конфиге."
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
      "При проблеме с оплатой: Telegram username, номер заказа, сумму, время.",
      "",
      "Реквизиты карты не передавайте — поддержка их не запрашивает."
    ].join("\n")
  }
];

export function findFaqSection(id: string): FaqSection | null {
  return FAQ_SECTIONS.find((section) => section.id === id) ?? null;
}

export function faqListText(): string {
  return "Выберите раздел FAQ.";
}

export function faqListKeyboard() {
  return Markup.inlineKeyboard([
    ...FAQ_SECTIONS.map((section) => [
      Markup.button.callback(section.title, `faq:section:${section.id}`)
    ]),
    [Markup.button.callback("Назад", "menu:start")]
  ]);
}

export function faqSectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Назад к FAQ", "faq:list")],
    [Markup.button.callback("Создать обращение", "menu:new_ticket")]
  ]);
}

export function formatFaqSection(section: FaqSection): string {
  return section.text;
}

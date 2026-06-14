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
      "3. Создайте API-ключ в личном кабинете.",
      "4. Подключите ключ к нужному инструменту: Codex, Claude Code, OpenCode или другому клиенту.",
      "",
      "Подробная документация: https://byesu.ru/docs",
      "",
      "Один API-ключ подходит для всех групп моделей. Группа выбирается в настройках ключа на сайте."
    ].join("\n")
  },
  {
    id: "models",
    title: "Модели и цены",
    text: [
      "Модели и цены",
      "",
      "Актуальный список моделей, группы и калькулятор стоимости:",
      "https://byesu.ru/prices#g=bl1&m=gpt-5.4&in=1000000&out=100000&req=1&cur=RUB&f=all",
      "",
      "Группы моделей:",
      "- GPT Plus — самая экономная группа.",
      "- GPT Pro — дороже, но стабильнее.",
      "- Gemini — отдельная группа моделей Gemini.",
      "- Claude MAX — группа Claude с максимальным доступом.",
      "- Claude Kiro — более дешёвая группа Claude.",
      "",
      "Цены и состав групп могут меняться, поэтому проверяйте их на сайте."
    ].join("\n")
  },
  {
    id: "payments",
    title: "Оплата",
    text: [
      "Оплата",
      "",
      "Актуальные способы оплаты смотрите на сайте: https://byesu.ru",
      "",
      "На сайте указаны МИР и СБП. Если способ оплаты отображается, но не работает или вызывает вопросы, напишите в поддержку.",
      "",
      "Если платёж отправлен, но деньги не зачислились, напишите в @byesu_support_bot и укажите:",
      "- сумму;",
      "- способ оплаты;",
      "- подтверждение транзакции.",
      "",
      "При нулевом балансе API возвращает ошибку insufficient_balance."
    ].join("\n")
  },
  {
    id: "clients",
    title: "Настройка клиентов",
    text: [
      "Настройка клиентов",
      "",
      "Документация по подключению: https://byesu.ru/docs",
      "",
      "Codex:",
      "base_url = https://code.byesu.com/v1",
      "env_key = BYESU_API_KEY",
      "",
      "Claude Code:",
      "ANTHROPIC_AUTH_TOKEN = ваш API-ключ",
      "ANTHROPIC_BASE_URL = https://code.byesu.com",
      "ANTHROPIC_MODEL = нужная модель",
      "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = 1",
      "",
      "Для расширения Claude Code в VS Code используются те же переменные окружения или .claude/settings.json."
    ].join("\n")
  },
  {
    id: "errors",
    title: "Ошибки API",
    text: [
      "Ошибки API",
      "",
      "401 — ключ не передан, недействителен или неправильно указан.",
      "403 — ключ действителен, но модель или группа недоступна.",
      "404 — неверный base URL, обычно нужен /v1 для OpenAI-совместимых клиентов.",
      "429 — слишком много запросов, уменьшите параллелизм.",
      "503 — временная перегрузка или недоступность группы моделей.",
      "insufficient_balance — нужно пополнить баланс.",
      "model_not_found — проверьте точный ID модели на странице цен.",
      "",
      "Если Codex или Claude Code зависает на reconnect/timeout, проверьте VPN и явно пропишите прокси в конфиге инструмента."
    ].join("\n")
  },
  {
    id: "support",
    title: "Поддержка",
    text: [
      "Поддержка",
      "",
      "Основной канал поддержки: @byesu_support_bot",
      "",
      "Напишите боту сообщение, выберите тип обращения и опишите проблему. Поддержка ответит в этом же диалоге.",
      "",
      "При технической проблеме укажите:",
      "- какой инструмент используете;",
      "- модель или группу моделей;",
      "- текст ошибки;",
      "- есть ли VPN/прокси;",
      "- пример запроса, если это безопасно.",
      "",
      "Подписки через бота планируются в будущем, но сейчас основные силы направлены на стабилизацию API. Сейчас доступ предоставляется через API-ключ с балансом."
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
  return Markup.inlineKeyboard(
    FAQ_SECTIONS.map((section) => [
      Markup.button.callback(section.title, `faq:section:${section.id}`)
    ])
  );
}

export function faqSectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Назад", "faq:list")]
  ]);
}

export function formatFaqSection(section: FaqSection): string {
  return section.text;
}

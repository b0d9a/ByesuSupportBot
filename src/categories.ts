import { Markup } from "telegraf";

export const CATEGORIES = [
  { code: "payment", label: "Оплата / промокод" },
  { code: "problem", label: "Ошибка API / техническая проблема" },
  { code: "question", label: "Вопрос / настройка" },
  { code: "other", label: "Другое (не API и не оплата)" }
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]["code"];

export function isCategoryCode(value: string): value is CategoryCode {
  return CATEGORIES.some((category) => category.code === value);
}

export function categoryLabel(code: string): string {
  return CATEGORIES.find((category) => category.code === code)?.label ?? code;
}

export function categoryKeyboard(opts: { back?: boolean } = {}) {
  const backRow = opts.back ? [[Markup.button.callback("Назад", "menu:start")]] : [];
  return Markup.inlineKeyboard([
    ...CATEGORIES.map((category) => [
      Markup.button.callback(category.label, `category:${category.code}`)
    ]),
    ...backRow
  ]);
}

export function categoryChangeKeyboard(ticketId: number) {
  return Markup.inlineKeyboard(
    CATEGORIES.map((category) => [
      Markup.button.callback(category.label, `set_category:${ticketId}:${category.code}`)
    ])
  );
}

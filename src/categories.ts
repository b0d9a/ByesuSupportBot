import { Markup } from "telegraf";

export const CATEGORIES = [
  { code: "question", label: "Вопрос" },
  { code: "problem", label: "Проблема" },
  { code: "payment", label: "Оплата" },
  { code: "other", label: "Другое" }
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]["code"];

export function isCategoryCode(value: string): value is CategoryCode {
  return CATEGORIES.some((category) => category.code === value);
}

export function categoryLabel(code: string): string {
  return CATEGORIES.find((category) => category.code === code)?.label ?? code;
}

export function categoryKeyboard() {
  return Markup.inlineKeyboard(
    CATEGORIES.map((category) => [
      Markup.button.callback(category.label, `category:${category.code}`)
    ])
  );
}

export function categoryChangeKeyboard(ticketId: number) {
  return Markup.inlineKeyboard(
    CATEGORIES.map((category) => [
      Markup.button.callback(category.label, `set_category:${ticketId}:${category.code}`)
    ])
  );
}

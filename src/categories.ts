import { Markup } from "telegraf";
import type { SupportLanguage } from "./botUtils.js";

export const CATEGORIES = [
  { code: "payment", label: "Оплата / промокод" },
  { code: "problem", label: "Ошибка API / техническая проблема" },
  { code: "question", label: "Вопрос / настройка" },
  { code: "other", label: "Другое (не API и не оплата)" }
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]["code"];

const CATEGORY_LABELS: Record<CategoryCode, Record<SupportLanguage, string>> = {
  payment: { ru: "Оплата / промокод", en: "Payment / promo code", zh: "付款 / 优惠码" },
  problem: { ru: "Ошибка API / техническая проблема", en: "API error / technical problem", zh: "API 错误 / 技术问题" },
  question: { ru: "Вопрос / настройка", en: "Question / setup", zh: "问题 / 设置" },
  other: { ru: "Другое (не API и не оплата)", en: "Other (not API or payment)", zh: "其他（非 API 或付款）" },
};

export function isCategoryCode(value: string): value is CategoryCode {
  return CATEGORIES.some((category) => category.code === value);
}

export function categoryLabel(code: string, lang: SupportLanguage = "ru"): string {
  if (!isCategoryCode(code)) return code;
  return CATEGORY_LABELS[code][lang];
}

export function categoryKeyboard(opts: { back?: boolean; lang?: SupportLanguage } = {}) {
  const lang = opts.lang ?? "ru";
  const backLabel = lang === "en" ? "Back" : lang === "zh" ? "返回" : "Назад";
  const backRow = opts.back ? [[Markup.button.callback(backLabel, "menu:start")]] : [];
  return Markup.inlineKeyboard([
    ...CATEGORIES.map((category) => [
      Markup.button.callback(categoryLabel(category.code, lang), `category:${category.code}`)
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

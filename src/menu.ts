import { Markup } from "telegraf";

export function mainMenuText(): string {
  return "Здравствуйте! Чем можем помочь?";
}

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Создать обращение", "menu:new_ticket")],
    [Markup.button.callback("FAQ / Частые вопросы", "menu:faq")]
  ]);
}

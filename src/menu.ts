import { Markup } from "telegraf";
import type { SupportLanguage } from "./botUtils.js";
import { t } from "./i18n.js";

export function mainMenuText(lang: SupportLanguage = "ru"): string {
  return t(lang, "welcome");
}

export function mainMenuKeyboard(lang: SupportLanguage = "ru") {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, "btnNewTicket"), "menu:new_ticket")],
    [Markup.button.callback(t(lang, "btnFaq"), "menu:faq")],
    [Markup.button.callback(t(lang, "btnLanguage"), "menu:language")]
  ]);
}

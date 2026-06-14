import { describe, expect, it } from "vitest";
import { categoryKeyboard } from "../src/categories.js";
import { faqListKeyboard, faqSectionKeyboard } from "../src/faq.js";
import { mainMenuKeyboard, mainMenuText } from "../src/menu.js";

describe("mainMenu", () => {
  it("shows main menu text", () => {
    expect(mainMenuText()).toContain("Чем можем помочь");
  });

  it("has new_ticket and faq buttons", () => {
    const buttons = mainMenuKeyboard().reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("menu:new_ticket");
    expect(cbData).toContain("menu:faq");
  });
});

describe("categoryKeyboard", () => {
  it("has no Назад button by default", () => {
    const buttons = categoryKeyboard().reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).not.toContain("menu:start");
  });

  it("has Назад button when back option is set", () => {
    const buttons = categoryKeyboard({ back: true }).reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("menu:start");
  });

  it("always includes all category codes", () => {
    const buttons = categoryKeyboard({ back: true }).reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("category:question");
    expect(cbData).toContain("category:problem");
    expect(cbData).toContain("category:payment");
    expect(cbData).toContain("category:other");
  });
});

describe("faqListKeyboard", () => {
  it("has a Назад button pointing to menu:start", () => {
    const buttons = faqListKeyboard().reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("menu:start");
  });

  it("has buttons for all FAQ sections", () => {
    const buttons = faqListKeyboard().reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("faq:section:start");
    expect(cbData).toContain("faq:section:models");
    expect(cbData).toContain("faq:section:payments");
    expect(cbData).toContain("faq:section:clients");
    expect(cbData).toContain("faq:section:errors");
    expect(cbData).toContain("faq:section:support");
  });
});

describe("faqSectionKeyboard", () => {
  it("has back-to-list and new-ticket buttons", () => {
    const buttons = faqSectionKeyboard().reply_markup.inline_keyboard.flat();
    const cbData = buttons.map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(cbData).toContain("faq:list");
    expect(cbData).toContain("menu:new_ticket");
  });
});

import { describe, expect, it } from "vitest";
import { categoryKeyboard } from "../src/categories.js";
import { faqListKeyboard, faqSectionKeyboard } from "../src/faq.js";
import { mainMenuKeyboard, mainMenuText } from "../src/menu.js";
import { moderatorTicketKeyboard } from "../src/ticketService.js";
import type { TicketRecord, UserThreadRecord } from "../src/types.js";

const ticket: TicketRecord = {
  id: 42,
  publicCode: "ABC123",
  userId: 7,
  category: "question",
  status: "open",
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: null
};

const thread: UserThreadRecord = {
  id: 1,
  userId: 7,
  messageThreadId: 100,
  pinnedMessageId: 200,
  topicTitle: "#ABC123 · Вопрос · @client",
  isClosed: false
};

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

describe("moderatorTicketKeyboard", () => {
  it("includes topic URL by default for service cards", () => {
    const buttons = moderatorTicketKeyboard(ticket, -1001234567890, thread).reply_markup.inline_keyboard.flat();
    const labels = buttons.map((b) => b.text);
    expect(labels).toContain("Открыть топик");
  });

  it("omits topic URL when used for pinned cards", () => {
    const buttons = moderatorTicketKeyboard(ticket, -1001234567890, thread, { includeTopicUrl: false }).reply_markup.inline_keyboard.flat();
    const labels = buttons.map((b) => b.text);
    expect(labels).not.toContain("Открыть топик");
    expect(labels).toContain("🟡 На рассмотрении");
    expect(labels).toContain("🟢 Закрыть");
    expect(labels).toContain("Сменить тип");
  });
});

import { describe, expect, it } from "vitest";
import { FAQ_SECTIONS, faqListText, findFaqSection, formatFaqSection } from "../src/faq.js";

describe("FAQ content", () => {
  it("has the expected public sections", () => {
    expect(FAQ_SECTIONS.map((section) => section.id)).toEqual([
      "start",
      "topup",
      "models",
      "clients",
      "media",
      "errors",
      "support"
    ]);
  });

  it("finds a section by id", () => {
    expect(findFaqSection("topup")?.title).toBe("Пополнение баланса");
    expect(findFaqSection("missing")).toBeNull();
  });

  it("keeps every section under Telegram message limit", () => {
    for (const section of FAQ_SECTIONS) {
      expect(formatFaqSection(section).length).toBeLessThan(4096);
    }
  });

  it("does not expose unresolved/internal wording", () => {
    const fullText = FAQ_SECTIONS.map((section) => section.text).join("\n");
    expect(fullText).not.toContain("Требует официального ответа");
    expect(fullText).not.toContain("Дать ответ");
    expect(fullText).not.toContain("____________________________________________________");
  });

  it("uses a concise list prompt", () => {
    expect(faqListText()).toBe("Выберите раздел FAQ.");
  });
});

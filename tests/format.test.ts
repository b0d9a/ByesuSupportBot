import { describe, expect, it } from "vitest";
import { formatTopicTitle, statusEmoji, statusLabel, supportTopicUrl } from "../src/format.js";
import type { UserRecord } from "../src/types.js";

const user: UserRecord = {
  id: 1,
  telegramUserId: 123456,
  username: "client",
  firstName: "Test",
  lastName: "User",
  languageCode: "ru",
  firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("statusEmoji", () => {
  it("returns 🔴 for open", () => {
    expect(statusEmoji("open")).toBe("🔴");
  });

  it("returns 🟡 for in_review", () => {
    expect(statusEmoji("in_review")).toBe("🟡");
  });

  it("returns 🟢 for closed", () => {
    expect(statusEmoji("closed")).toBe("🟢");
  });
});

describe("statusLabel", () => {
  it("returns correct Russian label for open", () => {
    expect(statusLabel("open")).toBe("открыто");
  });

  it("returns correct Russian label for in_review", () => {
    expect(statusLabel("in_review")).toBe("на рассмотрении");
  });

  it("returns correct Russian label for closed", () => {
    expect(statusLabel("closed")).toBe("закрыто");
  });
});

describe("formatTopicTitle", () => {
  it("defaults to open emoji when no status supplied", () => {
    expect(formatTopicTitle("A1B2C3", "problem", user)).toBe("🔴 #A1B2C3 · Проблема · @client");
  });

  it("includes status emoji prefix, ticket code, category label and username", () => {
    expect(formatTopicTitle("A1B2C3", "problem", user, "open")).toBe("🔴 #A1B2C3 · Проблема · @client");
    expect(formatTopicTitle("A1B2C3", "problem", user, "in_review")).toBe("🟡 #A1B2C3 · Проблема · @client");
    expect(formatTopicTitle("A1B2C3", "problem", user, "closed")).toBe("🟢 #A1B2C3 · Проблема · @client");
  });

  it("keeps Telegram forum topic title within the API limit", () => {
    const longUser = { ...user, username: "x".repeat(200) };
    expect(formatTopicTitle("A1B2C3", "question", longUser)).toHaveLength(128);
  });
});

describe("supportTopicUrl", () => {
  it("builds private supergroup c-link", () => {
    expect(supportTopicUrl(-1001234567890, 77, 88)).toBe("https://t.me/c/1234567890/88?thread=77");
  });
});

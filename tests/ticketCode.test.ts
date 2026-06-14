import { describe, expect, it } from "vitest";
import { generateTicketCode } from "../src/ticketCode.js";

describe("generateTicketCode", () => {
  it("generates 6 uppercase latin letters or digits", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateTicketCode()).toMatch(/^[0-9A-Z]{6}$/);
    }
  });
});

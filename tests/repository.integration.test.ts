import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupportRepository } from "../src/repository.js";

const DB_URL = process.env["INTEGRATION_TEST_DB_URL"];

// Skip all tests when no DB URL is configured, so CI without a DB stays green.
const describeIntegration = DB_URL ? describe : describe.skip;

// Stable sentinel so we can always clean up our test rows without touching production data.
const TEST_TELEGRAM_USER_ID = 9_000_000_001;

let pool: pg.Pool;
let repo: SupportRepository;

describeIntegration("SupportRepository integration", () => {
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DB_URL });
    repo = new SupportRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Delete the sentinel user and everything that cascades from it.
    await pool.query("delete from users where telegram_user_id = $1", [TEST_TELEGRAM_USER_ID]);
    await pool.query("delete from user_states where telegram_user_id = $1", [TEST_TELEGRAM_USER_ID]);
  });

  async function seedUser() {
    return repo.upsertUser({
      id: TEST_TELEGRAM_USER_ID,
      username: "test_integration",
      first_name: "Integration",
      last_name: "Test",
      language_code: "ru"
    });
  }

  it("upserts user and retrieves by id", async () => {
    const user = await seedUser();
    expect(user.telegramUserId).toBe(TEST_TELEGRAM_USER_ID);
    expect(user.username).toBe("test_integration");

    const found = await repo.findUserById(user.id);
    expect(found?.id).toBe(user.id);
    expect(found?.username).toBe("test_integration");
  });

  it("upsert updates existing user fields", async () => {
    await seedUser();
    const updated = await repo.upsertUser({
      id: TEST_TELEGRAM_USER_ID,
      username: "updated_name",
      first_name: "Updated"
    });
    expect(updated.username).toBe("updated_name");
    expect(updated.firstName).toBe("Updated");
  });

  it("getActiveTicket returns null when no tickets exist", async () => {
    const user = await seedUser();
    const ticket = await repo.getActiveTicket(user.id);
    expect(ticket).toBeNull();
  });

  it("creates ticket and getActiveTicket returns it", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    expect(ticket.status).toBe("open");
    expect(ticket.publicCode).toMatch(/^[0-9A-Z]{6}$/);

    const active = await repo.getActiveTicket(user.id);
    expect(active?.id).toBe(ticket.id);
  });

  it("closeTicket sets status to closed and getActiveTicket returns null", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    const closed = await repo.closeTicket(ticket.id);
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).not.toBeNull();

    const active = await repo.getActiveTicket(user.id);
    expect(active).toBeNull();
  });

  it("closeTicket is idempotent — returns null on second close", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    await repo.closeTicket(ticket.id);
    const second = await repo.closeTicket(ticket.id);
    expect(second).toBeNull();
  });

  it("reopenTicket restores status to open", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    await repo.closeTicket(ticket.id);
    const reopened = await repo.reopenTicket(ticket.id);
    expect(reopened?.status).toBe("open");
    expect(reopened?.closedAt).toBeNull();
  });

  it("setTicketStatus transitions open → in_review", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "problem");
    const updated = await repo.setTicketStatus(ticket.id, "in_review");
    expect(updated?.status).toBe("in_review");

    const active = await repo.getActiveTicket(user.id);
    expect(active?.status).toBe("in_review");
  });

  it("updateTicketCategory changes category", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    const updated = await repo.updateTicketCategory(ticket.id, "problem");
    expect(updated?.category).toBe("problem");
  });

  it("selectedCategory round-trip: set, get, clear", async () => {
    const user = await seedUser();
    await repo.setSelectedCategory(user.telegramUserId, "question");
    expect(await repo.getSelectedCategory(user.telegramUserId)).toBe("question");
    await repo.clearSelectedCategory(user.telegramUserId);
    expect(await repo.getSelectedCategory(user.telegramUserId)).toBeNull();
  });

  it("statsForUser counts open and closed correctly", async () => {
    const user = await seedUser();
    const t1 = await repo.createTicket(user.id, "question");
    const t2 = await repo.createTicket(user.id, "problem");
    await repo.closeTicket(t2.id);

    const stats = await repo.statsForUser(user.id);
    expect(stats.openCount).toBe(1);
    expect(stats.closedCount).toBe(1);

    await repo.closeTicket(t1.id);
    const stats2 = await repo.statsForUser(user.id);
    expect(stats2.openCount).toBe(0);
    expect(stats2.closedCount).toBe(2);
  });

  it("createThread and findThreadByUserId", async () => {
    const user = await seedUser();
    const thread = await repo.createThread(user.id, 99_001, "🔴 #AABBCC · Вопрос · @test_integration");
    expect(thread.messageThreadId).toBe(99_001);
    expect(thread.isClosed).toBe(false);

    const found = await repo.findThreadByUserId(user.id);
    expect(found?.id).toBe(thread.id);
  });

  it("updateThread sets isClosed and title", async () => {
    const user = await seedUser();
    const thread = await repo.createThread(user.id, 99_002, "initial title");
    const updated = await repo.updateThread(thread.id, { isClosed: true, title: "new title" });
    expect(updated.isClosed).toBe(true);
    expect(updated.topicTitle).toBe("new title");
  });

  it("updateThread with pinnedMessageId: null clears the column", async () => {
    const user = await seedUser();
    const thread = await repo.createThread(user.id, 99_003, "test thread");
    const withPin = await repo.updateThread(thread.id, { pinnedMessageId: 42_000 });
    expect(withPin.pinnedMessageId).toBe(42_000);

    const cleared = await repo.updateThread(thread.id, { pinnedMessageId: null });
    expect(cleared.pinnedMessageId).toBeNull();
  });

  it("updateThread with isClosed: false correctly writes false", async () => {
    const user = await seedUser();
    const thread = await repo.createThread(user.id, 99_004, "test thread");
    await repo.updateThread(thread.id, { isClosed: true });

    const reopened = await repo.updateThread(thread.id, { isClosed: false });
    expect(reopened.isClosed).toBe(false);
  });

  it("updateThread with empty values object returns current row unchanged", async () => {
    const user = await seedUser();
    const thread = await repo.createThread(user.id, 99_005, "stable title");
    const same = await repo.updateThread(thread.id, {});
    expect(same.topicTitle).toBe("stable title");
    expect(same.isClosed).toBe(false);
  });

  it("service cards: set, get, delete", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");

    await repo.setServiceCard(ticket.id, "open_tickets", 55_001);
    expect(await repo.getServiceCard(ticket.id, "open_tickets")).toBe(55_001);

    await repo.deleteServiceCard(ticket.id, "open_tickets");
    expect(await repo.getServiceCard(ticket.id, "open_tickets")).toBeNull();
  });

  it("service cards: upsert replaces existing message_id", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");

    await repo.setServiceCard(ticket.id, "open_tickets", 55_001);
    await repo.setServiceCard(ticket.id, "open_tickets", 55_002);
    expect(await repo.getServiceCard(ticket.id, "open_tickets")).toBe(55_002);
  });

  it("service cards are deleted via cascade when ticket is deleted", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    await repo.setServiceCard(ticket.id, "closed_tickets", 77_001);

    // Delete via cascade by removing the user (which cascades to tickets → service_cards).
    await pool.query("delete from users where id = $1", [user.id]);

    // Confirm no orphan rows.
    const result = await pool.query("select * from service_cards where ticket_id = $1", [ticket.id]);
    expect(result.rowCount).toBe(0);
  });

  it("setTicketStatus does not update a closed ticket", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    await repo.closeTicket(ticket.id);
    const result = await repo.setTicketStatus(ticket.id, "in_review");
    expect(result).toBeNull();

    // DB must still show closed.
    const found = await repo.findTicketById(ticket.id);
    expect(found?.status).toBe("closed");
  });

  it("setTicketStatus returns null on same-status update (no-op)", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");
    // Ticket is already open — setting open again must return null.
    const result = await repo.setTicketStatus(ticket.id, "open");
    expect(result).toBeNull();
    // DB status must be unchanged.
    const found = await repo.findTicketById(ticket.id);
    expect(found?.status).toBe("open");
  });

  it("clearServiceSetup removes service_topics but preserves service_cards", async () => {
    const user = await seedUser();
    const ticket = await repo.createTicket(user.id, "question");

    await pool.query(
      "insert into service_topics(kind, message_thread_id) values ('open_tickets', 99999) on conflict (kind) do update set message_thread_id = excluded.message_thread_id"
    );
    await repo.setServiceCard(ticket.id, "open_tickets", 88_001);

    await repo.clearServiceSetup();

    const topics = await pool.query("select * from service_topics");
    expect(topics.rowCount).toBe(0);

    // service_cards must survive — bot needs them to update/delete ticket cards later.
    const cards = await pool.query("select * from service_cards where ticket_id = $1", [ticket.id]);
    expect(cards.rowCount).toBe(1);
  });

  it("full ticket lifecycle: open → in_review → closed → reopen → close", async () => {
    const user = await seedUser();

    const ticket = await repo.createTicket(user.id, "question");
    expect((await repo.getActiveTicket(user.id))?.status).toBe("open");

    await repo.setTicketStatus(ticket.id, "in_review");
    expect((await repo.getActiveTicket(user.id))?.status).toBe("in_review");

    await repo.closeTicket(ticket.id);
    expect(await repo.getActiveTicket(user.id)).toBeNull();

    await repo.reopenTicket(ticket.id);
    expect((await repo.getActiveTicket(user.id))?.status).toBe("open");

    const final = await repo.closeTicket(ticket.id);
    expect(final?.status).toBe("closed");
    expect(await repo.getActiveTicket(user.id)).toBeNull();
  });
});

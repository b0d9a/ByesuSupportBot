import type { DbClient } from "./db.js";
import { generateTicketCode } from "./ticketCode.js";
import type { ServiceTopicKind, TicketStatus, TelegramUserInput, TicketRecord, UserRecord, UserStats, UserThreadRecord } from "./types.js";

function toNumber(value: unknown): number {
  return Number(value);
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: toNumber(row.id),
    telegramUserId: toNumber(row.telegram_user_id),
    username: row.username as string | null,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    languageCode: row.language_code as string | null,
    firstSeenAt: row.first_seen_at as Date,
    lastSeenAt: row.last_seen_at as Date
  };
}

function mapThread(row: Record<string, unknown>): UserThreadRecord {
  return {
    id: toNumber(row.id),
    userId: toNumber(row.user_id),
    messageThreadId: toNumber(row.message_thread_id),
    pinnedMessageId: row.pinned_message_id === null ? null : toNumber(row.pinned_message_id),
    topicTitle: row.topic_title as string,
    isClosed: Boolean(row.is_closed)
  };
}

function mapTicket(row: Record<string, unknown>): TicketRecord {
  return {
    id: toNumber(row.id),
    publicCode: row.public_code as string,
    userId: toNumber(row.user_id),
    category: row.category as string,
    status: row.status as TicketStatus,
    openedAt: row.opened_at as Date,
    closedAt: row.closed_at as Date | null
  };
}

export class SupportRepository {
  constructor(private readonly db: DbClient) {}

  async upsertUser(input: TelegramUserInput): Promise<UserRecord> {
    const result = await this.db.query(
      `
        insert into users(telegram_user_id, username, first_name, last_name, language_code)
        values ($1, $2, $3, $4, $5)
        on conflict (telegram_user_id) do update set
          username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          language_code = excluded.language_code,
          last_seen_at = now()
        returning *
      `,
      [input.id, input.username ?? null, input.first_name ?? null, input.last_name ?? null, input.language_code ?? null]
    );
    return mapUser(result.rows[0]);
  }

  async findUserById(id: number): Promise<UserRecord | null> {
    const result = await this.db.query("select * from users where id = $1", [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserByTelegramId(telegramUserId: number): Promise<UserRecord | null> {
    const result = await this.db.query("select * from users where telegram_user_id = $1", [telegramUserId]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async getSelectedCategory(telegramUserId: number): Promise<string | null> {
    const result = await this.db.query("select selected_category from user_states where telegram_user_id = $1", [telegramUserId]);
    return (result.rows[0]?.selected_category as string | undefined) ?? null;
  }

  async setSelectedCategory(telegramUserId: number, category: string): Promise<void> {
    await this.db.query(
      `
        insert into user_states(telegram_user_id, selected_category)
        values ($1, $2)
        on conflict (telegram_user_id) do update set
          selected_category = excluded.selected_category,
          updated_at = now()
      `,
      [telegramUserId, category]
    );
  }

  async clearSelectedCategory(telegramUserId: number): Promise<void> {
    await this.db.query("delete from user_states where telegram_user_id = $1", [telegramUserId]);
  }

  async findThreadByUserId(userId: number): Promise<UserThreadRecord | null> {
    const result = await this.db.query("select * from user_threads where user_id = $1", [userId]);
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async findThreadByMessageThreadId(messageThreadId: number): Promise<UserThreadRecord | null> {
    const result = await this.db.query("select * from user_threads where message_thread_id = $1", [messageThreadId]);
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async createThread(userId: number, messageThreadId: number, title: string): Promise<UserThreadRecord> {
    const result = await this.db.query(
      `
        insert into user_threads(user_id, message_thread_id, topic_title, is_closed)
        values ($1, $2, $3, false)
        returning *
      `,
      [userId, messageThreadId, title]
    );
    return mapThread(result.rows[0]);
  }

  async updateThread(threadId: number, values: { title?: string; pinnedMessageId?: number | null; isClosed?: boolean }): Promise<UserThreadRecord> {
    const result = await this.db.query(
      `
        update user_threads set
          topic_title = coalesce($2, topic_title),
          pinned_message_id = coalesce($3, pinned_message_id),
          is_closed = coalesce($4, is_closed),
          updated_at = now()
        where id = $1
        returning *
      `,
      [threadId, values.title ?? null, values.pinnedMessageId ?? null, values.isClosed ?? null]
    );
    return mapThread(result.rows[0]);
  }

  async createTicket(userId: number, category: string): Promise<TicketRecord> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const result = await this.db.query(
          "insert into tickets(public_code, user_id, category, status) values ($1, $2, $3, 'open') returning *",
          [generateTicketCode(), userId, category]
        );
        return mapTicket(result.rows[0]);
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") {
          throw error;
        }
      }
    }

    throw new Error("Failed to generate a unique ticket code");
  }

  async getActiveTicket(userId: number): Promise<TicketRecord | null> {
    const result = await this.db.query(
      "select * from tickets where user_id = $1 and status in ('open', 'in_review') order by opened_at desc limit 1",
      [userId]
    );
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async findTicketById(ticketId: number): Promise<TicketRecord | null> {
    const result = await this.db.query("select * from tickets where id = $1", [ticketId]);
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async closeTicket(ticketId: number): Promise<TicketRecord | null> {
    const result = await this.db.query(
      "update tickets set status = 'closed', closed_at = now() where id = $1 and status in ('open', 'in_review') returning *",
      [ticketId]
    );
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async setTicketStatus(ticketId: number, status: TicketStatus): Promise<TicketRecord | null> {
    const result = await this.db.query(
      "update tickets set status = $2 where id = $1 returning *",
      [ticketId, status]
    );
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async reopenTicket(ticketId: number): Promise<TicketRecord | null> {
    const result = await this.db.query(
      "update tickets set status = 'open', closed_at = null where id = $1 and status = 'closed' returning *",
      [ticketId]
    );
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async updateTicketCategory(ticketId: number, category: string): Promise<TicketRecord | null> {
    const result = await this.db.query("update tickets set category = $2 where id = $1 returning *", [ticketId, category]);
    return result.rows[0] ? mapTicket(result.rows[0]) : null;
  }

  async statsForUser(userId: number): Promise<UserStats> {
    const result = await this.db.query(
      `
        select
          count(*) filter (where status in ('open', 'in_review'))::int as open_count,
          count(*) filter (where status = 'closed')::int as closed_count
        from tickets
        where user_id = $1
      `,
      [userId]
    );
    return {
      openCount: toNumber(result.rows[0].open_count),
      closedCount: toNumber(result.rows[0].closed_count)
    };
  }

  async setServiceTopic(kind: ServiceTopicKind, messageThreadId: number): Promise<void> {
    await this.db.query(
      `
        insert into service_topics(kind, message_thread_id)
        values ($1, $2)
        on conflict (kind) do update set
          message_thread_id = excluded.message_thread_id,
          updated_at = now()
      `,
      [kind, messageThreadId]
    );
  }

  async getServiceTopic(kind: ServiceTopicKind): Promise<number | null> {
    const result = await this.db.query("select message_thread_id from service_topics where kind = $1", [kind]);
    return result.rows[0] ? toNumber(result.rows[0].message_thread_id) : null;
  }

  async setServiceCard(ticketId: number, kind: "open_tickets" | "closed_tickets", messageId: number): Promise<void> {
    await this.db.query(
      `
        insert into service_cards(ticket_id, kind, message_id)
        values ($1, $2, $3)
        on conflict (ticket_id, kind) do update set
          message_id = excluded.message_id,
          updated_at = now()
      `,
      [ticketId, kind, messageId]
    );
  }

  async getServiceCard(ticketId: number, kind: "open_tickets" | "closed_tickets"): Promise<number | null> {
    const result = await this.db.query("select message_id from service_cards where ticket_id = $1 and kind = $2", [ticketId, kind]);
    return result.rows[0] ? toNumber(result.rows[0].message_id) : null;
  }

  async deleteServiceCard(ticketId: number, kind: "open_tickets" | "closed_tickets"): Promise<void> {
    await this.db.query("delete from service_cards where ticket_id = $1 and kind = $2", [ticketId, kind]);
  }

  async addMessageLink(input: {
    ticketId: number | null;
    userId: number | null;
    direction: "user_to_support" | "support_to_user";
    sourceChatId: number;
    sourceMessageId: number;
    targetChatId: number;
    targetMessageId: number;
  }): Promise<void> {
    await this.db.query(
      `
        insert into message_links(ticket_id, user_id, direction, source_chat_id, source_message_id, target_chat_id, target_message_id)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.ticketId,
        input.userId,
        input.direction,
        input.sourceChatId,
        input.sourceMessageId,
        input.targetChatId,
        input.targetMessageId
      ]
    );
  }
}

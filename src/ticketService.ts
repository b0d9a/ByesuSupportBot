import { Markup, type Telegraf } from "telegraf";
import type { AppConfig } from "./config.js";
import { formatTicketCard, formatTopicTitle, formatUserCard, statusEmoji, statusEmojiId, supportTopicUrl } from "./format.js";
import { SupportRepository } from "./repository.js";
import type { TicketRecord, UserRecord, UserThreadRecord } from "./types.js";

export function moderatorTicketKeyboard(
  ticket: TicketRecord,
  supportGroupId: number,
  thread: UserThreadRecord,
  opts: { includeTopicUrl?: boolean } = {}
) {
  const { includeTopicUrl = true } = opts;
  const topicUrlRow = includeTopicUrl
    ? [[Markup.button.url("Открыть топик", supportTopicUrl(supportGroupId, thread.messageThreadId, thread.pinnedMessageId))]]
    : [];

  if (ticket.status === "open") {
    return Markup.inlineKeyboard([
      ...topicUrlRow,
      [
        Markup.button.callback(`${statusEmoji("in_review")} На рассмотрении`, `set_status:${ticket.id}:in_review`),
        Markup.button.callback(`${statusEmoji("closed")} Закрыть`, `close:${ticket.id}`)
      ],
      [Markup.button.callback("Сменить тип", `change_category:${ticket.id}`)]
    ]);
  }

  if (ticket.status === "in_review") {
    return Markup.inlineKeyboard([
      ...topicUrlRow,
      [
        Markup.button.callback(`${statusEmoji("open")} Вернуть в открытые`, `set_status:${ticket.id}:open`),
        Markup.button.callback(`${statusEmoji("closed")} Закрыть`, `close:${ticket.id}`)
      ],
      [Markup.button.callback("Сменить тип", `change_category:${ticket.id}`)]
    ]);
  }

  // closed
  return Markup.inlineKeyboard([
    ...topicUrlRow,
    [Markup.button.callback(`${statusEmoji("open")} Переоткрыть`, `reopen:${ticket.id}`)]
  ]);
}

export function closedTicketKeyboard(ticket: TicketRecord, supportGroupId: number, thread: UserThreadRecord) {
  return Markup.inlineKeyboard([
    [Markup.button.url("Открыть топик", supportTopicUrl(supportGroupId, thread.messageThreadId, thread.pinnedMessageId))],
    [Markup.button.callback("Переоткрыть", `reopen:${ticket.id}`)]
  ]);
}

export async function editForumTopicTitle(bot: Telegraf, config: AppConfig, thread: UserThreadRecord, title: string, iconEmojiId?: string): Promise<void> {
  if (thread.topicTitle === title && !iconEmojiId) {
    return;
  }

  try {
    await bot.telegram.editForumTopic(config.supportGroupId, thread.messageThreadId, {
      name: title,
      ...(iconEmojiId ? { icon_custom_emoji_id: iconEmojiId } : {})
    });
  } catch (error) {
    const description =
      (error as { description?: string }).description ??
      (error as { response?: { description?: string } }).response?.description;
    if (description === "Bad Request: TOPIC_NOT_MODIFIED") {
      return;
    }
    if (iconEmojiId && description === "Bad Request: DOCUMENT_INVALID") {
      try {
        await bot.telegram.editForumTopic(config.supportGroupId, thread.messageThreadId, { name: title });
      } catch (fallbackError) {
        const fallbackDesc =
          (fallbackError as { description?: string }).description ??
          (fallbackError as { response?: { description?: string } }).response?.description;
        if (fallbackDesc !== "Bad Request: TOPIC_NOT_MODIFIED") {
          throw fallbackError;
        }
      }
      return;
    }
    throw error;
  }
}

function isTopicInvalidError(error: unknown): boolean {
  const description =
    (error as { description?: string }).description ??
    (error as { response?: { description?: string } }).response?.description ??
    "";
  return description.includes("TOPIC_ID_INVALID");
}

export async function refreshPinnedCard(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  user: UserRecord,
  ticket: TicketRecord,
  thread: UserThreadRecord
): Promise<UserThreadRecord> {
  const stats = await repo.statsForUser(user.id);
  const text = formatUserCard(user, ticket, stats);

  const keyboard = moderatorTicketKeyboard(ticket, config.supportGroupId, thread, { includeTopicUrl: false });

  if (thread.pinnedMessageId) {
    try {
      await bot.telegram.editMessageText(config.supportGroupId, thread.pinnedMessageId, undefined, text, {
        ...keyboard
      });
      return thread;
    } catch (error) {
      const description =
        (error as { description?: string }).description ??
        (error as { response?: { description?: string } }).response?.description ??
        "";
      if (description.includes("MESSAGE_NOT_MODIFIED")) {
        return thread;
      }
      // Any other error (message deleted, not found, etc.) — send and pin a fresh card below.
    }
  }

  const sent = await bot.telegram.sendMessage(config.supportGroupId, text, {
    message_thread_id: thread.messageThreadId,
    ...keyboard
  });
  await bot.telegram.pinChatMessage(config.supportGroupId, sent.message_id, {
    disable_notification: true
  });
  return repo.updateThread(thread.id, { pinnedMessageId: sent.message_id });
}

export async function postOpenTicketCard(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  user: UserRecord,
  ticket: TicketRecord,
  thread: UserThreadRecord
): Promise<void> {
  const openTopicId = await repo.getServiceTopic("open_tickets");
  if (!openTopicId) {
    return;
  }

  const sent = await bot.telegram.sendMessage(
    config.supportGroupId,
    formatTicketCard(user, ticket, "Активное обращение"),
    {
      message_thread_id: openTopicId,
      ...moderatorTicketKeyboard(ticket, config.supportGroupId, thread)
    }
  );
  await repo.setServiceCard(ticket.id, "open_tickets", sent.message_id);
}

export async function postClosedTicketCard(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  user: UserRecord,
  ticket: TicketRecord,
  thread: UserThreadRecord
): Promise<void> {
  const closedTopicId = await repo.getServiceTopic("closed_tickets");
  if (!closedTopicId) {
    return;
  }

  const sent = await bot.telegram.sendMessage(
    config.supportGroupId,
    formatTicketCard(user, ticket, "Закрытое обращение"),
    {
      message_thread_id: closedTopicId,
      ...closedTicketKeyboard(ticket, config.supportGroupId, thread)
    }
  );
  await repo.setServiceCard(ticket.id, "closed_tickets", sent.message_id);
}

export async function refreshOpenServiceCard(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  user: UserRecord,
  ticket: TicketRecord,
  thread: UserThreadRecord
): Promise<void> {
  const messageId = await repo.getServiceCard(ticket.id, "open_tickets");
  if (!messageId) {
    return;
  }

  try {
    await bot.telegram.editMessageText(
      config.supportGroupId,
      messageId,
      undefined,
      formatTicketCard(user, ticket, "Активное обращение"),
      {
        ...moderatorTicketKeyboard(ticket, config.supportGroupId, thread)
      }
    );
  } catch (error) {
    const description =
      (error as { description?: string }).description ??
      (error as { response?: { description?: string } }).response?.description ??
      "";
    if (description.includes("MESSAGE_NOT_MODIFIED")) {
      return;
    }
    if (description.includes("message to edit not found") || description.includes("message not found")) {
      await repo.deleteServiceCard(ticket.id, "open_tickets");
      return;
    }
    throw error;
  }
}

export async function deleteServiceCardMessage(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  ticket: TicketRecord,
  kind: "open_tickets" | "closed_tickets"
): Promise<void> {
  const messageId = await repo.getServiceCard(ticket.id, kind);
  if (!messageId) {
    return;
  }

  try {
    await bot.telegram.deleteMessage(config.supportGroupId, messageId);
  } catch {
    // The service card may have been deleted manually; remove the stale DB link below.
  }
  await repo.deleteServiceCard(ticket.id, kind);
}

export async function ensureThreadAndTicket(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  user: UserRecord,
  category: string
): Promise<{ ticket: TicketRecord; thread: UserThreadRecord }> {
  let thread = await repo.findThreadByUserId(user.id);

  // Resolve (or create) the Telegram forum topic before writing the DB ticket.
  // This ensures that if topic creation fails, no orphan ticket is left in the DB
  // that would block the user from retrying. A provisional title is used at topic-creation
  // time; the final title (with ticket code) is applied immediately after createTicket.
  if (!thread) {
    const provisionalTitle = formatTopicTitle("??????", category, user);
    const topic = await bot.telegram.createForumTopic(config.supportGroupId, provisionalTitle);
    // If createThread fails here, the Telegram topic is an untracked orphan, but the
    // user is not blocked (no DB ticket exists yet). Operational cleanup only.
    // A unique-constraint violation (23505) means a concurrent request already created
    // the thread — read the winner's record and continue with it.
    try {
      thread = await repo.createThread(user.id, topic.message_thread_id, provisionalTitle);
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") {
        throw error;
      }
      const existing = await repo.findThreadByUserId(user.id);
      if (!existing) {
        throw error;
      }
      thread = existing;
    }
  } else if (thread.isClosed) {
    try {
      await bot.telegram.reopenForumTopic(config.supportGroupId, thread.messageThreadId);
      thread = await repo.updateThread(thread.id, { isClosed: false });
    } catch (error) {
      if (!isTopicInvalidError(error)) {
        throw error;
      }

      const replacementTitle = formatTopicTitle("??????", category, user);
      const topic = await bot.telegram.createForumTopic(config.supportGroupId, replacementTitle);
      thread = await repo.replaceThreadTopic(thread.id, topic.message_thread_id, replacementTitle);
    }
  }

  const ticket = await repo.createTicket(user.id, category);
  await repo.clearSelectedCategory(user.telegramUserId);

  const title = formatTopicTitle(ticket.publicCode, category, user, ticket.status);
  await editForumTopicTitle(bot, config, thread, title, statusEmojiId(ticket.status));
  thread = await repo.updateThread(thread.id, { title, isClosed: false });
  thread = await refreshPinnedCard(bot, repo, config, user, ticket, thread);
  await postOpenTicketCard(bot, repo, config, user, ticket, thread);
  return { ticket, thread };
}

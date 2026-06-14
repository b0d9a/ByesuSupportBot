import pg from "pg";
import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import type { Message } from "telegraf/types";
import { categoryChangeKeyboard, categoryKeyboard, categoryLabel, isCategoryCode } from "./categories.js";
import type { AppConfig } from "./config.js";
import { faqListKeyboard, faqListText, faqSectionKeyboard, findFaqSection, formatFaqSection } from "./faq.js";
import { formatTicketCard, formatTopicTitle } from "./format.js";
import { Logger } from "./logger.js";
import { SupportRepository } from "./repository.js";
import { deleteServiceCardMessage, editForumTopicTitle, ensureThreadAndTicket, moderatorTicketKeyboard, postClosedTicketCard, postOpenTicketCard, refreshOpenServiceCard, refreshPinnedCard } from "./ticketService.js";
import { ticketNumber } from "./ticketCode.js";
import type { ServiceTopicKind, TicketStatus, TelegramUserInput, TicketRecord, UserRecord, UserThreadRecord } from "./types.js";

const RATE_LIMIT_MS = 1000;
const RATE_LIMIT_NOTICE_MS = 10_000;
const RATE_LIMIT_TTL_MS = 60_000;
const lastMessageAt = new Map<number, number>();
const lastNoticeAt = new Map<number, number>();

function pruneRateLimitMaps(): void {
  const cutoff = Date.now() - RATE_LIMIT_TTL_MS;
  for (const [id, ts] of lastMessageAt) {
    if (ts < cutoff) {
      lastMessageAt.delete(id);
      lastNoticeAt.delete(id);
    }
  }
}

setInterval(pruneRateLimitMaps, RATE_LIMIT_TTL_MS).unref();

interface BotDeps {
  pool: pg.Pool;
  config: AppConfig;
  logger: Logger;
}

interface RuntimeDeps extends BotDeps {
  bot: Telegraf;
}

const SERVICE_TOPICS: Array<{ kind: ServiceTopicKind; title: string }> = [
  { kind: "general", title: "Общение" },
  { kind: "announcements", title: "Объявления" },
  { kind: "open_tickets", title: "Открытые обращения" },
  { kind: "closed_tickets", title: "Закрытые обращения" }
];

function telegramUserInput(from: NonNullable<Context["from"]>): TelegramUserInput {
  return {
    id: from.id,
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
    language_code: from.language_code
  };
}

function hasText(message: Message): message is Message.TextMessage {
  return "text" in message;
}

function isCommandMessage(message: Message): boolean {
  return hasText(message) && message.text.startsWith("/");
}

function callbackData(ctx: Context): string | null {
  const query = ctx.callbackQuery;
  if (!query || !("data" in query)) {
    return null;
  }
  return query.data;
}

async function deleteCurrentCallbackMessage(ctx: Context): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // Closing the ticket must stay successful even if Telegram refuses message deletion.
  }
}

async function handlePrivateMessage(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.from || !ctx.message || ctx.chat?.type !== "private") {
    return;
  }

  const telegramUserId = ctx.from.id;

  const now = Date.now();
  const last = lastMessageAt.get(telegramUserId) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    const lastNotice = lastNoticeAt.get(telegramUserId) ?? 0;
    if (now - lastNotice >= RATE_LIMIT_NOTICE_MS) {
      lastNoticeAt.set(telegramUserId, now);
      await ctx.reply("Пожалуйста, не отправляйте сообщения так быстро. Подождите немного и попробуйте снова.");
    }
    return;
  }
  lastMessageAt.set(telegramUserId, now);

  try {
    const repo = new SupportRepository(deps.pool);
    const user = await repo.upsertUser(telegramUserInput(ctx.from));
    let ticket = await repo.getActiveTicket(user.id);
    let thread = await repo.findThreadByUserId(user.id);

    if (!ticket) {
      const selectedCategory = await repo.getSelectedCategory(user.telegramUserId);
      if (!selectedCategory || !isCategoryCode(selectedCategory)) {
        if (selectedCategory) {
          await repo.clearSelectedCategory(user.telegramUserId);
        }
        await ctx.reply("Выберите тип обращения, затем отправьте первое сообщение.", categoryKeyboard());
        return;
      }

      const created = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, selectedCategory);
      ticket = created.ticket;
      thread = created.thread;
      await ctx.reply(`Обращение ${ticketNumber(ticket)} открыто. Мы ответим здесь.`);
    }

    if (!thread) {
      deps.logger.error("Active ticket has no user thread", { ticketId: ticket.id, userId: user.id });
      await ctx.reply("Не удалось найти топик обращения. Сообщение не отправлено, администратор уже видит ошибку в логах.");
      return;
    }

    const copied = await ctx.telegram.copyMessage(deps.config.supportGroupId, ctx.chat.id, ctx.message.message_id, {
      message_thread_id: thread.messageThreadId
    });
    await repo.addMessageLink({
      ticketId: ticket.id,
      userId: user.id,
      direction: "user_to_support",
      sourceChatId: ctx.chat.id,
      sourceMessageId: ctx.message.message_id,
      targetChatId: deps.config.supportGroupId,
      targetMessageId: copied.message_id
    });
  } catch (error) {
    deps.logger.error("handlePrivateMessage failed", {
      operation: "handlePrivateMessage",
      telegramUserId,
      error
    });
    try {
      await ctx.reply("Не удалось обработать сообщение. Попробуйте ещё раз.");
    } catch {
      // If the reply itself fails there is nothing more we can do.
    }
  }
}

async function handleSupportTopicMessage(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.message || !ctx.from || !ctx.chat || ctx.chat.id !== deps.config.supportGroupId) {
    return;
  }
  // /ignore lets moderators write internal notes that are never forwarded.
  // isCommandMessage already covers all /-prefixed messages; this guard
  // makes the intent explicit without changing behavior.
  if (ctx.from.is_bot || isCommandMessage(ctx.message)) {
    return;
  }

  const messageThreadId = ctx.message.message_thread_id;
  if (!messageThreadId) {
    return;
  }

  const repo = new SupportRepository(deps.pool);
  const thread = await repo.findThreadByMessageThreadId(messageThreadId);
  if (!thread) {
    return;
  }

  const user = await repo.findUserById(thread.userId);
  if (!user) {
    return;
  }

  const ticket = await repo.getActiveTicket(user.id);
  if (!ticket) {
    await ctx.reply("У пользователя нет открытого обращения. Нажмите «Переоткрыть» в карточке закрытого обращения или дождитесь нового сообщения пользователя.");
    return;
  }

  try {
    const copied = await ctx.telegram.copyMessage(user.telegramUserId, deps.config.supportGroupId, ctx.message.message_id);
    await repo.addMessageLink({
      ticketId: ticket.id,
      userId: user.id,
      direction: "support_to_user",
      sourceChatId: deps.config.supportGroupId,
      sourceMessageId: ctx.message.message_id,
      targetChatId: user.telegramUserId,
      targetMessageId: copied.message_id
    });
  } catch (error) {
    const isBotBlocked =
      (error as { code?: number }).code === 403 ||
      (error as { response?: { error_code?: number } }).response?.error_code === 403;

    deps.logger.error("handleSupportTopicMessage: failed to copy message to user", {
      operation: "handleSupportTopicMessage",
      telegramUserId: user.telegramUserId,
      ticketId: ticket.id,
      messageThreadId,
      botBlocked: isBotBlocked,
      error
    });

    const replyText = isBotBlocked
      ? "Не удалось доставить ответ пользователю — бот заблокирован."
      : "Ошибка при отправке ответа пользователю. Сообщение не доставлено.";

    try {
      await ctx.reply(replyText);
    } catch {
      // If the reply itself fails there is nothing more we can do.
    }
  }
}

async function setupServiceTopics(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.chat || ctx.chat.id !== deps.config.supportGroupId) {
    await ctx.reply("Команду /setup нужно выполнить в модераторской супергруппе.");
    return;
  }

  const repo = new SupportRepository(deps.pool);
  const created: string[] = [];
  const existing: string[] = [];

  for (const topic of SERVICE_TOPICS) {
    const current = await repo.getServiceTopic(topic.kind);
    if (current) {
      existing.push(`${topic.title}: ${current}`);
      continue;
    }

    const createdTopic = await ctx.telegram.createForumTopic(deps.config.supportGroupId, topic.title);
    await repo.setServiceTopic(topic.kind, createdTopic.message_thread_id);
    created.push(`${topic.title}: ${createdTopic.message_thread_id}`);
  }

  await ctx.reply(["Настройка служебных топиков завершена.", created.length ? `Созданы:\n${created.join("\n")}` : null, existing.length ? `Уже были в БД:\n${existing.join("\n")}` : null].filter(Boolean).join("\n\n"));
}

async function resetServiceTopics(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.chat || ctx.chat.id !== deps.config.supportGroupId) {
    await ctx.reply("Команду /setup_reset нужно выполнить в модераторской супергруппе.");
    return;
  }

  const repo = new SupportRepository(deps.pool);
  await repo.clearServiceSetup();
  await setupServiceTopics(ctx, deps);
}

async function closeTicket(ctx: Context, deps: RuntimeDeps, ticketId: number): Promise<void> {
  const repo = new SupportRepository(deps.pool);
  const ticket = await repo.closeTicket(ticketId);
  if (!ticket) {
    await ctx.answerCbQuery("Обращение уже закрыто или не найдено.");
    return;
  }

  const user = await repo.findUserById(ticket.userId);
  const thread = await repo.findThreadByUserId(ticket.userId);
  if (!user || !thread) {
    await ctx.answerCbQuery("Не удалось найти пользователя или топик.");
    return;
  }

  let updatedThread = await repo.updateThread(thread.id, { isClosed: true });

  try {
    const closedTitle = formatTopicTitle(ticket.publicCode, ticket.category, user, ticket.status);
    await editForumTopicTitle(deps.bot, deps.config, updatedThread, closedTitle);
    updatedThread = await repo.updateThread(updatedThread.id, { title: closedTitle });
    await refreshPinnedCard(deps.bot, repo, deps.config, user, ticket, updatedThread);
    await deleteServiceCardMessage(deps.bot, repo, deps.config, ticket, "open_tickets");
    await deps.bot.telegram.closeForumTopic(deps.config.supportGroupId, thread.messageThreadId);
    await postClosedTicketCard(deps.bot, repo, deps.config, user, ticket, updatedThread);
    await deps.bot.telegram.sendMessage(user.telegramUserId, `Обращение ${ticketNumber(ticket)} закрыто. Если вопрос снова актуален, напишите сюда и выберите тип обращения.`);
    await ctx.answerCbQuery("Обращение закрыто.");
    await deleteCurrentCallbackMessage(ctx);
  } catch (error) {
    // DB is already updated to closed; log that so ops can reconcile if needed.
    deps.logger.error("closeTicket: DB updated but Telegram operations failed", {
      operation: "closeTicket",
      ticketId,
      telegramUserId: user.telegramUserId,
      messageThreadId: thread.messageThreadId,
      dbAlreadyUpdated: true,
      error
    });
    try {
      await ctx.answerCbQuery("Обращение закрыто в БД, но произошла ошибка при обновлении Telegram. Проверьте топик вручную.");
    } catch {
      // answerCbQuery has a 10-second deadline; swallow if it has already expired.
    }
  }
}

async function reopenTicket(ctx: Context, deps: RuntimeDeps, ticketId: number): Promise<void> {
  const repo = new SupportRepository(deps.pool);
  const ticket = await repo.reopenTicket(ticketId);
  if (!ticket) {
    await ctx.answerCbQuery("Обращение уже открыто или не найдено.");
    return;
  }

  const user = await repo.findUserById(ticket.userId);
  let thread = await repo.findThreadByUserId(ticket.userId);
  if (!user || !thread) {
    await ctx.answerCbQuery("Не удалось найти пользователя или топик.");
    return;
  }

  try {
    await deps.bot.telegram.reopenForumTopic(deps.config.supportGroupId, thread.messageThreadId);
    const title = formatTopicTitle(ticket.publicCode, ticket.category, user, ticket.status);
    await editForumTopicTitle(deps.bot, deps.config, thread, title);
    thread = await repo.updateThread(thread.id, { title, isClosed: false });
    thread = await refreshPinnedCard(deps.bot, repo, deps.config, user, ticket, thread);
    await deleteServiceCardMessage(deps.bot, repo, deps.config, ticket, "closed_tickets");
    await postOpenTicketCard(deps.bot, repo, deps.config, user, ticket, thread);
    await deps.bot.telegram.sendMessage(user.telegramUserId, `Обращение ${ticketNumber(ticket)} снова открыто.`);
    await ctx.answerCbQuery("Обращение переоткрыто.");
  } catch (error) {
    // DB is already updated to open; log that so ops can reconcile if needed.
    deps.logger.error("reopenTicket: DB updated but Telegram operations failed", {
      operation: "reopenTicket",
      ticketId,
      telegramUserId: user.telegramUserId,
      messageThreadId: thread.messageThreadId,
      dbAlreadyUpdated: true,
      error
    });
    try {
      await ctx.answerCbQuery("Обращение переоткрыто в БД, но произошла ошибка при обновлении Telegram. Проверьте топик вручную.");
    } catch {
      // answerCbQuery has a 10-second deadline; swallow if it has already expired.
    }
  }
}

async function changeTicketCategory(ctx: Context, deps: RuntimeDeps, ticketId: number, category: string): Promise<void> {
  const repo = new SupportRepository(deps.pool);
  const existing = await repo.findTicketById(ticketId);
  if (!existing) {
    await ctx.answerCbQuery("Обращение не найдено.");
    return;
  }
  if (existing.status === "closed") {
    await ctx.answerCbQuery("Закрытое обращение нельзя изменить.");
    return;
  }
  const ticket = await repo.updateTicketCategory(ticketId, category);
  if (!ticket) {
    await ctx.answerCbQuery("Обращение не найдено.");
    return;
  }

  const user = await repo.findUserById(ticket.userId);
  let thread = await repo.findThreadByUserId(ticket.userId);
  if (!user || !thread) {
    await ctx.answerCbQuery("Не удалось найти пользователя или топик.");
    return;
  }

  try {
    const title = formatTopicTitle(ticket.publicCode, ticket.category, user, ticket.status);
    await editForumTopicTitle(deps.bot, deps.config, thread, title);
    thread = await repo.updateThread(thread.id, { title });
    thread = await refreshPinnedCard(deps.bot, repo, deps.config, user, ticket, thread);
    await refreshOpenServiceCard(deps.bot, repo, deps.config, user, ticket, thread);
    await ctx.editMessageText(formatTicketCard(user, ticket, "Активное обращение"), {
      ...moderatorTicketKeyboard(ticket, deps.config.supportGroupId, thread)
    });
    await ctx.answerCbQuery(`Тип изменен: ${categoryLabel(category)}`);
  } catch (error) {
    deps.logger.error("changeTicketCategory: Telegram operations failed", {
      operation: "changeTicketCategory",
      ticketId,
      telegramUserId: user.telegramUserId,
      messageThreadId: thread.messageThreadId,
      error
    });
    try {
      await ctx.answerCbQuery("Тип изменён в БД, но произошла ошибка при обновлении Telegram. Проверьте топик вручную.");
    } catch {
      // answerCbQuery has a 10-second deadline; swallow if it has already expired.
    }
  }
}

async function setTicketStatus(ctx: Context, deps: RuntimeDeps, ticketId: number, newStatus: TicketStatus): Promise<void> {
  const repo = new SupportRepository(deps.pool);
  const ticket = await repo.setTicketStatus(ticketId, newStatus);
  if (!ticket) {
    await ctx.answerCbQuery("Статус уже актуален или обращение закрыто.");
    return;
  }

  const user = await repo.findUserById(ticket.userId);
  let thread = await repo.findThreadByUserId(ticket.userId);
  if (!user || !thread) {
    await ctx.answerCbQuery("Не удалось найти пользователя или топик.");
    return;
  }

  try {
    const title = formatTopicTitle(ticket.publicCode, ticket.category, user, ticket.status);
    await editForumTopicTitle(deps.bot, deps.config, thread, title);
    thread = await repo.updateThread(thread.id, { title });
    thread = await refreshPinnedCard(deps.bot, repo, deps.config, user, ticket, thread);
    await refreshOpenServiceCard(deps.bot, repo, deps.config, user, ticket, thread);
    const statusText = newStatus === "in_review" ? "На рассмотрении" : "Открыто";
    await ctx.answerCbQuery(`Статус изменён: ${statusText}`);
  } catch (error) {
    deps.logger.error("setTicketStatus: Telegram operations failed", {
      operation: "setTicketStatus",
      ticketId,
      newStatus,
      telegramUserId: user.telegramUserId,
      messageThreadId: thread.messageThreadId,
      error
    });
    try {
      await ctx.answerCbQuery("Статус изменён в БД, но произошла ошибка при обновлении Telegram. Проверьте топик вручную.");
    } catch {
      // answerCbQuery has a 10-second deadline; swallow if it has already expired.
    }
  }
}

export function createBot(deps: BotDeps): Telegraf {
  const bot = new Telegraf(deps.config.botToken);
  const fullDeps = { ...deps, bot };

  bot.start(async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") {
      return;
    }
    const repo = new SupportRepository(deps.pool);
    await repo.upsertUser(telegramUserInput(ctx.from));
    await ctx.reply("Выберите тип обращения.", categoryKeyboard());
  });

  bot.command("setup", async (ctx) => setupServiceTopics(ctx, fullDeps));
  bot.command("setup_reset", async (ctx) => resetServiceTopics(ctx, fullDeps));
  bot.command("faq", async (ctx) => {
    await ctx.reply(faqListText(), faqListKeyboard());
  });

  bot.action(/^category:(.+)$/, async (ctx) => {
    const data = callbackData(ctx);
    const category = data?.split(":")[1];
    if (!category || !isCategoryCode(category) || !ctx.from) {
      await ctx.answerCbQuery("Неизвестный тип обращения.");
      return;
    }

    const repo = new SupportRepository(deps.pool);
    await repo.upsertUser(telegramUserInput(ctx.from));
    await repo.setSelectedCategory(ctx.from.id, category);
    await ctx.answerCbQuery(categoryLabel(category));
    await ctx.reply(`Тип обращения: ${categoryLabel(category)}. Теперь отправьте первое сообщение.`);
  });

  bot.action("faq:list", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(faqListText(), faqListKeyboard());
  });

  bot.action(/^faq:section:(.+)$/, async (ctx) => {
    const sectionId = callbackData(ctx)?.split(":")[2];
    const section = sectionId ? findFaqSection(sectionId) : null;
    if (!section) {
      await ctx.answerCbQuery("Раздел не найден.");
      return;
    }

    await ctx.answerCbQuery(section.title);
    await ctx.editMessageText(formatFaqSection(section), faqSectionKeyboard());
  });

  bot.action(/^close:(\d+)$/, async (ctx) => {
    const ticketId = Number(callbackData(ctx)?.split(":")[1]);
    await closeTicket(ctx, fullDeps, ticketId);
  });

  bot.action(/^reopen:(\d+)$/, async (ctx) => {
    const ticketId = Number(callbackData(ctx)?.split(":")[1]);
    await reopenTicket(ctx, fullDeps, ticketId);
  });

  bot.action(/^change_category:(\d+)$/, async (ctx) => {
    const ticketId = Number(callbackData(ctx)?.split(":")[1]);
    const repo = new SupportRepository(deps.pool);
    const ticket = await repo.findTicketById(ticketId);
    if (!ticket) {
      await ctx.answerCbQuery("Обращение не найдено.");
      return;
    }
    if (ticket.status === "closed") {
      await ctx.answerCbQuery("Закрытое обращение нельзя изменить.");
      return;
    }
    await ctx.answerCbQuery("Выберите новый тип.");
    await ctx.editMessageReplyMarkup(categoryChangeKeyboard(ticketId).reply_markup);
  });

  bot.action(/^set_category:(\d+):(.+)$/, async (ctx) => {
    const [, ticketIdRaw, category] = callbackData(ctx)?.split(":") ?? [];
    if (!ticketIdRaw || !category || !isCategoryCode(category)) {
      await ctx.answerCbQuery("Неизвестный тип обращения.");
      return;
    }
    await changeTicketCategory(ctx, fullDeps, Number(ticketIdRaw), category);
  });

  bot.action(/^set_status:(\d+):(open|in_review)$/, async (ctx) => {
    const parts = callbackData(ctx)?.split(":");
    const ticketId = Number(parts?.[1]);
    const newStatus = parts?.[2] as TicketStatus | undefined;
    if (!ticketId || (newStatus !== "open" && newStatus !== "in_review")) {
      await ctx.answerCbQuery("Неизвестный статус.");
      return;
    }
    await setTicketStatus(ctx, fullDeps, ticketId, newStatus);
  });

  bot.on("message", async (ctx) => {
    if (ctx.chat.type === "private") {
      await handlePrivateMessage(ctx, fullDeps);
      return;
    }

    await handleSupportTopicMessage(ctx, fullDeps);
  });

  bot.catch((error, ctx) => {
    deps.logger.error("Bot update failed", {
      operation: "bot.catch",
      error,
      updateId: ctx.update.update_id
    });
    if (ctx.callbackQuery) {
      ctx.answerCbQuery("Произошла ошибка. Попробуйте ещё раз.").catch(() => {});
    } else {
      ctx.reply("Произошла непредвиденная ошибка. Попробуйте ещё раз.").catch(() => {});
    }
  });

  return bot;
}

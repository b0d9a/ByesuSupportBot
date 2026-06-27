import pg from "pg";
import { Markup, Telegraf } from "telegraf";
import type { Context } from "telegraf";
import type { Message } from "telegraf/types";
import { AiAssistant } from "./ai.js";
import { categoryChangeKeyboard, categoryKeyboard, categoryLabel, isCategoryCode } from "./categories.js";
import type { AppConfig } from "./config.js";
import { faqListKeyboard, faqListText, faqSectionKeyboard, findFaqSection, formatFaqSection } from "./faq.js";
import { mainMenuKeyboard, mainMenuText } from "./menu.js";
import { formatTicketCard, formatTopicTitle, statusEmojiId } from "./format.js";
import { Logger } from "./logger.js";
import { SupportRepository } from "./repository.js";
import { deleteServiceCardMessage, editForumTopicTitle, ensureThreadAndTicket, moderatorTicketKeyboard, postClosedTicketCard, postOpenTicketCard, refreshOpenServiceCard, refreshPinnedCard } from "./ticketService.js";
import { ticketNumber } from "./ticketCode.js";
import type { ServiceTopicKind, TicketStatus, TelegramUserInput, TicketRecord, UserRecord, UserThreadRecord } from "./types.js";
import { RATE_LIMIT_MS, RATE_LIMIT_NOTICE_MS, RATE_LIMIT_TTL_MS, PENDING_QUESTION_TTL_MS, type PendingQuestion, hasText, isCommandMessage, isRateLimited, shouldSendRateLimitNotice, pruneStalePendingQuestions, isAiAnswerUsable, formatModeratorEscalationContext, formatModeratorNewMessageContext } from "./botUtils.js";

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

// Last question the user asked while the AI was answering, kept so the
// "talk to a human" button can forward it to moderators verbatim. In-memory and
// short-lived by design — a forgotten entry just means the user re-sends.
const pendingQuestions = new Map<number, PendingQuestion>();

setInterval(() => pruneStalePendingQuestions(pendingQuestions, Date.now()), PENDING_QUESTION_TTL_MS).unref();

function aiAnswerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Это помогло ✅", "ai:resolved")],
    [Markup.button.callback("Нужен человек 👤", "ai:human")]
  ]);
}

interface BotDeps {
  pool: pg.Pool;
  config: AppConfig;
  logger: Logger;
}

interface RuntimeDeps extends BotDeps {
  bot: Telegraf;
  ai: AiAssistant;
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

function callbackData(ctx: Context): string | null {
  const query = ctx.callbackQuery;
  if (!query || !("data" in query)) {
    return null;
  }
  return query.data;
}

async function answerPrivateOnly(ctx: Context): Promise<boolean> {
  if (ctx.chat?.type === "private") {
    return true;
  }
  await ctx.answerCbQuery("Эта кнопка доступна только в личном чате с ботом.");
  return false;
}

async function deleteCurrentCallbackMessage(ctx: Context): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    // Closing the ticket must stay successful even if Telegram refuses message deletion.
  }
}

async function ensureSupportGroupAdmin(ctx: Context, deps: RuntimeDeps, command: string): Promise<boolean> {
  if (!ctx.chat || ctx.chat.id !== deps.config.supportGroupId) {
    await ctx.reply(`Команду ${command} нужно выполнить в модераторской супергруппе.`);
    return false;
  }

  if (!ctx.from) {
    await ctx.reply("Не удалось проверить права администратора.");
    return false;
  }

  const member = await ctx.telegram.getChatMember(deps.config.supportGroupId, ctx.from.id);
  if (member.status !== "administrator" && member.status !== "creator") {
    await ctx.reply("Эта команда доступна только администраторам группы.");
    return false;
  }

  return true;
}

async function repairStaleThread(
  bot: Telegraf,
  repo: SupportRepository,
  config: AppConfig,
  logger: Logger,
  user: UserRecord,
  ticket: TicketRecord,
  thread: UserThreadRecord
): Promise<UserThreadRecord> {
  const title = formatTopicTitle(ticket.publicCode, ticket.category, user, ticket.status);
  const previousMessageThreadId = thread.messageThreadId;
  const topic = await bot.telegram.createForumTopic(config.supportGroupId, title);
  let updated = await repo.replaceThreadTopic(thread.id, topic.message_thread_id, title);
  await editForumTopicTitle(bot, config, updated, title, statusEmojiId(ticket.status));
  updated = await refreshPinnedCard(bot, repo, config, user, ticket, updated);
  await refreshOpenServiceCard(bot, repo, config, user, ticket, updated);
  logger.warn("Repaired stale support topic", {
    operation: "repairStaleThread",
    ticketId: ticket.id,
    userId: user.id,
    telegramUserId: user.telegramUserId,
    previousMessageThreadId,
    messageThreadId: updated.messageThreadId
  });
  return updated;
}

async function handlePrivateMessage(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.from || !ctx.message || ctx.chat?.type !== "private") {
    return;
  }

  const telegramUserId = ctx.from.id;

  const now = Date.now();
  if (isRateLimited(lastMessageAt, telegramUserId, now)) {
    if (shouldSendRateLimitNotice(lastNoticeAt, telegramUserId, now)) {
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
        await ctx.reply(mainMenuText(), mainMenuKeyboard());
        return;
      }

      // If a pending AI session exists and the user sends a new message instead of
      // clicking a button, treat it as implicit escalation to a human.
      const existingPending = pendingQuestions.get(telegramUserId);
      if (existingPending && hasText(ctx.message) && !isCommandMessage(ctx.message)) {
        const newText = ctx.message.text;
        const { ticket: pendingTicket, thread: pendingThread } = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, selectedCategory);
        const contextMsg = formatModeratorNewMessageContext(existingPending.text, existingPending.aiAnswer, newText);
        const sent = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, contextMsg, {
          message_thread_id: pendingThread.messageThreadId
        });
        pendingQuestions.delete(telegramUserId);
        await repo.addMessageLink({
          ticketId: pendingTicket.id,
          userId: user.id,
          direction: "user_to_support",
          sourceChatId: telegramUserId,
          sourceMessageId: null,
          targetChatId: deps.config.supportGroupId,
          targetMessageId: sent.message_id
        });
        repo.logAiInteraction(user.id, "escalated", existingPending.text.length).catch((err) => {
          deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
        });
        await ctx.reply(`Обращение ${ticketNumber(pendingTicket)} открыто. Сейчас подключится оператор — ответим здесь.`);
        return;
      }

      // AI gate: try to answer from the knowledge base before opening a ticket.
      // Only the very first message of a new conversation reaches here, so the AI
      // never intercepts an ongoing exchange with a human agent. On any doubt the
      // assistant returns confident=false and we fall through to escalation.
      if (deps.ai.enabled && hasText(ctx.message) && !isCommandMessage(ctx.message)) {
        const question = ctx.message.text;
        const aiResult = await deps.ai.tryAnswer(question);
        if (isAiAnswerUsable(aiResult)) {
          // Keep the category selection and remember the question so "talk to a
          // human" can escalate without asking the user to retype it.
          pendingQuestions.set(telegramUserId, { text: question, aiAnswer: aiResult.answer, at: Date.now() });
          repo.logAiInteraction(user.id, "answered", question.length).catch((err) => {
            deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
          });
          await ctx.reply(aiResult.answer, aiAnswerKeyboard());
          return;
        }
        // AI was enabled but not confident — log before falling through to human.
        repo.logAiInteraction(user.id, "not_confident", question.length).catch((err) => {
          deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
        });
      }

      const created = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, selectedCategory);
      ticket = created.ticket;
      thread = created.thread;
      pendingQuestions.delete(telegramUserId);
      await ctx.reply(`Обращение ${ticketNumber(ticket)} открыто. Мы ответим здесь.`);
    }

    if (!thread) {
      deps.logger.error("Active ticket has no user thread", { ticketId: ticket.id, userId: user.id });
      await ctx.reply("Не удалось найти топик обращения. Сообщение не отправлено, администратор уже видит ошибку в логах.");
      return;
    }

    let activeThread = thread;
    let copied: { message_id: number };
    try {
      copied = await ctx.telegram.copyMessage(deps.config.supportGroupId, ctx.chat.id, ctx.message.message_id, {
        message_thread_id: activeThread.messageThreadId
      });
    } catch (copyError) {
      const copyDesc =
        (copyError as { description?: string }).description ??
        (copyError as { response?: { description?: string } }).response?.description ??
        "";
      if (!copyDesc.includes("TOPIC_ID_INVALID")) {
        throw copyError;
      }

      // The stored forum topic no longer exists — create a replacement and retry.
      activeThread = await repairStaleThread(deps.bot, repo, deps.config, deps.logger, user, ticket, activeThread);
      copied = await ctx.telegram.copyMessage(deps.config.supportGroupId, ctx.chat.id, ctx.message.message_id, {
        message_thread_id: activeThread.messageThreadId
      });
    }
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

async function escalateToHuman(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.from || ctx.chat?.type !== "private") {
    return;
  }
  const telegramUserId = ctx.from.id;

  const repo = new SupportRepository(deps.pool);
  const user = await repo.upsertUser(telegramUserInput(ctx.from));

  // If a ticket already exists (e.g. double tap), just confirm — the user's
  // messages are already routed to the topic.
  const existing = await repo.getActiveTicket(user.id);
  if (existing) {
    await ctx.reply(`Обращение ${ticketNumber(existing)} уже открыто. Напишите сюда, и мы продолжим.`);
    return;
  }

  const selectedCategory = await repo.getSelectedCategory(user.telegramUserId);
  if (!selectedCategory || !isCategoryCode(selectedCategory)) {
    await ctx.reply(mainMenuText(), mainMenuKeyboard());
    return;
  }

  // The original question is kept in pendingQuestions only for the lifetime of
  // this process. If the bot restarted after the AI answered (or the 30-min TTL
  // expired), the entry is gone. In that case we ask the user to resend rather
  // than opening a blank ticket that gives the moderator no context.
  const pending = pendingQuestions.get(telegramUserId);
  if (!pending?.text) {
    await ctx.reply("Сессия истекла — пожалуйста, напишите ваш вопрос ещё раз, и мы сразу передадим его оператору.");
    return;
  }

  const { ticket, thread } = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, selectedCategory);

  // Forward the original question and AI answer so the moderator has full context.
  const contextMsg = formatModeratorEscalationContext(pending.text, pending.aiAnswer);
  const sent = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, contextMsg, {
    message_thread_id: thread.messageThreadId
  });
  await repo.addMessageLink({
    ticketId: ticket.id,
    userId: user.id,
    direction: "user_to_support",
    sourceChatId: telegramUserId,
    sourceMessageId: null,
    targetChatId: deps.config.supportGroupId,
    targetMessageId: sent.message_id
  });
  repo.logAiInteraction(user.id, "escalated", pending.text.length).catch((err) => {
    deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
  });
  pendingQuestions.delete(telegramUserId);

  await ctx.reply(`Обращение ${ticketNumber(ticket)} открыто. Сейчас подключится оператор — ответим здесь.`);
}

async function setupServiceTopics(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!(await ensureSupportGroupAdmin(ctx, deps, "/setup"))) {
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
  if (!(await ensureSupportGroupAdmin(ctx, deps, "/setup_reset"))) {
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
    await editForumTopicTitle(deps.bot, deps.config, updatedThread, closedTitle, statusEmojiId(ticket.status));
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
    await editForumTopicTitle(deps.bot, deps.config, thread, title, statusEmojiId(ticket.status));
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
    await editForumTopicTitle(deps.bot, deps.config, thread, title, statusEmojiId(ticket.status));
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

async function setTicketStatus(ctx: Context, deps: RuntimeDeps, ticketId: number, newStatus: "open" | "in_review"): Promise<void> {
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
    await editForumTopicTitle(deps.bot, deps.config, thread, title, statusEmojiId(ticket.status));
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
  const ai = new AiAssistant(deps.config.ai, deps.logger);
  const fullDeps = { ...deps, bot, ai };

  bot.start(async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") {
      return;
    }
    const repo = new SupportRepository(deps.pool);
    await repo.upsertUser(telegramUserInput(ctx.from));
    await ctx.reply(mainMenuText(), mainMenuKeyboard());
  });

  bot.command("setup", async (ctx) => setupServiceTopics(ctx, fullDeps));
  bot.command("setup_reset", async (ctx) => resetServiceTopics(ctx, fullDeps));
  bot.command("faq", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply(faqListText(), faqListKeyboard());
  });
  bot.command("new", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    await ctx.reply("Выберите тип обращения.", categoryKeyboard({ back: true }));
  });

  bot.action("menu:start", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText(mainMenuText(), mainMenuKeyboard());
  });

  bot.action("menu:new_ticket", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText("Выберите тип обращения.", categoryKeyboard({ back: true }));
  });

  bot.action("menu:faq", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText(faqListText(), faqListKeyboard());
  });

  bot.action(/^category:(.+)$/, async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
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
    if (!(await answerPrivateOnly(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText(faqListText(), faqListKeyboard());
  });

  bot.action(/^faq:section:(.+)$/, async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const sectionId = callbackData(ctx)?.split(":")[2];
    const section = sectionId ? findFaqSection(sectionId) : null;
    if (!section) {
      await ctx.answerCbQuery("Раздел не найден.");
      return;
    }

    await ctx.answerCbQuery(section.title);
    await ctx.editMessageText(formatFaqSection(section), faqSectionKeyboard());
  });

  bot.action("ai:resolved", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const pending = ctx.from ? pendingQuestions.get(ctx.from.id) : undefined;
    if (ctx.from) {
      pendingQuestions.delete(ctx.from.id);
    }
    await ctx.answerCbQuery("Рады помочь!");
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply("Отлично! Если появится новый вопрос — просто напишите сюда.");
    if (ctx.from && pending) {
      const repo = new SupportRepository(deps.pool);
      const user = await repo.findUserByTelegramId(ctx.from.id);
      repo.logAiInteraction(user?.id ?? null, "resolved", pending.text.length).catch((err) => {
        deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
      });
    }
  });

  bot.action("ai:human", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    await ctx.answerCbQuery("Подключаем оператора…");
    await ctx.editMessageReplyMarkup(undefined);
    try {
      await escalateToHuman(ctx, fullDeps);
    } catch (error) {
      deps.logger.error("ai:human escalation failed", { operation: "ai:human", error });
      await ctx.reply("Не удалось открыть обращение. Попробуйте написать сообщение ещё раз.");
    }
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

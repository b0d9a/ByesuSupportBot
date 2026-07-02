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
import { RATE_LIMIT_MS, RATE_LIMIT_NOTICE_MS, RATE_LIMIT_TTL_MS, PENDING_QUESTION_TTL_MS, type PendingQuestion, type PendingIntent, type SupportLanguage, hasText, isCommandMessage, isRateLimited, shouldSendRateLimitNotice, pruneStalePendingQuestions, isAiAnswerUsable, isHumanRequest, formatModeratorQuestionMessage, formatModeratorBotAnswerMessage, formatModeratorFollowUpMessage, detectSupportLanguage } from "./botUtils.js";
import { classifySupportIntent, getCodexSetupAnswer, getPaymentAcknowledgment, getProblemAutoAnswer } from "./ticketAutoReply.js";
import type { CategoryCode } from "./categories.js";
import { t, uiLanguageFromTelegram, uiLanguageFromUser, LANGUAGE_SELECTOR_PROMPT } from "./i18n.js";
import { redactSupportText } from "./redaction.js";

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
// Exported for testing only — do not mutate outside tests.
export const pendingQuestions = new Map<number, PendingQuestion>();

setInterval(() => pruneStalePendingQuestions(pendingQuestions, Date.now()), PENDING_QUESTION_TTL_MS).unref();

async function resolveUiLang(pool: pg.Pool, telegramUserId: number, telegramLang?: string | null): Promise<SupportLanguage> {
  const repo = new SupportRepository(pool);
  const override = await repo.getUiLanguageOverride(telegramUserId);
  return uiLanguageFromUser(override, telegramLang);
}

function languageKeyboard(lang: SupportLanguage = "ru") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇷🇺 Русский", "language:ru")],
    [Markup.button.callback("🇬🇧 English", "language:en")],
    [Markup.button.callback("🇨🇳 中文", "language:zh")],
    [Markup.button.callback(t(lang, "btnBack"), "menu:start")]
  ]);
}

// Language selector without a Back button — used for first-time onboarding when
// no main menu has been shown yet.
function languageSelectorKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇷🇺 Русский", "language:ru")],
    [Markup.button.callback("🇬🇧 English", "language:en")],
    [Markup.button.callback("🇨🇳 中文", "language:zh")]
  ]);
}

// Returns null and sends language prompt if the user has no ui_language_override.
// Call at the start of private-message handlers; bail out when null is returned.
async function requireUiLanguage(ctx: Context, pool: pg.Pool, telegramUserId: number): Promise<SupportLanguage | null> {
  const repo = new SupportRepository(pool);
  const override = await repo.getUiLanguageOverride(telegramUserId);
  if (override === "ru" || override === "en" || override === "zh") {
    return override;
  }
  await ctx.reply(LANGUAGE_SELECTOR_PROMPT, languageSelectorKeyboard());
  return null;
}

function aiAnswerKeyboard(lang: SupportLanguage = "ru") {
  const labels: Record<SupportLanguage, [string, string]> = {
    ru: ["Это помогло ✅", "Нужен человек 👤"],
    en: ["This helped ✅", "Need a human 👤"],
    zh: ["已解决 ✅", "需要人工 👤"],
  };
  const [resolved, human] = labels[lang];
  return Markup.inlineKeyboard([
    [Markup.button.callback(resolved, "ai:resolved")],
    [Markup.button.callback(human, "ai:human")]
  ]);
}

function formatSupportBotAnswer(answer: string, lang: SupportLanguage): string {
  const greetings: Record<SupportLanguage, string> = {
    ru: "Здравствуйте, это помощник поддержки ByesuSupportBot.",
    en: "Hello, this is the ByesuSupportBot support assistant.",
    zh: "您好，这里是 ByesuSupportBot 支持助手。",
  };
  return `${greetings[lang]}\n\n${answer}`;
}

interface BotDeps {
  pool: pg.Pool;
  config: AppConfig;
  logger: Logger;
}

export interface RuntimeDeps extends BotDeps {
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

// Sends a deterministic/AI docs answer to the user (wrapped + resolved/human buttons),
// stores the pending session with intent, and records both support_messages with
// ticketId=null. Used by the intent-first routing for problem_401/503, Codex setup,
// AI docs answers, and same-issue follow-up repeats.
async function sendDeterministicAnswer(
  ctx: Context,
  repo: SupportRepository,
  userId: number,
  telegramUserId: number,
  originalQuestionText: string,
  answer: string,
  intent: PendingIntent,
  userMessageId: number | null,
  category?: string
): Promise<void> {
  const lang = detectSupportLanguage(originalQuestionText);
  const wrapped = formatSupportBotAnswer(answer, lang);
  const previous = pendingQuestions.get(telegramUserId);
  pendingQuestions.set(telegramUserId, { text: originalQuestionText, aiAnswer: answer, at: Date.now(), intent, category: category ?? previous?.category });
  const replied = await ctx.reply(wrapped, aiAnswerKeyboard(lang));
  repo.addSupportMessage({ ticketId: null, userId, direction: "user_to_support", senderRole: "user", telegramChatId: telegramUserId, telegramMessageId: userMessageId, text: originalQuestionText, textRedacted: redactSupportText(originalQuestionText) }).catch(() => {});
  repo.addSupportMessage({ ticketId: null, userId, direction: "bot_to_user", senderRole: "bot", telegramChatId: telegramUserId, telegramMessageId: replied.message_id, text: wrapped, textRedacted: redactSupportText(wrapped) }).catch(() => {});
}

// Opens a ticket for a pending session and posts the original question, the bot's
// previous answer, and the new follow-up as three separate moderator messages.
// Used when a pending follow-up escalates (dissatisfaction, human request, or a
// different unresolved issue).
async function escalatePendingWithContext(
  ctx: Context,
  deps: RuntimeDeps,
  repo: SupportRepository,
  user: UserRecord,
  telegramUserId: number,
  uiLang: SupportLanguage,
  category: string,
  pending: PendingQuestion,
  followUpText: string,
  followUpMessageId: number | null
): Promise<void> {
  const { ticket: pendingTicket, thread: pendingThread } = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, category);
  const sentQ = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, formatModeratorQuestionMessage(pending.text), {
    message_thread_id: pendingThread.messageThreadId
  });
  await repo.addMessageLink({
    ticketId: pendingTicket.id,
    userId: user.id,
    direction: "user_to_support",
    sourceChatId: telegramUserId,
    sourceMessageId: null,
    targetChatId: deps.config.supportGroupId,
    targetMessageId: sentQ.message_id
  });
  const sentAnswer = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, formatModeratorBotAnswerMessage(pending.aiAnswer), {
    message_thread_id: pendingThread.messageThreadId
  });
  const sentFollowUp = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, formatModeratorFollowUpMessage(followUpText), {
    message_thread_id: pendingThread.messageThreadId
  });
  pendingQuestions.delete(telegramUserId);
  repo.logAiInteraction(user.id, "escalated", pending.text.length).catch((err) => {
    deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
  });
  repo.addSupportMessage({ ticketId: pendingTicket.id, userId: user.id, direction: "user_to_support", senderRole: "user", telegramChatId: telegramUserId, text: pending.text, textRedacted: redactSupportText(pending.text) }).catch(() => {});
  repo.addSupportMessage({ ticketId: pendingTicket.id, userId: user.id, direction: "bot_to_support", senderRole: "bot", messageThreadId: pendingThread.messageThreadId, telegramChatId: deps.config.supportGroupId, telegramMessageId: sentAnswer.message_id, text: pending.aiAnswer, textRedacted: redactSupportText(pending.aiAnswer) }).catch(() => {});
  repo.addSupportMessage({ ticketId: pendingTicket.id, userId: user.id, direction: "user_to_support", senderRole: "user", telegramChatId: deps.config.supportGroupId, telegramMessageId: sentFollowUp.message_id, messageThreadId: pendingThread.messageThreadId, text: followUpText, textRedacted: redactSupportText(followUpText) }).catch(() => {});
  void followUpMessageId;
  await ctx.reply(t(uiLang, "ticketOpenedOperator", ticketNumber(pendingTicket)));
}

export async function handlePrivateMessage(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.from || !ctx.message || ctx.chat?.type !== "private") {
    return;
  }

  const telegramUserId = ctx.from.id;

  const uiLangOrNull = await requireUiLanguage(ctx, deps.pool, telegramUserId);
  if (!uiLangOrNull) return;
  const uiLang = uiLangOrNull;

  const now = Date.now();
  if (isRateLimited(lastMessageAt, telegramUserId, now)) {
    if (shouldSendRateLimitNotice(lastNoticeAt, telegramUserId, now)) {
      lastNoticeAt.set(telegramUserId, now);
      await ctx.reply(t(uiLang, "rateLimitNotice"));
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
      const rawSelectedCategory = await repo.getSelectedCategory(user.telegramUserId);
      const selectedCategory: CategoryCode | null =
        rawSelectedCategory && isCategoryCode(rawSelectedCategory) ? rawSelectedCategory : null;
      // A stale non-code selection is cleared, but does not by itself block routing.
      if (rawSelectedCategory && !selectedCategory) {
        await repo.clearSelectedCategory(user.telegramUserId);
      }

      // Route by message intent, not by the selected category. The selected
      // category is only fallback metadata for ticket grouping.
      const intent = hasText(ctx.message) && !isCommandMessage(ctx.message)
        ? classifySupportIntent(ctx.message.text)
        : { kind: "unknown" as const, confidence: "low" as const, suggestedCategory: undefined };

      // ----- Pending session: a bot/AI answer is awaiting a button press -----
      const existingPending = pendingQuestions.get(telegramUserId);
      if (existingPending && hasText(ctx.message) && !isCommandMessage(ctx.message)) {
        const newText = ctx.message.text;

        // A follow-up that names a fresh known deterministic issue should be answered
        // before escalating — even if it differs from the previous pending intent.
        // Escalation is reserved for: human-only topics, explicit human requests, or
        // messages the bot has no deterministic answer for (dissatisfaction/unknown).
        const isDeterministic =
          intent.kind === "problem_401" || intent.kind === "problem_503" || intent.kind === "docs_codex_setup";

        if (intent.kind !== "human_only" && !isHumanRequest(newText) && isDeterministic) {
          if (intent.kind === "problem_401" || intent.kind === "problem_503") {
            const problem = getProblemAutoAnswer(newText);
            if (problem.matched) {
              if (intent.suggestedCategory) await repo.setSelectedCategory(telegramUserId, intent.suggestedCategory);
              await sendDeterministicAnswer(ctx, repo, user.id, telegramUserId, newText, problem.text, problem.intent, ctx.message.message_id, intent.suggestedCategory);
              return;
            }
          } else {
            // docs_codex_setup
            const codexAnswer = getCodexSetupAnswer(detectSupportLanguage(newText));
            if (intent.suggestedCategory) await repo.setSelectedCategory(telegramUserId, intent.suggestedCategory);
            await sendDeterministicAnswer(ctx, repo, user.id, telegramUserId, newText, codexAnswer, "docs_codex_setup", ctx.message.message_id, intent.suggestedCategory);
            return;
          }
        }

        // Human-only, explicit human request, dissatisfaction, or an unknown/unresolved
        // follow-up → escalate with full context (original question + bot answer + follow-up).
        const escalationCategory = intent.suggestedCategory ?? existingPending.category ?? selectedCategory ?? "other";
        await escalatePendingWithContext(ctx, deps, repo, user, telegramUserId, uiLang, escalationCategory, existingPending, newText, ctx.message.message_id);
        return;
      }

      // ----- Fresh message: intent-first routing -----

      // Human-only intent always wins: never receives an AI/deterministic answer.
      // Falls through to ticket creation below (with payment acknowledgment).
      if (intent.kind !== "human_only") {
        // Deterministic API error intents (401 / 502 / 503) — answer regardless of category.
        if ((intent.kind === "problem_401" || intent.kind === "problem_503") && hasText(ctx.message)) {
          const question = ctx.message.text;
          const problem = getProblemAutoAnswer(question);
          if (problem.matched) {
            if (intent.suggestedCategory) await repo.setSelectedCategory(telegramUserId, intent.suggestedCategory);
            await sendDeterministicAnswer(ctx, repo, user.id, telegramUserId, question, problem.text, problem.intent, ctx.message.message_id, intent.suggestedCategory);
            return;
          }
        }

        // Deterministic docs/setup intents (Codex setup) — answer regardless of category.
        if (intent.kind === "docs_codex_setup" && hasText(ctx.message)) {
          const question = ctx.message.text;
          const codexAnswer = getCodexSetupAnswer(detectSupportLanguage(question));
          if (intent.suggestedCategory) await repo.setSelectedCategory(telegramUserId, intent.suggestedCategory);
          await sendDeterministicAnswer(ctx, repo, user.id, telegramUserId, question, codexAnswer, "docs_codex_setup", ctx.message.message_id, intent.suggestedCategory);
          return;
        }

        // AI docs-only answer path. Skipped for commands, off-topic, and human-only messages.
        if (deps.ai.enabled && hasText(ctx.message) && !isCommandMessage(ctx.message) && intent.kind !== "off_topic") {
          const question = ctx.message.text;
          const aiResult = await deps.ai.tryAnswer(question);
          if (isAiAnswerUsable(aiResult)) {
            repo.logAiInteraction(user.id, "answered", question.length).catch((err) => {
              deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
            });
            await sendDeterministicAnswer(ctx, repo, user.id, telegramUserId, question, aiResult.answer, "ai_docs", ctx.message.message_id);
            return;
          }
          // AI was enabled but not confident — log before falling through to ticket.
          repo.logAiInteraction(user.id, "not_confident", question.length).catch((err) => {
            deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
          });
        }
      }

      // ----- Ticket creation fallback -----
      // Category preference: suggested by classifier → selected → ask the user.
      const ticketCategory = intent.suggestedCategory ?? selectedCategory;
      if (!ticketCategory) {
        await ctx.reply(mainMenuText(uiLang), mainMenuKeyboard(uiLang));
        return;
      }

      const created = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, ticketCategory);
      ticket = created.ticket;
      thread = created.thread;
      pendingQuestions.delete(telegramUserId);
      const ticketOpenedReply = await ctx.reply(t(uiLang, "ticketOpened", ticketNumber(ticket)));
      if (hasText(ctx.message)) {
        repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "user_to_support", senderRole: "user", telegramChatId: telegramUserId, telegramMessageId: ctx.message.message_id, text: ctx.message.text, textRedacted: redactSupportText(ctx.message.text) }).catch(() => {});
      }
      repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "bot_to_user", senderRole: "system", telegramChatId: telegramUserId, telegramMessageId: ticketOpenedReply.message_id, text: t(uiLang, "ticketOpened", ticketNumber(ticket)), textRedacted: t(uiLang, "ticketOpened", ticketNumber(ticket)) }).catch(() => {});

      if (ticketCategory === "payment") {
        const lang = hasText(ctx.message) ? detectSupportLanguage(ctx.message.text) : "ru";
        const paymentAckText = getPaymentAcknowledgment(lang);
        const paymentAckReply = await ctx.reply(paymentAckText);
        repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "bot_to_user", senderRole: "bot", telegramChatId: telegramUserId, telegramMessageId: paymentAckReply.message_id, text: paymentAckText, textRedacted: paymentAckText }).catch(() => {});
      }
    }

    if (!thread) {
      deps.logger.error("Active ticket has no user thread", { ticketId: ticket.id, userId: user.id });
      await ctx.reply(t(uiLang, "threadMissing"));
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
    if (hasText(ctx.message)) {
      repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "user_to_support", senderRole: "user", telegramChatId: ctx.chat.id, telegramMessageId: ctx.message.message_id, messageThreadId: activeThread.messageThreadId, text: ctx.message.text, textRedacted: redactSupportText(ctx.message.text) }).catch(() => {});
    }
  } catch (error) {
    deps.logger.error("handlePrivateMessage failed", {
      operation: "handlePrivateMessage",
      telegramUserId,
      error
    });
    try {
      await ctx.reply(t(uiLang, "handleError"));
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
    const opText = "text" in ctx.message ? (ctx.message as { text?: string }).text ?? null : null;
    if (opText) {
      repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "support_to_user", senderRole: "operator", telegramChatId: deps.config.supportGroupId, telegramMessageId: ctx.message.message_id, messageThreadId, text: opText, textRedacted: redactSupportText(opText) }).catch(() => {});
    }
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

export async function escalateToHuman(ctx: Context, deps: RuntimeDeps): Promise<void> {
  if (!ctx.from || ctx.chat?.type !== "private") {
    return;
  }
  const telegramUserId = ctx.from.id;

  const repo = new SupportRepository(deps.pool);
  const user = await repo.upsertUser(telegramUserInput(ctx.from));
  const uiLang = uiLanguageFromUser(user.uiLanguageOverride, ctx.from.language_code);

  // If a ticket already exists (e.g. double tap), just confirm — the user's
  // messages are already routed to the topic.
  const existing = await repo.getActiveTicket(user.id);
  if (existing) {
    await ctx.reply(t(uiLang, "ticketAlreadyOpen", ticketNumber(existing)));
    return;
  }

  // The original question is kept in pendingQuestions only for the lifetime of
  // this process. If the bot restarted after the AI answered (or the 30-min TTL
  // expired), the entry is gone. In that case we ask the user to resend rather
  // than opening a blank ticket that gives the moderator no context.
  const pending = pendingQuestions.get(telegramUserId);
  if (!pending?.text) {
    await ctx.reply(t(uiLang, "sessionExpired"));
    return;
  }

  // The user explicitly asked for a human, so we always open a ticket. Category
  // is fallback metadata only: prefer the pending session's category, then the
  // stored selection, then "other" — never dead-end into the main menu here.
  const rawSelectedCategory = await repo.getSelectedCategory(user.telegramUserId);
  const selectedCategory = rawSelectedCategory && isCategoryCode(rawSelectedCategory) ? rawSelectedCategory : null;
  const escalationCategory = pending.category ?? selectedCategory ?? "other";

  const { ticket, thread } = await ensureThreadAndTicket(deps.bot, repo, deps.config, user, escalationCategory);

  // Send original question and bot answer as separate messages so moderators
  // can read them independently.
  const sentQ = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, formatModeratorQuestionMessage(pending.text), {
    message_thread_id: thread.messageThreadId
  });
  await repo.addMessageLink({
    ticketId: ticket.id,
    userId: user.id,
    direction: "user_to_support",
    sourceChatId: telegramUserId,
    sourceMessageId: null,
    targetChatId: deps.config.supportGroupId,
    targetMessageId: sentQ.message_id
  });
  const sentAnswer = await deps.bot.telegram.sendMessage(deps.config.supportGroupId, formatModeratorBotAnswerMessage(pending.aiAnswer), {
    message_thread_id: thread.messageThreadId
  });
  repo.logAiInteraction(user.id, "escalated", pending.text.length).catch((err) => {
    deps.logger.warn("Failed to log AI interaction", { operation: "logAiInteraction", error: err });
  });
  repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "user_to_support", senderRole: "user", telegramChatId: telegramUserId, text: pending.text, textRedacted: redactSupportText(pending.text) }).catch(() => {});
  repo.addSupportMessage({ ticketId: ticket.id, userId: user.id, direction: "bot_to_support", senderRole: "bot", telegramChatId: deps.config.supportGroupId, telegramMessageId: sentAnswer.message_id, messageThreadId: thread.messageThreadId, text: pending.aiAnswer, textRedacted: redactSupportText(pending.aiAnswer) }).catch(() => {});
  pendingQuestions.delete(telegramUserId);

  await ctx.reply(t(uiLang, "ticketOpenedOperator", ticketNumber(ticket)));
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
    pendingQuestions.delete(ctx.from.id);
    const repo = new SupportRepository(deps.pool);
    await repo.upsertUser(telegramUserInput(ctx.from));
    const uiLang = await requireUiLanguage(ctx, deps.pool, ctx.from.id);
    if (!uiLang) return;
    await ctx.reply(mainMenuText(uiLang), mainMenuKeyboard(uiLang));
  });

  bot.command("setup", async (ctx) => setupServiceTopics(ctx, fullDeps));
  bot.command("setup_reset", async (ctx) => resetServiceTopics(ctx, fullDeps));
  bot.command("faq", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const uiLang = await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code);
    await ctx.reply(faqListText(uiLang), faqListKeyboard(uiLang));
  });
  bot.command("new", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    const uiLang = await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code);
    await ctx.reply(t(uiLang, "chooseCategoryPrompt"), categoryKeyboard({ back: true, lang: uiLang }));
  });
  bot.command("language", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    const uiLang = await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code);
    await ctx.reply(t(uiLang, "languagePrompt"), languageKeyboard(uiLang));
  });

  bot.action("menu:start", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    if (ctx.from) pendingQuestions.delete(ctx.from.id);
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery();
    await ctx.editMessageText(mainMenuText(uiLang), mainMenuKeyboard(uiLang));
  });

  bot.action("menu:new_ticket", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    if (ctx.from) pendingQuestions.delete(ctx.from.id);
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery();
    await ctx.editMessageText(t(uiLang, "chooseCategoryPrompt"), categoryKeyboard({ back: true, lang: uiLang }));
  });

  bot.action("menu:faq", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery();
    await ctx.editMessageText(faqListText(uiLang), faqListKeyboard(uiLang));
  });

  bot.action("menu:language", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery();
    await ctx.editMessageText(t(uiLang, "languagePrompt"), languageKeyboard(uiLang));
  });

  bot.action(/^language:(ru|en|zh)$/, async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    if (!ctx.from) return;
    const chosen = callbackData(ctx)?.split(":")[1] as SupportLanguage | undefined;
    if (!chosen) return;
    pendingQuestions.delete(ctx.from.id);
    const repo = new SupportRepository(deps.pool);
    await repo.upsertUser(telegramUserInput(ctx.from));
    await repo.setUiLanguageOverride(ctx.from.id, chosen);
    await ctx.answerCbQuery(t(chosen, "languageChanged"));
    await ctx.editMessageText(mainMenuText(chosen), mainMenuKeyboard(chosen));
  });

  bot.action(/^category:(.+)$/, async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const data = callbackData(ctx);
    const category = data?.split(":")[1];
    if (!category || !isCategoryCode(category) || !ctx.from) {
      await ctx.answerCbQuery("Неизвестный тип обращения.");
      return;
    }

    pendingQuestions.delete(ctx.from.id);
    const repo = new SupportRepository(deps.pool);
    const user = await repo.upsertUser(telegramUserInput(ctx.from));
    const uiLang = uiLanguageFromUser(user.uiLanguageOverride, ctx.from.language_code);
    await repo.setSelectedCategory(ctx.from.id, category);
    await ctx.answerCbQuery(categoryLabel(category, uiLang));
    await ctx.reply(t(uiLang, "categorySelected", categoryLabel(category, uiLang)));
  });

  bot.action("faq:list", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery();
    await ctx.editMessageText(faqListText(uiLang), faqListKeyboard(uiLang));
  });

  bot.action(/^faq:section:(.+)$/, async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    const sectionId = callbackData(ctx)?.split(":")[2];
    const section = sectionId ? findFaqSection(sectionId) : null;
    if (!section) {
      await ctx.answerCbQuery("Раздел не найден.");
      return;
    }

    await ctx.answerCbQuery(section.title);
    await ctx.editMessageText(formatFaqSection(section), faqSectionKeyboard(uiLang));
  });

  bot.action("ai:resolved", async (ctx) => {
    if (!(await answerPrivateOnly(ctx))) return;
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    const pending = ctx.from ? pendingQuestions.get(ctx.from.id) : undefined;
    if (ctx.from) {
      pendingQuestions.delete(ctx.from.id);
    }
    await ctx.answerCbQuery(t(uiLang, "aiResolved"));
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(t(uiLang, "aiResolvedFollowUp"));
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
    const uiLang = ctx.from ? await resolveUiLang(deps.pool, ctx.from.id, ctx.from.language_code) : "ru";
    await ctx.answerCbQuery(t(uiLang, "connectingOperator"));
    await ctx.editMessageReplyMarkup(undefined);
    try {
      await escalateToHuman(ctx, fullDeps);
    } catch (error) {
      deps.logger.error("ai:human escalation failed", { operation: "ai:human", error });
      await ctx.reply(t(uiLang, "escalationFailed"));
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

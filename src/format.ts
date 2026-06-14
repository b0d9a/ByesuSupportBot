import { categoryLabel } from "./categories.js";
import { ticketNumber } from "./ticketCode.js";
import type { TicketRecord, TicketStatus, UserRecord, UserStats } from "./types.js";

export function statusEmoji(status: TicketStatus): string {
  if (status === "open") return "🔴";
  if (status === "in_review") return "🟡";
  return "🟢";
}

export function statusLabel(status: TicketStatus): string {
  if (status === "open") return "открыто";
  if (status === "in_review") return "на рассмотрении";
  return "закрыто";
}

export function displayName(user: Pick<UserRecord, "firstName" | "lastName" | "username" | "telegramUserId">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  if (user.username) {
    return `@${user.username}`;
  }
  return String(user.telegramUserId);
}

export function formatTopicTitle(ticketCode: string, category: string, user: Pick<UserRecord, "username" | "firstName" | "lastName" | "telegramUserId">, status: TicketStatus = "open"): string {
  const suffix = user.username ? `@${user.username}` : displayName(user);
  return `${statusEmoji(status)} #${ticketCode} · ${categoryLabel(category)} · ${suffix}`.slice(0, 128);
}

export function formatUserCard(user: UserRecord, ticket: TicketRecord, stats: UserStats): string {
  const username = user.username ? `@${user.username}` : "не указан";
  const fullName = displayName(user);
  const firstSeen = user.firstSeenAt.toISOString().slice(0, 10);

  return [
    `Пользователь: ${fullName}`,
    `Telegram ID: ${user.telegramUserId}`,
    `Username: ${username}`,
    `Язык: ${user.languageCode ?? "не указан"}`,
    `Первое обращение: ${firstSeen}`,
    `Текущее обращение: ${ticketNumber(ticket)}`,
    `Тип: ${categoryLabel(ticket.category)}`,
    `Статус: ${statusLabel(ticket.status)}`,
    `Открытых: ${stats.openCount}`,
    `Закрытых: ${stats.closedCount}`
  ].join("\n");
}

export function formatTicketCard(user: UserRecord, ticket: TicketRecord, title: string): string {
  return [
    title,
    `Обращение: ${ticketNumber(ticket)}`,
    `Тип: ${categoryLabel(ticket.category)}`,
    `Пользователь: ${displayName(user)}`,
    `Telegram ID: ${user.telegramUserId}`,
    `Username: ${user.username ? `@${user.username}` : "не указан"}`
  ].join("\n");
}

export function supportTopicUrl(supportGroupId: number, messageThreadId: number, messageId?: number | null): string {
  const internalChatId = String(supportGroupId).replace(/^-100/, "");
  const targetMessageId = messageId ?? messageThreadId;
  return `https://t.me/c/${internalChatId}/${targetMessageId}?thread=${messageThreadId}`;
}

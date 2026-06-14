export interface TelegramUserInput {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface UserRecord {
  id: number;
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface UserThreadRecord {
  id: number;
  userId: number;
  messageThreadId: number;
  pinnedMessageId: number | null;
  topicTitle: string;
  isClosed: boolean;
}

export type TicketStatus = "open" | "in_review" | "closed";

export interface TicketRecord {
  id: number;
  publicCode: string;
  userId: number;
  category: string;
  status: TicketStatus;
  openedAt: Date;
  closedAt: Date | null;
}

export type ServiceTopicKind = "general" | "announcements" | "open_tickets" | "closed_tickets";

export interface UserStats {
  openCount: number;
  closedCount: number;
}

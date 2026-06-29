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
  uiLanguageOverride: string | null;
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

export type AiOutcome = "answered" | "resolved" | "escalated" | "not_confident";

export type SupportMessageDirection = "user_to_support" | "support_to_user" | "bot_to_user" | "bot_to_support";
export type SupportMessageSenderRole = "user" | "operator" | "bot" | "system";

export interface SupportMessageRecord {
  id: number;
  ticketId: number | null;
  userId: number | null;
  direction: SupportMessageDirection;
  senderRole: SupportMessageSenderRole;
  telegramChatId: number | null;
  telegramMessageId: number | null;
  messageThreadId: number | null;
  text: string | null;
  textRedacted: string | null;
  hasText: boolean;
  createdAt: Date;
}

export type FaqCandidateStatus = "pending" | "approved" | "rejected";

export interface FaqCandidateRecord {
  id: number;
  sourceTicketId: number | null;
  question: string;
  proposedAnswer: string;
  evidenceMessageIds: number[];
  status: FaqCandidateStatus;
  reviewerNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

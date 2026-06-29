import type { SupportLanguage } from "./botUtils.js";

export const LANGUAGE_SELECTOR_PROMPT = "Выберите язык интерфейса / Choose interface language / 请选择界面语言";

export function uiLanguageFromTelegram(languageCode?: string | null): SupportLanguage {
  if (!languageCode) return "ru";
  if (languageCode.startsWith("zh")) return "zh";
  if (languageCode.startsWith("en")) return "en";
  if (languageCode.startsWith("ru")) return "ru";
  return "ru";
}

export function uiLanguageFromUser(override: string | null | undefined, telegramLang?: string | null): SupportLanguage {
  if (override === "ru" || override === "en" || override === "zh") return override;
  return uiLanguageFromTelegram(telegramLang);
}

const STRINGS = {
  welcome: {
    ru: "Здравствуйте! Чем можем помочь?",
    en: "Hello! How can we help you?",
    zh: "您好！我们能为您提供什么帮助？",
  },
  chooseCategoryPrompt: {
    ru: "Выберите тип обращения.",
    en: "Choose request type.",
    zh: "请选择请求类型。",
  },
  categorySelected: {
    ru: (label: string) => `Тип обращения: ${label}. Теперь отправьте первое сообщение.`,
    en: (label: string) => `Request type: ${label}. Now send the first message.`,
    zh: (label: string) => `请求类型：${label}。请发送第一条消息。`,
  },
  ticketOpened: {
    ru: (num: string) => `Обращение ${num} открыто. Мы ответим здесь.`,
    en: (num: string) => `Ticket ${num} opened. We will reply here.`,
    zh: (num: string) => `工单 ${num} 已创建。我们将在此处回复。`,
  },
  ticketOpenedOperator: {
    ru: (num: string) => `Обращение ${num} открыто. Сейчас подключится оператор — ответим здесь.`,
    en: (num: string) => `Ticket ${num} opened. An operator will connect shortly — we'll reply here.`,
    zh: (num: string) => `工单 ${num} 已创建。操作员即将介入——我们将在此处回复。`,
  },
  sessionExpired: {
    ru: "Сессия истекла — пожалуйста, напишите ваш вопрос ещё раз, и мы сразу передадим его оператору.",
    en: "Session expired — please send your question again and we will forward it to an operator right away.",
    zh: "会话已过期——请重新发送您的问题，我们将立即转交给操作员。",
  },
  ticketAlreadyOpen: {
    ru: (num: string) => `Обращение ${num} уже открыто. Напишите сюда, и мы продолжим.`,
    en: (num: string) => `Ticket ${num} is already open. Write here and we will continue.`,
    zh: (num: string) => `工单 ${num} 已处于开放状态。请在此处发消息，我们将继续处理。`,
  },
  aiResolved: {
    ru: "Рады помочь!",
    en: "Happy to help!",
    zh: "很高兴能帮到您！",
  },
  aiResolvedFollowUp: {
    ru: "Отлично! Если появится новый вопрос — просто напишите сюда.",
    en: "Great! If you have another question, just write here.",
    zh: "太好了！如果有新问题，请直接发消息给我们。",
  },
  connectingOperator: {
    ru: "Подключаем оператора…",
    en: "Connecting an operator…",
    zh: "正在接入操作员……",
  },
  escalationFailed: {
    ru: "Не удалось открыть обращение. Попробуйте написать сообщение ещё раз.",
    en: "Failed to open a ticket. Please try sending your message again.",
    zh: "无法创建工单。请再试一次发送消息。",
  },
  rateLimitNotice: {
    ru: "Пожалуйста, не отправляйте сообщения так быстро. Подождите немного и попробуйте снова.",
    en: "Please don't send messages so fast. Wait a moment and try again.",
    zh: "请不要发送消息太快。请稍等片刻后再试。",
  },
  threadMissing: {
    ru: "Не удалось найти топик обращения. Сообщение не отправлено, администратор уже видит ошибку в логах.",
    en: "Could not find the support topic. Your message was not sent; an administrator has already seen the error in the logs.",
    zh: "找不到支持话题。您的消息未发送，管理员已在日志中看到该错误。",
  },
  handleError: {
    ru: "Не удалось обработать сообщение. Попробуйте ещё раз.",
    en: "Failed to process your message. Please try again.",
    zh: "处理消息失败。请再试一次。",
  },
  // Menu buttons
  btnNewTicket: {
    ru: "Создать обращение",
    en: "Create a ticket",
    zh: "创建工单",
  },
  btnFaq: {
    ru: "FAQ / Частые вопросы",
    en: "FAQ / Common questions",
    zh: "常见问题",
  },
  btnBack: {
    ru: "Назад",
    en: "Back",
    zh: "返回",
  },
  btnBackToFaq: {
    ru: "Назад к FAQ",
    en: "Back to FAQ",
    zh: "返回常见问题",
  },
  faqListPrompt: {
    ru: "Выберите раздел FAQ.",
    en: "Choose an FAQ section.",
    zh: "请选择常见问题类别。",
  },
  languagePrompt: {
    ru: "Выберите язык интерфейса.",
    en: "Choose interface language.",
    zh: "请选择界面语言。",
  },
  languageChanged: {
    ru: "Язык интерфейса изменён.",
    en: "Interface language updated.",
    zh: "界面语言已更新。",
  },
  btnLanguage: {
    ru: "Язык",
    en: "Language",
    zh: "语言",
  },
} as const;

type SimpleKey = {
  [K in keyof typeof STRINGS]: (typeof STRINGS)[K] extends Record<SupportLanguage, string> ? K : never;
}[keyof typeof STRINGS];

type FnKey = {
  [K in keyof typeof STRINGS]: (typeof STRINGS)[K] extends Record<SupportLanguage, (arg: string) => string> ? K : never;
}[keyof typeof STRINGS];

export function t(lang: SupportLanguage, key: SimpleKey): string;
export function t(lang: SupportLanguage, key: FnKey, arg: string): string;
export function t(lang: SupportLanguage, key: keyof typeof STRINGS, arg?: string): string {
  const entry = STRINGS[key] as Record<SupportLanguage, string | ((a: string) => string)>;
  const val = entry[lang] ?? entry["ru"];
  if (typeof val === "function") return val(arg ?? "");
  return val;
}

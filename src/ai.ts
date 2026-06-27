import OpenAI from "openai";
import type { AiConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { KNOWLEDGE_BASE } from "./knowledgeBase.js";

export interface AiAnswer {
  /** True only when the model found a grounded answer in the knowledge base. */
  confident: boolean;
  /** The answer text to show the user. Empty when not confident. */
  answer: string;
}

const NOT_CONFIDENT: AiAnswer = { confident: false, answer: "" };

const SYSTEM_PROMPT = [
  "Ты — ассистент поддержки сервиса Byesu (доступ к ИИ-моделям через API-ключ).",
  "Отвечай ТОЛЬКО на основе базы знаний ниже. Не выдумывай факты, ссылки, цены или команды.",
  "Если ответа нет в базе знаний, либо вопрос требует доступа к аккаунту/платежу/личным данным пользователя,",
  "либо ты не уверен — верни confident=false и пустой answer.",
  "Отвечай кратко, по-русски, в том же тоне, что и база знаний.",
  "",
  "=== ДОКУМЕНТАЦИЯ ===",
  KNOWLEDGE_BASE,
  "=== КОНЕЦ ДОКУМЕНТАЦИИ ==="
].join("\n");

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "support_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        confident: {
          type: "boolean",
          description: "true только если ответ полностью подтверждён базой знаний"
        },
        answer: {
          type: "string",
          description: "ответ пользователю; пустая строка если confident=false"
        }
      },
      required: ["confident", "answer"]
    }
  }
};

const REQUEST_TIMEOUT_MS = 20_000;

export class AiAssistant {
  private readonly client: OpenAI | null;

  constructor(
    private readonly config: AiConfig,
    private readonly logger: Logger
  ) {
    this.client = config.enabled
      ? new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: REQUEST_TIMEOUT_MS })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Attempts to answer a user question from the knowledge base.
   * Any failure (disabled, timeout, bad response, API error) resolves to
   * NOT_CONFIDENT so the caller always falls back to a human agent.
   */
  async tryAnswer(question: string): Promise<AiAnswer> {
    if (!this.client) {
      return NOT_CONFIDENT;
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: question }
        ],
        response_format: RESPONSE_FORMAT
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        return NOT_CONFIDENT;
      }

      const parsed = JSON.parse(raw) as Partial<AiAnswer>;
      if (parsed.confident === true && typeof parsed.answer === "string" && parsed.answer.trim()) {
        return { confident: true, answer: parsed.answer.trim() };
      }
      return NOT_CONFIDENT;
    } catch (error) {
      this.logger.warn("AI assistant failed, falling back to human agent", {
        operation: "AiAssistant.tryAnswer",
        error
      });
      return NOT_CONFIDENT;
    }
  }
}

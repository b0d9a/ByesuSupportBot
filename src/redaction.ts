// Redacts sensitive data from user-generated text before storing in text_redacted.
// The raw text is always stored in the text column alongside the redacted version.

const SIMPLE_REDACTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // OpenAI / Byesu API keys: sk-...  (16+ chars after prefix)
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  // Telegram bot tokens: 123456789:ABC...
  { pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, replacement: "[REDACTED_BOT_TOKEN]" },
  // Emails
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  // Phone numbers: international format +7/+1/+44... with 10+ digits
  { pattern: /\+\d[\d\s\-().]{9,}\d/g, replacement: "[REDACTED_PHONE]" },
];

// Long hex / tx hashes (32+ hex chars), keep first 4 + last 4 as partial form.
// Handled separately because the replacement uses match groups.
const HEX_PATTERN = /\b(0x)?([0-9A-Fa-f]{32,})\b/g;

export function redactSupportText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SIMPLE_REDACTIONS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(HEX_PATTERN, (_match, prefix: string | undefined, hex: string) => {
    const p = prefix ?? "";
    return `${p}${hex.slice(0, 4)}...[REDACTED]...${hex.slice(-4)}`;
  });
  return result;
}

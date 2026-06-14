import { randomInt } from "node:crypto";

const TICKET_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TICKET_CODE_LENGTH = 6;

export function generateTicketCode(): string {
  let code = "";
  for (let index = 0; index < TICKET_CODE_LENGTH; index += 1) {
    code += TICKET_CODE_ALPHABET[randomInt(TICKET_CODE_ALPHABET.length)];
  }
  return code;
}

export function ticketNumber(ticket: { publicCode: string }): string {
  return `#${ticket.publicCode}`;
}

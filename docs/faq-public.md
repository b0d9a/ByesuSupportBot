# FAQ — Byesu Support

Publication-ready reference version. This FAQ only includes recurring questions from support tickets and
answers that can be given without access to a user's account. Anything that requires checking a payment,
balance, order, or account is routed to a human.

---

## Quick start

**What is Byesu?**
Byesu is a service that provides access to AI models through a unified API gateway. A user creates an
API key, tops up their balance, and connects the key to tools such as Codex CLI, Claude Code, Roo Code,
OpenCode, Cline, Hermes, or Cherry Studio.

---

**How do I get started?**
1. Register in the Byesu console.
2. Top up your balance.
3. Create an API key in the tokens section.
4. Connect the key to the client you want to use.
5. Use the exact model name shown in the console.

---

**Which `base_url` should I use?**
- OpenAI-compatible clients: `https://byesu.com/v1`
- Codex CLI: `https://byesu.com/v1`
- Roo Code / Hermes / Cherry Studio / OpenCode-like clients: `https://byesu.com/v1`
- Claude Code / Anthropic SDK: `https://byesu.com` (without `/v1`)
- Gemini-compatible clients: `https://byesu.com` (without `/v1`)

If a client returns `404`, first check whether it needs `/v1` or not.

---

## Client setup

**How do I set up Codex CLI?**
In `~/.codex/config.toml`, set:

```toml
model = "gpt-5.5"
model_provider = "byesu"
wire_api = "responses"
base_url = "https://byesu.com/v1"
disable_response_storage = true
```

The key is stored in `~/.codex/auth.json` or as an environment variable:

```json
{
  "OPENAI_API_KEY": "sk-..."
}
```

Important: Codex requires `wire_api = "responses"`.

---

**How do I set up Claude Code?**
For Claude Code, use the Anthropic-compatible endpoint without `/v1`:

```powershell
$env:ANTHROPIC_BASE_URL = "https://byesu.com"
$env:ANTHROPIC_API_KEY = "sk-..."
```

If `ANTHROPIC_API_KEY` is not accepted, use `ANTHROPIC_AUTH_TOKEN` instead.

---

**How do I connect OpenCode / Kilo Code / Cline / other OpenAI-compatible clients?**
Set:
- Base URL: `https://byesu.com/v1`
- API key: your `sk-...` key
- Model: the exact model name from the console

If a plain `curl` request succeeds but a specific client hangs or returns `403`, send support the client
name, version, config, and the exact error text.

---

**Codex / Claude Code hangs or "thinks" for a long time. What should I check?**
1. Correct `base_url`.
2. Correct key format.
3. Sufficient balance.
4. VPN/proxy and network settings.
5. Model and token group.

If the service logs show no requests from your key at all, the problem is usually in the local config or
network, not the service.

---

## API errors

**`401 Unauthorized` / `invalid token` / `Incorrect API key`**
The key was not sent, was copied incorrectly, was deleted, or is invalid.

What to do:
1. Copy the key again.
2. Check for extra whitespace.
3. Make sure the key starts with `sk-`.
4. Verify the token in the console.

---

**`403 Forbidden` / `request blocked`**
The key is valid, but the selected model or group may not be available for this key.

What to do:
1. Check the token's group.
2. Check whether the model belongs to that group.
3. Try the same key with a plain `curl` request.
4. If the error only happens in one client, send its name, version, config, and error text.

Some `403` cases require manual review.

---

**`404 Not Found`**
Usually an incorrect endpoint.

Check:
- OpenAI/Codex clients: `https://byesu.com/v1`
- Claude Code: `https://byesu.com` (without `/v1`)
- Codex CLI: `wire_api = "responses"`

---

**`429 Too Many Requests`**
Too many concurrent requests or retries. Reduce client-side concurrency and retry later.

---

**`502 Bad Gateway`, `503 Service Unavailable`, `stream disconnected`, `Selected model is at capacity`**
This looks like temporary unavailability of the model, model group, or upstream channel.

What to try:
1. Wait and retry the request.
2. Switch to a different model or group.
3. Check whether the error only happens in one client.

If the problem persists, open a support ticket with the model, group, client, and exact error text.

---

**`insufficient_balance` / `insufficient_quota`**
The account balance ran out or the token's limit was reached. Top up the balance or check the token's
limit in the console.

---

**`model_not_found`**
Incorrect model name. Copy the exact model ID from the console — case, hyphens, and prefixes like `a/`
all matter.

---

**`no available channels`**
The requested model isn't part of your key's group, or there's temporarily no available channel for
that group.

What to do:
1. Check the token's group.
2. Choose a model from that group.
3. For image/video generation, use a token from the `media/media-gen` group.

---

## Payments and promo codes

**How do I top up my balance?**
1. Go to the top-up page.
2. Enter your Telegram username.
3. Choose an amount.
4. Complete the payment.
5. Receive a promo code.
6. Activate the promo code in the Byesu console.

---

**I paid, but the promo code / access / balance didn't appear. What should I do?**
Contact support and provide:
- Telegram username
- order number
- amount
- approximate payment time
- payment method
- transaction TxID/hash, if paid with cryptocurrency

Card details are not needed — support never asks for them.

---

**My USDT / crypto payment wasn't credited.**
This always requires manual review. Send the order number, amount, network, TxID/hash, and the account
email or username.

---

**The promo code doesn't activate or says "code invalid."**
Make sure you're activating the code on the current Byesu console. If it still isn't accepted, contact
support with your Telegram username, order number, and the code/screenshot (without extra payment
details).

---

## Balance and account

**How do I transfer my balance from the old site to the new one?**
Contact support with your account details on both the old and new site: email, username, or ID. If the
details match, support can verify and process the transfer manually.

---

**My balance disappeared, decreased, or was reset.**
This can't be resolved with an automated reply. Possible causes depend on the account: a transfer,
conversion, inactive-account cleanup, manual correction, or a billing error.

Open a ticket with:
- account email/username
- what the balance was
- what it is now
- when you noticed the change
- a console screenshot, if available

---

**More tokens or money were deducted than expected.**
Check the usage logs in the console. If the usage looks incorrect, open a ticket with your account ID,
the model, the approximate request time, and a usage-log screenshot.

---

## Models and pricing

**Where can I see the list of models and pricing?**
In the Byesu console and on the pricing page. The model name in your client must exactly match the model
ID in the console.

---

**How do I choose a model?**
Use economy groups for low-cost tasks. For stability or complex tasks, choose a more expensive group. If
a specific model is unavailable, try another model from the same group, or create a key for the group you
need.

---

**Why is GPT Plus / Gemini / Claude temporarily not working?**
A specific model group can occasionally be unstable or temporarily disabled. Try another group or wait
for it to recover. If it's urgent, open a support ticket.

---

**Are there subscriptions?**
If subscriptions aren't available in the current interface, the balance model is used: top up and pay for
actual usage.

---

## What always goes to a human

These topics should never be closed with an automated reply:
- payment went through, but the balance/code didn't appear
- USDT/crypto payment not credited
- balance disappeared, was reset, or converted incorrectly
- balance transfer between the old and new site
- refunds
- partnership, referral terms, test balance
- custom limits, discounts, and B2B traffic
- purchase of individual accounts or subscriptions
- any question that requires looking at the account, order, or internal logs

---

## Support

**How do I contact support?**
Message `@byesu_support_bot`, choose a ticket type, and describe your issue.

For API issues, include:
- client
- model
- key group/type
- exact error text
- whether you're using a VPN/proxy
- config (without the API key)

For payments, include:
- Telegram username
- order number
- amount
- approximate payment time
- TxID/hash, if paid with cryptocurrency

Never send API keys, card details, or unnecessary personal data.

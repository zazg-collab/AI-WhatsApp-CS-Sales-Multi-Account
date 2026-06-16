# Operator Guide — new capabilities & safe rollout

Covers the features added on top of the base PRD build and how to roll them out
safely. Read the "Go-live checklist" before turning on AI for real customers.

## New environment variables

All are optional with safe defaults; set them deliberately in production.

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_ENCRYPTION_KEY` | _(unset → plaintext)_ | **Set this in prod.** Encrypts external product-source credentials (DB connection strings, Google service-account keys) at rest with AES-256-GCM. Use a long random value (e.g. `openssl rand -base64 48`). Rotating it makes existing encrypted sources unreadable — re-enter them after a rotation. |
| `AI_MINING_MODEL` | _(uses `AI_MODEL`)_ | Optional cheaper model for batch **AI Learning** mining (it runs many calls and isn't latency-sensitive). |
| `AI_JSON_STRICT` | `false` | Set `true` for clean-JSON models (Claude/GPT/Gemini) to shrink mining output budgets. Leave `false` for reasoning models (minimax/deepseek-r1) to avoid truncation. |
| `ASSET_AUTOSEND_ENABLED` | `false` | Global kill-switch for the bot auto-sending media assets. **Keep off** until you trust the trigger keywords. |

## Product stock (so the bot answers availability from real data)

Manage at **/products**. The bot injects the products relevant to a customer's
question into its prompt and answers stock/price from that data only (never
fabricated). Sync from any of:

1. **CSV upload** — export your sheet, upload it. Columns: `sku, nama/name, harga/price, stok/stock, kategori, unit` (ID/EN aliases, messy cells like "Rp 1.250.000"/"12 pcs" are tolerated). Upserts by SKU.
2. **Google Sheet (public CSV link)** — File → Share → Publish to web → CSV; paste the URL. Re-syncable.
3. **Google Sheet (API, private)** — create a Google Cloud service account, enable the Sheets API, **share the sheet with the service-account email (Viewer)**, then enter spreadsheet id + range + service-account email + private key. First row = headers.
4. **Database (Postgres/Supabase, read-only)** — paste a connection string + a **read-only `SELECT`** that returns the product columns. The query runs in a `READ ONLY` transaction (writes/DDL rejected) with timeouts and a row cap. TLS certificates are validated by default — only add `sslmode=no-verify` if your DB uses a self-signed cert.

> Credentials (connection strings, private keys) are masked in the UI/API and, with `SECRET_ENCRYPTION_KEY` set, encrypted at rest.

## Media library (brochures, products, testimonials)

Manage at **/assets**. Upload files, tag them with a `purpose` and trigger
keywords. Then:

- **Manual send** — pick an asset from the inbox composer's library button.
- **Suggestions** — when a customer's message matches an asset's trigger
  keywords (or sounds hesitant, for testimonials), the inbox shows a one-click
  "Suggested: send …" chip.
- **Auto-send** (off by default) — to let the bot send a whitelisted asset
  automatically under `ai_on`: set `ASSET_AUTOSEND_ENABLED=true` **and** mark the
  specific asset `auto-send` with tight trigger keywords. It never sends the same
  asset twice in a conversation.

## AI Learning (mine knowledge/persona/playbook/memory from history)

At **/learning**: pick a bot, "Pelajari dari Riwayat". It mines drafts from
already-synced chat history; **everything is a draft for owner approval** —
nothing goes live until you approve it. A re-run skips conversations with no new
messages.

## Go-live checklist

1. Set `SECRET_ENCRYPTION_KEY` (and your AI provider envs). Leave
   `ASSET_AUTOSEND_ENABLED` unset.
2. Connect **one** WhatsApp account and configure its bot + persona + knowledge
   base. Assign a product source and confirm a stock question is answered
   correctly in the inbox draft.
3. Run the account in **AI Draft** mode first (admins approve each reply) before
   switching any conversation to **AI ON**.
4. Use **AI Supervised** for sensitive chats so Hermes gates risky replies.
5. Only after replies look good: enable AI ON per conversation, then consider
   auto-send for a couple of safe assets on one account as a pilot.
6. Keep an eye on `/monitoring` (response time, AI quality/fallback, SLA).

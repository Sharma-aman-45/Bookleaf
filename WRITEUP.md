# Approach write-up

## What I prioritised

The brief weights AI integration and architecture highest, and says to protect the core ticket flow first. So I built in this order: a schema and access model I trust, the full ticket lifecycle across both portals, then AI that improves that flow without ever being able to break it.

1. **A ticket must never be lost because of AI.** Tickets are saved and returned before classification runs. If the model is down, slow, rate-limited or returns nonsense, keyword rules classify the ticket and the admin gets a policy template to edit. Every fallback is labelled in the UI so the team knows when to double-check.
2. **Drafts should be accurate, not just polite.** The biggest risk in AI support replies is invented numbers. The server computes the facts (pending royalty, quarter end, payout-by date, whether the ₹1,000 threshold applies) and passes them in, and the prompt forbids inventing anything else. That is what lets a draft say something specific instead of "we'll look into it".
3. **Policy beats probability.** The knowledge base says ISBN errors are high priority. Rather than hoping the model agrees, a deterministic guardrail enforces it after the model answers.
4. **Cost proportional to value.** A small model triages every ticket with no policy text attached. A larger model only runs when an admin opens a ticket, gets only the knowledge-base section for that category, and its output is cached.
5. **Security in depth.** Role checks in the API, and the same rules in Postgres row-level security, because the browser's Realtime connection talks to the database directly.

## Trade-offs I made

- **Next.js API routes instead of a separate backend.** One deployable unit and shared types between UI and API. The cost is less separation than a standalone service, which I offset with a strict layering (route → service → AI/db).
- **Category-scoped knowledge base instead of vector search.** The knowledge base is a few hundred words, so selecting by category is cheaper, deterministic and easy to explain. It would not scale to a large help centre.
- **Refetch on realtime events instead of applying socket payloads.** Slightly more requests, but the API stays the single source of truth and no admin-only field can leak through the socket.
- **Groq's free tier.** Fast and free for an assignment, but model availability changes. The client is OpenAI-compatible, so moving to a paid provider is a configuration change.
- **In-memory rate-limit cooldown.** Simple and effective on one server, but not shared across serverless instances.

## How I would evolve this into a production system

- **Close the loop on quality.** The app already logs admin overrides and whether replies used the AI draft. I would turn those into a labelled evaluation set, measure classification accuracy and "invented fact" rates offline, and gate every prompt or model change on it.
- **Connect real data.** Pull live production stages, per-platform sales and payout records from BookLeaf's systems so drafts can quote the actual stage and transaction, not just book-level totals.
- **Notify authors.** Email or WhatsApp on each admin reply, with a link back to the thread.
- **Operational hardening.** A job queue for classification with retries, a shared rate limiter, structured logging and alerts on AI failure rates, and SLA reports per category.
- **Scale retrieval.** As the help content grows, embed articles and retrieve the most relevant few per ticket, keeping the same grounding rules.
- **Self-service deflection.** Show an AI-suggested answer from the knowledge base while the author is typing a ticket, and let them resolve it themselves for simple policy questions such as payout timing or metadata updates.

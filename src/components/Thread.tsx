import type { TicketMessage } from "@/lib/domain/types";
import { dateTime } from "@/lib/format";

export function Thread({
  original,
  messages,
  viewer,
  freshIds = new Set<string>()
}: {
  original: { authorName: string; body: string; createdAt: string };
  messages: TicketMessage[];
  viewer: "author" | "admin";
  freshIds?: Set<string>;
}) {
  return (
    <div className="thread">
      <article className="msg msg-original">
        <header>
          <strong>{viewer === "author" ? "You" : original.authorName}</strong>
          <span>{dateTime(original.createdAt)}</span>
        </header>
        <div className="msg-body">{original.body}</div>
      </article>
      {messages.map((m) => {
        const mine = m.sender_role === viewer;
        const name =
          m.sender_role === "admin"
            ? viewer === "author"
              ? `${m.sender?.full_name ?? "BookLeaf"} from BookLeaf Support`
              : m.sender?.full_name ?? "BookLeaf"
            : viewer === "author"
              ? "You"
              : original.authorName;
        return (
          <article
            key={m.id}
            className={`msg ${m.sender_role === "admin" ? "msg-admin" : "msg-author"} ${freshIds.has(m.id) ? "msg-new" : ""}`}
            aria-label={mine ? "Your message" : "Reply"}
          >
            <header>
              <strong>{name}</strong>
              <span>{dateTime(m.created_at)}</span>
              {viewer === "admin" && m.ai_assisted && <span className="source-chip">AI-assisted</span>}
            </header>
            <div className="msg-body">{m.body}</div>
          </article>
        );
      })}
    </div>
  );
}

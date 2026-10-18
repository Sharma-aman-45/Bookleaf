"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase/browser";

interface Subscription {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
}

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export function useRealtime(
  key: string | null,
  subscriptions: Subscription[],
  onChange: (payload: Payload) => void,
  fallbackPollMs = 20000
) {
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const handler = useRef(onChange);
  handler.current = onChange;
  const subsKey = JSON.stringify(subscriptions);

  useEffect(() => {
    if (!key) return;
    const supabase = browserClient();
    let channel = supabase.channel(`rt:${key}`);
    for (const sub of JSON.parse(subsKey) as Subscription[]) {
      channel = channel.on(
        "postgres_changes" as never,
        { event: sub.event ?? "*", schema: "public", table: sub.table, ...(sub.filter ? { filter: sub.filter } : {}) },
        (payload: Payload) => handler.current(payload)
      );
    }
    channel.subscribe((status) => {
      liveRef.current = status === "SUBSCRIBED";
      setLive(liveRef.current);
    });

    const poll = setInterval(() => {
      if (!liveRef.current && document.visibilityState === "visible") handler.current({} as Payload);
    }, fallbackPollMs);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [key, subsKey, fallbackPollMs]);

  return live;
}

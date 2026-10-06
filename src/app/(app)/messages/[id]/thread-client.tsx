"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { sendMessage } from "@/server/actions/messages";

/** Polls for new messages while the tab is visible. */
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessage.bind(null, conversationId), undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }, [state?.ok]);

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight });
  }, []);

  return (
    <form ref={formRef} action={action} className="composer">
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        name="body"
        className="textarea"
        placeholder="Write a message…"
        maxLength={2000}
        required
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <SubmitButton className="btn btn-dark" pendingLabel="…">
        Send
      </SubmitButton>
      {state?.error && <span className="field-error">{state.error}</span>}
    </form>
  );
}

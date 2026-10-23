import { useEffect, useRef, useState } from "react";

import { answerPrompt, subscribePrompt, type PromptRequest } from "../prompt";

export function PromptDialog() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      subscribePrompt((next) => {
        setRequest(next);
        setValue(next?.initial ?? "");
      }),
    [],
  );

  useEffect(() => {
    if (!request) return;
    // Match the native prompt: the current name starts out fully selected.
    inputRef.current?.select();
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        answerPrompt(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    answerPrompt(trimmed);
  };

  return (
    <div className="mv-modal" onMouseDown={() => answerPrompt(null)}>
      <div className="mv-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mv-modal-title">{request.title}</div>
        <input
          className="mv-modal-input"
          autoFocus
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="mv-modal-actions">
          <button className="mv-btn" onClick={() => answerPrompt(null)}>
            Cancel
          </button>
          <button className="mv-btn primary" onClick={submit}>
            {request.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

import {
  toast,
  type ChoiceItem,
  type ConfirmItem,
  type ToastItem,
} from "../toast";

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirms, setConfirms] = useState<ConfirmItem[]>([]);
  const [choices, setChoices] = useState<ChoiceItem[]>([]);

  useEffect(
    () =>
      toast.subscribe((state) => {
        setToasts(state.toasts);
        setConfirms(state.confirms);
        setChoices(state.choices);
      }),
    [],
  );

  return (
    <>
      <div className="toast-container">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`toast toast-${item.kind}${item.visible ? " visible" : ""}`}
            onClick={() => toast.dismiss(item.id)}
          >
            {item.message}
          </div>
        ))}
      </div>
      {confirms.map((item) => (
        <div className="mv-modal" key={item.id}>
          <div className="mv-modal-card">
            <div className="mv-modal-title">Confirm</div>
            <div className="mv-modal-message">{item.message}</div>
            <div className="mv-modal-actions">
              <button
                className="mv-btn"
                onClick={() => toast.answer(item.id, false)}
              >
                {item.cancelText}
              </button>
              <button
                className="mv-btn primary"
                onClick={() => toast.answer(item.id, true)}
              >
                {item.confirmText}
              </button>
            </div>
          </div>
        </div>
      ))}
      {choices.map((item) => (
        <div className="mv-modal" key={item.id}>
          <div className="mv-modal-card">
            <div className="mv-modal-title">Unsaved changes</div>
            <div className="mv-modal-message">{item.message}</div>
            <div className="mv-modal-actions">
              <button
                className="mv-btn"
                onClick={() => toast.answerChoice(item.id, "cancel")}
              >
                {item.cancelText}
              </button>
              <button
                className="mv-btn"
                onClick={() => toast.answerChoice(item.id, "discard")}
              >
                {item.discardText}
              </button>
              <button
                className="mv-btn primary"
                onClick={() => toast.answerChoice(item.id, "save")}
              >
                {item.saveText}
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

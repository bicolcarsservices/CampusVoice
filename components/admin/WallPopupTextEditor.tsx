"use client";

import { useState } from "react";

export default function WallPopupTextEditor({ initialTexts }: { initialTexts: string[] }) {
  const [texts, setTexts] = useState(initialTexts.length ? initialTexts : [""]);

  function updateText(index: number, value: string) {
    setTexts((current) => current.map((text, itemIndex) => itemIndex === index ? value : text));
  }

  function removeText(index: number) {
    setTexts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-3">
      {texts.map((text, index) => (
        <div className="flex items-start gap-2" key={index}>
          <label className="min-w-0 flex-1 text-sm">
            Pop-up text {index + 1}
            <input
              type="text"
              name="texts"
              value={text}
              onChange={(event) => updateText(index, event.target.value)}
              maxLength={180}
              className="input mt-1"
              placeholder="Enter one short pop-up message"
            />
          </label>
          <button
            type="button"
            className="btn-ghost mt-6 shrink-0"
            onClick={() => removeText(index)}
            aria-label={`Remove pop-up text ${index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost"
        disabled={texts.length >= 30}
        onClick={() => setTexts((current) => [...current, ""])}
      >
        + Add another pop-up
      </button>
      <p className="text-xs text-slate-500">Up to 30 pop-up texts; each can be up to 180 characters. Blank entries will be ignored.</p>
    </div>
  );
}

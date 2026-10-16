"use client";

import { useState, type RefObject } from "react";

const emojis = ["😀", "😂", "🥹", "😍", "🥰", "😎", "😭", "😡", "👍", "👎", "👏", "🙌", "🙏", "💜", "❤️", "🔥", "🎉", "✨", "💯", "🤔", "🫶", "😊", "😅", "😴"];

export default function EmojiPicker({ inputRef, label = "Add emoji" }: { inputRef: RefObject<HTMLTextAreaElement>; label?: string }) {
  const [open, setOpen] = useState(false);

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(emoji, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    setOpen(false);
  }

  return (
    <div className="emoji-picker">
      <button type="button" className="chat-tool-button" aria-expanded={open} aria-label={label} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">☺</span><span>{label}</span>
      </button>
      {open && (
        <div className="emoji-picker-panel" role="group" aria-label="Choose an emoji">
          {emojis.map((emoji) => (
            <button key={emoji} type="button" className="emoji-picker-option" aria-label={emoji} onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

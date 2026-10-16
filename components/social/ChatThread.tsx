"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  sendDirectMessage,
  sendGroupChatMessage,
  toggleMessageReaction,
  unsendDirectMessage,
  unsendGroupChatMessage,
} from "@/server/dating-actions";
import EmojiPicker from "@/components/EmojiPicker";

export type ChatReaction = { emoji: string; user_id: string };

export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  unsent_at: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  reactions: ChatReaction[];
};

function SendButton({ disabled, label }: { disabled?: boolean; label?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending || disabled}>{pending ? "Sending..." : label ?? "Send"}</button>;
}

function UnsendButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="text-xs font-semibold text-slate-500 hover:text-red-700" disabled={pending}>{pending ? "Unsending..." : "Unsend"}</button>;
}

const reactionOptions = ["👍", "❤️", "😂", "😮", "😢", "😡", "👏", "🔥"];

function formatAudioDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function createVoiceWav(chunks: Float32Array[], inputSampleRate: number) {
  const inputLength = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const input = new Float32Array(inputLength);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }

  const sampleRate = 16_000;
  const ratio = inputSampleRate / sampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + outputLength * bytesPerSample);
  const view = new DataView(buffer);
  const writeText = (position: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(position + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + outputLength * bytesPerSample, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, outputLength * bytesPerSample, true);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      sum += input[sampleIndex];
    }
    const sample = end > start ? sum / (end - start) : 0;
    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * bytesPerSample, pcm < 0 ? pcm * 0x8000 : pcm * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function ChatThread({
  recipientId,
  groupId,
  currentUserId,
  messages,
}: {
  recipientId?: string;
  groupId?: string;
  currentUserId: string;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const threadId = groupId ?? recipientId ?? "";
  const isGroup = Boolean(groupId);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const themeImageInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingClockRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const activeAudioRef = useRef(new Set<string>());
  const audioUrlByMessageRef = useRef(new Map<string, string>());
  const [state, action] = useFormState(isGroup ? sendGroupChatMessage : sendDirectMessage, null);
  const [unsendState, unsendAction] = useFormState(isGroup ? unsendGroupChatMessage : unsendDirectMessage, null);
  const [isReacting, startReaction] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [themeColor, setThemeColor] = useState("#f8fafc");
  const [themeImage, setThemeImage] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [messageAudioDurations, setMessageAudioDurations] = useState<Record<string, number>>({});
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`campusvoice-chat-theme:${threadId}`);
      if (!saved) return;
      const theme: unknown = JSON.parse(saved);
      if (typeof theme === "object" && theme !== null && "color" in theme &&
          typeof theme.color === "string" && /^#[0-9a-f]{6}$/i.test(theme.color)) {
        setThemeColor(theme.color);
        if ("image" in theme && typeof theme.image === "string" && theme.image.startsWith("data:image/")) {
          setThemeImage(theme.image);
        }
      }
    } catch (error) {
      console.error("Could not load the saved chat theme.", error);
      setThemeError("Could not load your saved chat theme.");
    }
  }, [threadId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (activeAudioRef.current.size === 0) router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setSelectedImageName("");
      setAudioReady(false);
      setAudioDuration(0);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (unsendState?.success) router.refresh();
  }, [unsendState, router]);

  useEffect(() => () => {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (recordingClockRef.current !== null) window.clearInterval(recordingClockRef.current);
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
  }, []);

  function saveTheme(color: string, image: string | null) {
    setThemeColor(color);
    setThemeImage(image);
    try {
      localStorage.setItem(`campusvoice-chat-theme:${threadId}`, JSON.stringify({ color, image }));
      setThemeError(null);
    } catch (error) {
      console.error("Could not save the chat theme.", error);
      setThemeError("Your browser could not save this theme. Choose a smaller image or remove the image and try again.");
    }
  }

  async function setThemeFromImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setThemeError("Choose an image file for the chat background.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the selected chat background.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      saveTheme(themeColor, canvas.toDataURL("image/jpeg", .72));
    } catch (error) {
      console.error("Could not prepare the chat theme image.", error);
      setThemeError("Could not use that image. Please choose another image.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (themeImageInputRef.current) themeImageInputRef.current.value = "";
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      setRecordingError("Voice recording is not supported in this browser.");
      return;
    }
    try {
      setRecordingError(null);
      if (audioInputRef.current) audioInputRef.current.value = "";
      setAudioReady(false);
      setAudioDuration(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentOutput = audioContext.createGain();
      silentOutput.gain.value = 0;
      processorRef.current = processor;
      audioChunksRef.current = [];
      processor.onaudioprocess = (event) => {
        audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(audioContext.destination);
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingClockRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (startedAt !== null) setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      recordingTimeoutRef.current = window.setTimeout(stopRecording, 120_000);
    } catch (error) {
      console.error("Could not start voice recording.", error);
      setRecordingError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access to record a voice message."
        : "Could not start recording. Please check your microphone and browser audio support.");
      processorRef.current?.disconnect();
      processorRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close();
      }
      audioContextRef.current = null;
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recordingClockRef.current !== null) {
      window.clearInterval(recordingClockRef.current);
      recordingClockRef.current = null;
    }
    const audioContext = audioContextRef.current;
    const processor = processorRef.current;
    if (!audioContext || !processor) return;

    processor.onaudioprocess = null;
    processor.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const sampleCount = audioChunksRef.current.reduce((length, chunk) => length + chunk.length, 0);
    const duration = sampleCount / audioContext.sampleRate;
    const wav = createVoiceWav(audioChunksRef.current, audioContext.sampleRate);
    audioChunksRef.current = [];
    recordingStartedAtRef.current = null;
    void audioContext.close();
    audioContextRef.current = null;

    if (wav.size > 10 * 1024 * 1024) {
      setRecordingError("This voice message is over 10 MB. Record a shorter message.");
      setIsRecording(false);
      return;
    }
    if (wav.size <= 44) {
      setRecordingError("No audio was captured. Please try recording again.");
      setIsRecording(false);
      return;
    }
    const file = new File([wav], "voice-message.wav", { type: "audio/wav" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (audioInputRef.current) audioInputRef.current.files = transfer.files;
    setAudioDuration(duration);
    setRecordingSeconds(Math.floor(duration));
    setAudioReady(true);
    setIsRecording(false);
  }

  function chooseReaction(messageId: string, emoji: string) {
    setReactionError(null);
    startReaction(async () => {
      const result = await toggleMessageReaction(messageId, emoji, threadId, isGroup);
      if (result.error) setReactionError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="chat-thread">
      <details className="chat-theme-settings mb-3">
        <summary className="chat-settings-summary">
          <span aria-hidden="true">⚙</span> Chat settings
        </summary>
        <div className="chat-settings-panel">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Conversation background</p>
          <div className="chat-theme-options">
            {[
              ["#f8fafc", "Default"],
              ["#ecfeff", "Sky"],
              ["#fdf2f8", "Rose"],
              ["#f5f3ff", "Lavender"],
              ["#f0fdf4", "Mint"],
              ["#fff7ed", "Sunset"],
            ].map(([color, label]) => (
              <button key={color} type="button" className={`chat-theme-swatch${themeColor === color && !themeImage ? " chat-theme-swatch-active" : ""}`} style={{ backgroundColor: color }} aria-label={`${label} chat theme`} title={label} onClick={() => saveTheme(color, null)} />
            ))}
            <label className="chat-theme-color">
              <span>Custom color</span>
              <input type="color" value={themeColor} aria-label="Choose chat background color" onChange={(event) => saveTheme(event.target.value, themeImage)} />
            </label>
            <label className="chat-tool-button">
              <span aria-hidden="true">▧</span><span>Background image</span>
              <input ref={themeImageInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => void setThemeFromImage(event.target.files?.[0])} />
            </label>
            {themeImage && <button type="button" className="chat-tool-button" onClick={() => saveTheme(themeColor, null)}>Remove image</button>}
          </div>
          {themeError && <p role="alert" className="mt-2 text-xs text-red-700">{themeError}</p>}
        </div>
      </details>
      <div
        className="chat-message-list flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
        style={{
          backgroundColor: themeColor,
          backgroundImage: themeImage ? `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url("${themeImage}")` : undefined,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        {!messages.length && <p className="text-sm text-slate-500">No messages yet. Say hello.</p>}
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          const unsent = Boolean(message.unsent_at);
          const reactionCounts = new Map<string, { count: number; mine: boolean }>();
          for (const reaction of message.reactions) {
            const current = reactionCounts.get(reaction.emoji) ?? { count: 0, mine: false };
            current.count += 1;
            current.mine ||= reaction.user_id === currentUserId;
            reactionCounts.set(reaction.emoji, current);
          }
          if (message.audioUrl && !audioUrlByMessageRef.current.has(message.id)) {
            audioUrlByMessageRef.current.set(message.id, message.audioUrl);
          }
          const stableAudioUrl = audioUrlByMessageRef.current.get(message.id) ?? null;
          return (
            <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] space-y-1 ${mine ? "text-right" : "text-left"}`}>
                <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"} ${unsent ? "chat-bubble-unsent" : ""}`}>
                  {unsent ? (
                    <p className="italic">This message was unsent</p>
                  ) : (
                    <>
                      {message.imageUrl && (
                        <img src={message.imageUrl} alt="" className="mb-2 max-h-64 rounded-xl object-cover" />
                      )}
                      {stableAudioUrl && (
                        <div className="chat-audio-player">
                          <audio
                            controls
                            preload="metadata"
                            src={stableAudioUrl}
                            onLoadedMetadata={(event) => {
                              const duration = event.currentTarget.duration;
                              if (Number.isFinite(duration)) {
                                setMessageAudioDurations((current) => ({ ...current, [message.id]: duration }));
                              }
                            }}
                            onLoadStart={() => activeAudioRef.current.add(message.id)}
                            onPlay={() => {
                              activeAudioRef.current.add(message.id);
                              setAudioErrors((current) => {
                                if (!current[message.id]) return current;
                                const next = { ...current };
                                delete next[message.id];
                                return next;
                              });
                            }}
                            onPause={(event) => {
                              if (event.currentTarget.currentTime === 0) activeAudioRef.current.delete(message.id);
                            }}
                            onEnded={() => activeAudioRef.current.delete(message.id)}
                            onError={(event) => {
                              activeAudioRef.current.delete(message.id);
                              const errorCode = event.currentTarget.error?.code;
                              setAudioErrors((current) => ({
                                ...current,
                                [message.id]: errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                                  ? "This browser cannot play this voice message. Ask the sender to resend it."
                                  : "Could not load this voice message. Check your connection and try again.",
                              }));
                            }}
                          />
                          {messageAudioDurations[message.id] !== undefined && (
                            <p className="mt-1 text-left text-[11px] opacity-75">
                              Voice message · {formatAudioDuration(messageAudioDurations[message.id])}
                            </p>
                          )}
                          {audioErrors[message.id] && (
                            <p role="alert" className="mt-1 text-xs text-red-700">{audioErrors[message.id]}</p>
                          )}
                        </div>
                      )}
                      {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                    </>
                  )}
                </div>
                {!unsent && (
                  <div className={`chat-message-actions ${mine ? "justify-end" : "justify-start"}`}>
                    {Array.from(reactionCounts.entries()).map(([emoji, reaction]) => (
                      <button key={emoji} type="button" className={`chat-reaction${reaction.mine ? " chat-reaction-active" : ""}`} disabled={isReacting} onClick={() => chooseReaction(message.id, emoji)} aria-label={`${emoji} reaction, ${reaction.count} total`}>
                        {emoji} <span>{reaction.count}</span>
                      </button>
                    ))}
                    <details className="chat-reaction-menu">
                      <summary aria-label="Add or change reaction">☺</summary>
                      <div className="chat-reaction-panel">
                        {reactionOptions.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => chooseReaction(message.id, emoji)} aria-label={`React ${emoji}`}>{emoji}</button>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                <p className="text-[11px] text-slate-500">{new Date(message.created_at).toLocaleString()}</p>
                {mine && !unsent && (
                  <form action={unsendAction}>
                    <input type="hidden" name="message_id" value={message.id} />
                    {groupId && <input type="hidden" name="group_id" value={groupId} />}
                    <UnsendButton />
                  </form>
                )}
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      {reactionError && <p role="alert" className="mt-2 text-sm text-red-700">{reactionError}</p>}
      {unsendState?.error && <p role="alert" className="mt-2 text-sm text-red-700">{unsendState.error}</p>}
      <form ref={formRef} action={action} className="chat-composer mt-4 space-y-3">
        {groupId
          ? <input type="hidden" name="group_id" value={groupId} />
          : <input type="hidden" name="recipient_id" value={recipientId} />}
        <label className="block text-sm">Message
          <textarea ref={messageRef} name="body" maxLength={2000} rows={3} className="input mt-1" placeholder="Write a message" />
        </label>
        <div className="chat-tools">
          <EmojiPicker inputRef={messageRef} />
          <label className="chat-tool-button" title="Add photo">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            <span>Add photo</span>
            <input ref={imageInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setSelectedImageName(event.target.files?.[0]?.name ?? "")} />
          </label>
          <input ref={audioInputRef} name="audio" type="file" accept="audio/wav" className="sr-only" />
          <button type="button" className="chat-tool-button" onClick={isRecording ? stopRecording : () => void startRecording()} aria-pressed={isRecording}>
            <span aria-hidden="true">{isRecording ? "■" : "🎙"}</span>
            <span>{isRecording ? `Stop recording · ${formatAudioDuration(recordingSeconds)}` : "Voice message"}</span>
          </button>
          {isRecording && <span className="chat-selected-image" aria-live="off">Recording {formatAudioDuration(recordingSeconds)}</span>}
          {selectedImageName && <span className="chat-selected-image">{selectedImageName}</span>}
          {audioReady && <span className="chat-selected-image">Voice message ready · {formatAudioDuration(audioDuration)} <button type="button" className="font-bold text-red-700" onClick={() => { if (audioInputRef.current) audioInputRef.current.value = ""; setAudioReady(false); setAudioDuration(0); }}>Remove</button></span>}
        </div>
        {recordingError && <p role="alert" className="text-sm text-red-700">{recordingError}</p>}
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <SendButton disabled={isRecording} label={audioReady ? "Send voice message" : "Send"} />
      </form>
    </div>
  );
}

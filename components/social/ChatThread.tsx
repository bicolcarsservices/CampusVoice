"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  sendDirectMessage,
  sendGroupChatMessage,
  toggleMessageReaction,
  deleteDirectConversation,
  leaveGroupConversation,
  setChatMuted,
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
    for (let index = 0; index < text.length; index += 1) view.setUint8(position + index, text.charCodeAt(index));
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
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) sum += input[sampleIndex];
    const sample = end > start ? sum / (end - start) : 0;
    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * bytesPerSample, pcm < 0 ? pcm * 0x8000 : pcm * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function VoiceMessagePlayer({
  src,
  onPlay,
  onError,
  label = "Voice message",
}: {
  src: string;
  onPlay?: (audio: HTMLAudioElement) => void;
  onError?: () => void;
  label?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const waveform = Array.from({ length: 44 }, (_, index) => {
    const shape = Math.abs(Math.sin(index * 2.17) * Math.cos(index * 0.41));
    const variation = Math.abs(Math.sin(index * 0.73 + 1.2));
    return 16 + Math.round((shape * .68 + variation * .32) * 78);
  });

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      onPlay?.(audio);
      try {
        await audio.play();
      } catch {
        onError?.();
      }
    } else {
      audio.pause();
    }
  }

  return (
    <div className="chat-voice-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={onError}
      />
      <button
        type="button"
        className="chat-voice-play-button"
        onClick={() => void togglePlayback()}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${label.toLocaleLowerCase()}`}
      >
        {isPlaying ? (
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5h3v14H8zM15 5h3v14h-3z" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg>
        )}
      </button>
      <div className="chat-voice-track">
        <div className="chat-voice-waveform" aria-hidden="true">
          <div className="chat-voice-waveform-bars">
            {waveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
          </div>
          <div className="chat-voice-waveform-played" style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}>
            <div className="chat-voice-waveform-bars">
              {waveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
            </div>
          </div>
        </div>
        <input
          className="chat-voice-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          aria-label={`Seek ${label.toLocaleLowerCase()}`}
          disabled={!duration}
          onChange={(event) => {
            const audio = audioRef.current;
            if (!audio) return;
            const nextTime = Number(event.target.value);
            audio.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
        />
        <div className="chat-voice-times" aria-live="off">
          <span>{formatAudioDuration(currentTime)}</span>
          <span>{formatAudioDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ChatThread({
  recipientId,
  groupId,
  currentUserId,
  messages,
  conversationName,
  participantAvatarUrl,
  participantUsername,
  participantHref,
  initialMuted,
  chatSettingsNeedSetup,
}: {
  recipientId?: string;
  groupId?: string;
  currentUserId: string;
  messages: ChatMessage[];
  conversationName: string;
  participantAvatarUrl?: string | null;
  participantUsername?: string | null;
  participantHref?: string;
  initialMuted: boolean;
  chatSettingsNeedSetup: boolean;
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
  const recordingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const recordingSampleRateRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingClockRef = useRef<number | null>(null);
  const activeAudioRef = useRef(new Set<string>());
  const audioUrlByMessageRef = useRef(new Map<string, string>());
  const [state, action] = useFormState(isGroup ? sendGroupChatMessage : sendDirectMessage, null);
  const [unsendState, unsendAction] = useFormState(isGroup ? unsendGroupChatMessage : unsendDirectMessage, null);
  const [isReacting, startReaction] = useTransition();
  const [isUpdatingGroupSettings, startGroupSettingsUpdate] = useTransition();
  const [isUpdatingDirectSettings, setIsUpdatingDirectSettings] = useState(false);
  const isUpdatingSettings = isGroup ? isUpdatingGroupSettings : isUpdatingDirectSettings;
  const messageListRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const settingsPanelRef = useRef<HTMLDetailsElement>(null);
  const [settingsHost, setSettingsHost] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [themeImage, setThemeImage] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [conversationSearch, setConversationSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sharedMediaTab, setSharedMediaTab] = useState<"media" | "files" | "links">("media");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`campusvoice-chat-theme:${threadId}`);
      if (!saved) return;
      const theme: unknown = JSON.parse(saved);
      if (typeof theme === "object" && theme !== null && "color" in theme &&
          (theme.color === null || (typeof theme.color === "string" && /^#[0-9a-f]{6}$/i.test(theme.color)))) {
        if (typeof theme.color === "string") setThemeColor(theme.color);
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
    setIsMuted(initialMuted);
  }, [initialMuted]);

  useEffect(() => {
    const refreshIfNeeded = () => {
      if (document.visibilityState !== "visible" || activeAudioRef.current.size > 0) return;
      router.refresh();
    };
    const timer = window.setInterval(refreshIfNeeded, 30_000);
    document.addEventListener("visibilitychange", refreshIfNeeded);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfNeeded);
    };
  }, [router]);

  useEffect(() => {
    const messageList = messageListRef.current;
    messageList?.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    setSettingsHost(document.getElementById("messenger-header-actions"));
  }, []);

  useEffect(() => {
    function closeSettings(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && settingsPanelRef.current?.contains(event.target as Node)) return;
      if (isGroup) settingsPanelRef.current?.removeAttribute("open");
      else setSettingsOpen(false);
    }

    document.addEventListener("pointerdown", closeSettings);
    document.addEventListener("keydown", closeSettings);
    return () => {
      document.removeEventListener("pointerdown", closeSettings);
      document.removeEventListener("keydown", closeSettings);
    };
  }, [isGroup]);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setSelectedImageName("");
      setImagePreviewUrl(null);
      setAudioReady(false);
      setAudioDuration(0);
      setAudioPreviewUrl(null);
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
    recordingSourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
  }, []);

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  useEffect(() => () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
  }, [audioPreviewUrl]);

  function saveTheme(color: string | null, image: string | null) {
    setThemeColor(color);
    setThemeImage(image);
    try {
      localStorage.setItem(`campusvoice-chat-theme:${threadId}`, JSON.stringify({ color, image }));
      setThemeError(null);
      setSettingsMessage("Conversation appearance saved on this device.");
    } catch (error) {
      console.error("Could not save the chat theme.", error);
      setThemeError("Your browser could not save this theme. Choose a smaller image or remove the image and try again.");
      setSettingsMessage(null);
    }
  }

  function resetTheme() {
    setThemeColor(null);
    setThemeImage(null);
    try {
      localStorage.removeItem(`campusvoice-chat-theme:${threadId}`);
      setThemeError(null);
      setSettingsMessage("Conversation appearance reset to your current app theme.");
    } catch (error) {
      console.error("Could not reset the chat theme.", error);
      setThemeError("Could not reset this conversation’s appearance.");
      setSettingsMessage(null);
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
      setAudioPreviewUrl(null);
      setAudioReady(false);
      setAudioDuration(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      recordingSourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;
      recordingSampleRateRef.current = audioContext.sampleRate;
      audioChunksRef.current = [];
      processor.onaudioprocess = (event) => {
        audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingClockRef.current = window.setInterval(() => {
        const sampleRate = recordingSampleRateRef.current;
        if (sampleRate) {
          const sampleCount = audioChunksRef.current.reduce((length, chunk) => length + chunk.length, 0);
          setRecordingSeconds(Math.floor(sampleCount / sampleRate));
        }
      }, 250);
      recordingTimeoutRef.current = window.setTimeout(stopRecording, 120_000);
    } catch (error) {
      console.error("Could not start voice recording.", error);
      setRecordingError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access to record a voice message."
        : "Could not start recording. Please check your microphone and browser audio support.");
      processorRef.current?.disconnect();
      processorRef.current = null;
      recordingSourceRef.current?.disconnect();
      recordingSourceRef.current = null;
      silentGainRef.current?.disconnect();
      silentGainRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
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
    recordingSourceRef.current?.disconnect();
    recordingSourceRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const sampleCount = audioChunksRef.current.reduce((length, chunk) => length + chunk.length, 0);
    const duration = sampleCount / audioContext.sampleRate;
    const wav = createVoiceWav(audioChunksRef.current, audioContext.sampleRate);
    audioChunksRef.current = [];
    recordingSampleRateRef.current = null;
    void audioContext.close();
    audioContextRef.current = null;
    setIsRecording(false);
    if (wav.size > 10 * 1024 * 1024) {
      setRecordingError("This voice message is over 10 MB. Record a shorter message.");
      return;
    }
    if (wav.size <= 44 || duration <= 0) {
      setRecordingError("No audio was captured. Please try recording again.");
      return;
    }
    const file = new File([wav], "voice-message.wav", { type: "audio/wav" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (audioInputRef.current) audioInputRef.current.files = transfer.files;
    setAudioDuration(duration);
    setRecordingSeconds(Math.floor(duration));
    setAudioPreviewUrl(URL.createObjectURL(wav));
    setAudioReady(true);
  }

  function cancelRecording() {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recordingClockRef.current !== null) {
      window.clearInterval(recordingClockRef.current);
      recordingClockRef.current = null;
    }
    audioChunksRef.current = [];
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    recordingSourceRef.current?.disconnect();
    recordingSourceRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
    audioContextRef.current = null;
    recordingSampleRateRef.current = null;
    setRecordingSeconds(0);
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

  async function updateMutePreference(muted: boolean) {
    setSettingsError(null);
    setSettingsMessage(null);
    if (isGroup) {
      startGroupSettingsUpdate(async () => {
        const result = await setChatMuted({ otherUserId: recipientId, groupId, muted });
        if (result?.error) {
          setSettingsError(result.error);
          return;
        }
        setIsMuted(muted);
        setSettingsMessage(muted ? "Conversation muted." : "Conversation unmuted.");
      });
      return;
    }

    setIsUpdatingDirectSettings(true);
    try {
      const result = await setChatMuted({ otherUserId: recipientId, groupId, muted });
      if (result?.error) {
        setSettingsError(result.error);
        return;
      }
      setIsMuted(muted);
      setSettingsMessage(muted ? "Notifications muted for this conversation." : "Notifications unmuted.");
    } catch (error) {
      console.error("Could not update conversation notifications.", error);
      setSettingsError(error instanceof Error ? error.message : "Could not update conversation notifications.");
    } finally {
      setIsUpdatingDirectSettings(false);
    }
  }

  async function removeConversation() {
    if (isGroup) {
      if (!window.confirm(`Leave "${conversationName}"? You will no longer see this group conversation.`)) return;
      setSettingsError(null);
      startGroupSettingsUpdate(async () => {
        const result = await leaveGroupConversation(groupId ?? "");
        if (result?.error) {
          setSettingsError(result.error);
          return;
        }
        router.push(result?.redirectTo ?? "/messages");
      });
      return;
    }

    setSettingsError(null);
    setSettingsMessage(null);
    setIsUpdatingDirectSettings(true);
    try {
      const result = await deleteDirectConversation(recipientId ?? "");
      if (result?.error) {
        setSettingsError(result.error);
        return;
      }
      router.push(result?.redirectTo ?? "/messages");
    } catch (error) {
      console.error("Could not remove the conversation.", error);
      setSettingsError(error instanceof Error ? error.message : "Could not remove the conversation.");
    } finally {
      setIsUpdatingDirectSettings(false);
    }
  }

  return (
    <div className="chat-thread messenger-chat-thread">
      {settingsHost && createPortal(
        <details
          ref={settingsPanelRef}
          className="chat-theme-settings chat-settings-dialog"
          open={isGroup ? undefined : settingsOpen}
          onToggle={isGroup ? undefined : (event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary className="chat-settings-summary" aria-label="More conversation options" title="More options">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </summary>
          <div className={`chat-settings-panel${isGroup ? "" : " chat-settings-panel-direct"}`}>
            <div className="chat-settings-header">
              <button
                type="button"
                aria-label="Close conversation options"
                onClick={() => {
                  if (isGroup) settingsPanelRef.current?.removeAttribute("open");
                  else setSettingsOpen(false);
                }}
              >×</button>
              <h2>Conversation settings</h2>
              <span aria-hidden="true" />
            </div>
            <div className="chat-settings-profile">
              <span className="chat-settings-avatar">
                {participantAvatarUrl
                  ? <img src={participantAvatarUrl} alt="" />
                  : <span>{conversationName.slice(0, 1).toUpperCase()}</span>}
              </span>
              <span>
                <strong>{conversationName}</strong>
                <small>{participantUsername ? `@${participantUsername}` : isGroup ? "Group conversation" : "Private conversation"}</small>
              </span>
              {!isGroup && participantHref && (
                <Link href={participantHref} className="chat-settings-profile-link">View profile</Link>
              )}
            </div>
            <div className="chat-settings-options">
              {!isGroup && (
                <>
                  <button
                    type="button"
                    className="chat-settings-option chat-settings-search-trigger"
                    aria-expanded={searchOpen}
                    onClick={() => setSearchOpen((open) => !open)}
                  >
                    <span className="chat-settings-option-icon" aria-hidden="true">⌕</span>
                    <span className="chat-settings-option-copy"><strong>Search in conversation</strong><small>Find a message by keyword</small></span>
                    <span className="chat-settings-chevron" aria-hidden="true">{searchOpen ? "⌄" : "›"}</span>
                  </button>
                  {searchOpen && (
                    <div className="chat-settings-search">
                      <input
                        type="search"
                        value={conversationSearch}
                        onChange={(event) => setConversationSearch(event.target.value)}
                        placeholder="Search messages"
                        aria-label="Search messages in this conversation"
                        autoFocus
                      />
                      {conversationSearch.trim() && (() => {
                        const term = conversationSearch.trim().toLocaleLowerCase();
                        const matches = messages.filter((message) =>
                          !message.unsent_at &&
                          `${message.body ?? ""} ${message.imageUrl ? "photo image" : ""} ${message.audioUrl ? "voice audio" : ""}`
                            .toLocaleLowerCase()
                            .includes(term),
                        );
                        return matches.length
                          ? <div className="chat-settings-search-results" role="list" aria-label="Matching messages">
                              {matches.map((message) => (
                                <button
                                  key={message.id}
                                  type="button"
                                  role="listitem"
                                  onClick={() => {
                                    document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                    setSettingsOpen(false);
                                  }}
                                >
                                  <span>{message.body || (message.imageUrl ? "Photo" : "Voice message")}</span>
                                  <small>{new Date(message.created_at).toLocaleString()}</small>
                                </button>
                              ))}
                            </div>
                          : <p className="chat-settings-empty">No matching messages.</p>;
                      })()}
                    </div>
                  )}
                  <section className="chat-settings-shared" aria-labelledby="chat-settings-shared-title">
                    <h3 id="chat-settings-shared-title">Shared media</h3>
                    <div className="chat-settings-tabs" role="tablist" aria-label="Shared conversation items">
                      {(["media", "files", "links"] as const).map((tab) => (
                        <button
                          key={tab}
                          id={`chat-shared-tab-${tab}`}
                          type="button"
                          role="tab"
                          aria-selected={sharedMediaTab === tab}
                          onClick={() => setSharedMediaTab(tab)}
                        >
                          {tab === "media" ? "Media" : tab === "files" ? "Files" : "Links"}
                        </button>
                      ))}
                    </div>
                    <div className="chat-settings-shared-items" role="tabpanel" aria-labelledby={`chat-shared-tab-${sharedMediaTab}`}>
                      {sharedMediaTab === "media" && (() => {
                        const items = messages.filter((message) => !message.unsent_at && (message.imageUrl || message.audioUrl));
                        return items.length
                          ? items.map((message) => message.imageUrl
                              ? <a key={message.id} className="chat-shared-image" href={message.imageUrl} target="_blank" rel="noreferrer" aria-label={`Open shared photo from ${new Date(message.created_at).toLocaleDateString()}`}>
                                  <img src={message.imageUrl} alt="Shared in conversation" loading="lazy" />
                                </a>
                              : <div key={message.id} className="chat-shared-audio">
                                  <span>Voice message · {new Date(message.created_at).toLocaleDateString()}</span>
                                  <audio controls preload="none" src={message.audioUrl ?? undefined}>Your browser does not support audio playback.</audio>
                                </div>)
                          : <p className="chat-settings-empty">No shared media yet.</p>;
                      })()}
                      {sharedMediaTab === "files" && <p className="chat-settings-empty">No shared files yet. File attachments are not supported in chat.</p>}
                      {sharedMediaTab === "links" && (() => {
                        const links = new Map<string, { createdAt: string }>();
                        for (const message of messages) {
                          if (message.unsent_at || !message.body) continue;
                          const foundLinks = message.body.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
                          for (const match of foundLinks) {
                            const url = match.replace(/[),.!?]+$/, "");
                            if (url && !links.has(url)) links.set(url, { createdAt: message.created_at });
                          }
                        }
                        return links.size
                          ? Array.from(links, ([url, info]) => (
                              <a key={url} className="chat-shared-link" href={url} target="_blank" rel="noreferrer">
                                <span>{url}</span><small>Shared {new Date(info.createdAt).toLocaleDateString()}</small>
                              </a>
                            ))
                          : <p className="chat-settings-empty">No shared links yet.</p>;
                      })()}
                    </div>
                  </section>
                </>
              )}
              <button
                type="button"
                className={`chat-settings-option${appearanceOpen ? " chat-settings-option-expanded" : ""}`}
                aria-expanded={appearanceOpen}
                onClick={() => setAppearanceOpen((open) => !open)}
              >
                <span className="chat-settings-option-icon chat-settings-icon-appearance" aria-hidden="true">◉</span>
                <span className="chat-settings-option-copy"><strong>Chats</strong><small>Theme and wallpaper</small></span>
                <span className="chat-settings-chevron" aria-hidden="true">{appearanceOpen ? "⌄" : "›"}</span>
              </button>
              {appearanceOpen && (
                <div className="chat-settings-appearance">
                  <p className="chat-settings-label">Chat background</p>
                  <div className="chat-theme-options">
                    {[
                      ["#252738", "Midnight"],
                      ["#202d3b", "Ocean"],
                      ["#31263d", "Plum"],
                      ["#292d42", "Indigo"],
                      ["#21332f", "Forest"],
                      ["#3b2d2b", "Ember"],
                    ].map(([color, label]) => (
                      <button key={color} type="button" className={`chat-theme-swatch${themeColor === color && !themeImage ? " chat-theme-swatch-active" : ""}`} style={{ backgroundColor: color }} aria-label={`${label} chat theme`} title={label} onClick={() => saveTheme(color, null)} />
                    ))}
                    <label className="chat-theme-color">
                      <span>Custom color</span>
                      <input type="color" value={themeColor ?? "#fff8fa"} aria-label="Choose chat background color" onChange={(event) => saveTheme(event.target.value, themeImage)} />
                    </label>
                    <label className="chat-tool-button">
                      <span aria-hidden="true">▧</span><span>Wallpaper</span>
                      <input ref={themeImageInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => void setThemeFromImage(event.target.files?.[0])} />
                    </label>
                    {themeImage && <button type="button" className="chat-tool-button" onClick={() => saveTheme(themeColor, null)}>Remove wallpaper</button>}
                    {!isGroup && <button type="button" className="chat-tool-button chat-theme-reset" onClick={resetTheme}>Reset appearance</button>}
                  </div>
                  {themeError && <p role="alert" className="chat-settings-error">{themeError}</p>}
                </div>
              )}
              <label className="chat-settings-option chat-settings-notification">
                <span className="chat-settings-option-icon chat-settings-icon-notifications" aria-hidden="true">♢</span>
                <span className="chat-settings-option-copy"><strong>Notifications</strong><small>{isMuted ? "Muted indefinitely" : "Mute this conversation"}</small></span>
                <input
                  type="checkbox"
                  checked={isMuted}
                  disabled={isUpdatingSettings || chatSettingsNeedSetup}
                  onChange={(event) => void updateMutePreference(event.target.checked)}
                  aria-label="Mute notifications for this conversation"
                />
              </label>
              {settingsError && <p role="alert" className="chat-settings-error">{settingsError}</p>}
              {settingsMessage && <p role="status" className="chat-settings-success">{settingsMessage}</p>}
              {chatSettingsNeedSetup && (
                <p className="chat-settings-migration-note">
                  Mute and delete need a database update. Run <code>supabase/messaging-enhancements.sql</code> in Supabase SQL Editor.
                </p>
              )}
              <div className="chat-settings-danger">
                <p className="chat-settings-label">{isGroup ? "Group management" : "Conversation management"}</p>
                {!isGroup && <p className="chat-delete-note">Deleting removes this conversation only from your inbox. It does not delete messages from the other person’s view.</p>}
                <button type="button" className="chat-delete-conversation" disabled={isUpdatingSettings || chatSettingsNeedSetup} onClick={() => isGroup ? void removeConversation() : setConfirmDeleteOpen(true)}>
                  {isUpdatingSettings ? "Please wait..." : isGroup ? "Leave group conversation" : "Delete conversation"}
                </button>
                {!isGroup && confirmDeleteOpen && (
                  <div className="chat-settings-confirm" role="alertdialog" aria-labelledby="chat-delete-confirm-title" aria-describedby="chat-delete-confirm-copy">
                    <strong id="chat-delete-confirm-title">Delete this conversation?</strong>
                    <p id="chat-delete-confirm-copy">It will disappear from your inbox. Messages are not deleted for {conversationName}.</p>
                    <div>
                      <button type="button" onClick={() => setConfirmDeleteOpen(false)} disabled={isUpdatingSettings}>Keep conversation</button>
                      <button type="button" className="chat-delete-confirm-action" onClick={() => void removeConversation()} disabled={isUpdatingSettings || chatSettingsNeedSetup}>
                        {isUpdatingSettings ? "Deleting..." : "Delete for me"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </details>
      , settingsHost)}
      <div
        ref={messageListRef}
        className="chat-message-list messenger-chat-messages flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
        style={{
          backgroundColor: themeColor ?? undefined,
          backgroundImage: themeImage ? `url("${themeImage}")` : undefined,
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
            <article id={`chat-message-${message.id}`} key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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
                          <VoiceMessagePlayer
                            src={stableAudioUrl}
                            onPlay={(audio) => {
                              document.querySelectorAll<HTMLAudioElement>(".messenger-chat-messages audio, .chat-settings-shared-items audio").forEach((player) => {
                                if (player !== audio) player.pause();
                              });
                              activeAudioRef.current.add(message.id);
                              setAudioErrors((current) => {
                                if (!current[message.id]) return current;
                                const next = { ...current };
                                delete next[message.id];
                                return next;
                              });
                            }}
                            onError={() => {
                              activeAudioRef.current.delete(message.id);
                              setAudioErrors((current) => ({
                                ...current,
                                [message.id]: "Could not load this voice message. Check your connection and try again.",
                              }));
                            }}
                          />
                          {audioErrors[message.id] && (
                            <p role="alert" className="chat-audio-error mt-1 text-xs">{audioErrors[message.id]}</p>
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
      </div>
      {reactionError && <p role="alert" className="mt-2 text-sm text-red-700">{reactionError}</p>}
      {unsendState?.error && <p role="alert" className="mt-2 text-sm text-red-700">{unsendState.error}</p>}
      <form ref={formRef} action={action} className="chat-composer messenger-composer mt-4 space-y-3">
        {groupId
          ? <input type="hidden" name="group_id" value={groupId} />
          : <input type="hidden" name="recipient_id" value={recipientId} />}
        <label className="block text-sm">Message
          <textarea ref={messageRef} name="body" maxLength={2000} rows={3} className="input mt-1" placeholder="Type your message..." />
        </label>
        <div className="chat-tools">
          <EmojiPicker inputRef={messageRef} />
          <label className="chat-tool-button" title="Add photo">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            <span>Add photo</span>
            <input ref={imageInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              setSelectedImageName(file?.name ?? "");
              setImagePreviewUrl(file?.type.startsWith("image/") ? URL.createObjectURL(file) : null);
            }} />
          </label>
          <input ref={audioInputRef} name="audio" type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/wav" className="sr-only" />
          {isRecording ? (
            <>
              <span className="chat-selected-image" role="status" aria-live="polite">Recording · {formatAudioDuration(recordingSeconds)}</span>
              <button type="button" className="chat-tool-button" onClick={stopRecording}>Stop recording</button>
              <button type="button" className="chat-tool-button" onClick={cancelRecording}>Cancel recording</button>
            </>
          ) : (
            <button type="button" className="chat-tool-button" onClick={() => void startRecording()}>
              <span aria-hidden="true">🎙</span><span>Voice message</span>
            </button>
          )}
          {selectedImageName && <span className="chat-selected-image">{selectedImageName}</span>}
        </div>
        {imagePreviewUrl && (
          <div className="chat-attachment-preview">
            <img src={imagePreviewUrl} alt={`Preview of ${selectedImageName || "selected photo"}`} />
            <button type="button" className="chat-tool-button" onClick={() => {
              if (imageInputRef.current) imageInputRef.current.value = "";
              setSelectedImageName("");
              setImagePreviewUrl(null);
            }}>Remove photo</button>
          </div>
        )}
        {audioReady && audioPreviewUrl && (
          <div className="chat-attachment-preview chat-audio-preview">
            <p>Voice message preview · {formatAudioDuration(audioDuration)}</p>
            <VoiceMessagePlayer src={audioPreviewUrl} label="Recording preview" />
            <button type="button" className="chat-tool-button" onClick={() => {
              if (audioInputRef.current) audioInputRef.current.value = "";
              setAudioReady(false);
              setAudioDuration(0);
              setAudioPreviewUrl(null);
            }}>Remove recording</button>
          </div>
        )}
        {recordingError && <p role="alert" className="text-sm text-red-700">{recordingError}</p>}
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <SendButton disabled={isRecording} label={audioReady ? "Send voice message" : "Send"} />
      </form>
    </div>
  );
}

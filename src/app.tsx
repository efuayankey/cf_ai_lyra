import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import {
  Button,
  Badge,
  InputArea,
  Surface,
  Text
} from "@cloudflare/kumo";
import { Toasty } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  GearIcon,
  PlayIcon,
  PauseIcon,
  MusicNoteIcon,
  HeadphonesIcon,
  ArrowSquareOutIcon,
  HeartIcon,
  BookmarkSimpleIcon
} from "@phosphor-icons/react";

// --- Types ---

interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string;
  preview_url: string | null;
  store_url: string;
  genre?: string;
}

interface TrackCardProps {
  track: Track;
  isPlaying: boolean;
  onTogglePlay: (previewUrl: string | null, trackId: string) => void;
}

// --- Theme toggle ---

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// --- Track card ---

function TrackCard({ track, isPlaying, onTogglePlay }: TrackCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-kumo-control border border-kumo-line hover:border-kumo-accent/40 transition-all group">
      {/* Album art */}
      <div className="relative shrink-0">
        {track.image ? (
          <img
            src={track.image}
            alt={track.album}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-kumo-line flex items-center justify-center">
            <MusicNoteIcon size={20} className="text-kumo-inactive" />
          </div>
        )}
        {isPlaying && (
          <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
            <div className="flex gap-0.5 items-end h-4">
              <div className="w-0.5 bg-white rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
              <div className="w-0.5 bg-white rounded-full animate-bounce h-3" style={{ animationDelay: "150ms" }} />
              <div className="w-0.5 bg-white rounded-full animate-bounce h-2" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-kumo-default truncate">
          {track.name}
        </p>
        <p className="text-xs text-kumo-subtle truncate">
          {track.artist} · {track.album}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {track.preview_url && (
          <button
            onClick={() => onTogglePlay(track.preview_url, track.id)}
            className="w-8 h-8 rounded-full bg-kumo-accent/10 hover:bg-kumo-accent/20 flex items-center justify-center transition-colors"
            title={isPlaying ? "Pause preview" : "Play 30s preview"}
          >
            {isPlaying ? (
              <PauseIcon size={14} className="text-kumo-accent" />
            ) : (
              <PlayIcon size={14} className="text-kumo-accent" />
            )}
          </button>
        )}
        <a
          href={track.store_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-full bg-kumo-accent/10 hover:bg-kumo-accent/20 flex items-center justify-center transition-colors"
          title="Open in Apple Music"
        >
          <ArrowSquareOutIcon size={13} className="text-kumo-accent" />
        </a>
      </div>
    </div>
  );
}

// --- Track list ---

function TrackList({
  tracks,
  playingTrackId,
  onTogglePlay
}: {
  tracks: Track[];
  playingTrackId: string | null;
  onTogglePlay: (previewUrl: string | null, trackId: string) => void;
}) {
  return (
    <div className="space-y-2 w-full">
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          isPlaying={playingTrackId === track.id}
          onTogglePlay={onTogglePlay}
        />
      ))}
    </div>
  );
}

// --- Taste profile display ---

function TasteProfileView({
  data
}: {
  data: { type: string; value: string }[];
}) {
  const grouped: Record<string, string[]> = {};
  for (const item of data) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item.value);
  }

  const labelMap: Record<string, string> = {
    liked_artist: "Artists you love",
    liked_track: "Tracks you love",
    liked_genre: "Genres you love",
    disliked_genre: "Genres to avoid",
    disliked_artist: "Artists to skip",
    mood_context: "Your moods"
  };

  return (
    <div className="space-y-2 w-full">
      {Object.entries(grouped).map(([type, values]) => (
        <div key={type}>
          <p className="text-xs font-medium text-kumo-subtle mb-1.5">
            {labelMap[type] ?? type}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-kumo-accent/10 text-kumo-accent border border-kumo-accent/20"
              >
                <HeartIcon size={10} weight="fill" />
                {v}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Saved preference indicator ---

function SavedPreferenceView({ data }: { data: { type: string; value: string } }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-kumo-accent/5 border border-kumo-accent/20">
      <BookmarkSimpleIcon size={13} className="text-kumo-accent shrink-0" />
      <Text size="xs" variant="secondary">
        Saved: <span className="text-kumo-default font-medium">{data.value}</span>
      </Text>
    </div>
  );
}

// --- Tool part renderer ---

function isTrackArray(output: unknown): output is Track[] {
  return (
    Array.isArray(output) &&
    output.length > 0 &&
    typeof output[0] === "object" &&
    output[0] !== null &&
    "store_url" in output[0]
  );
}

function isTasteProfileArray(
  output: unknown
): output is { type: string; value: string }[] {
  return (
    Array.isArray(output) &&
    output.length > 0 &&
    typeof output[0] === "object" &&
    output[0] !== null &&
    "type" in output[0] &&
    "value" in output[0]
  );
}

function isSavedPreference(
  output: unknown
): output is { saved: boolean; type: string; value: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    "saved" in output &&
    (output as { saved: unknown }).saved === true
  );
}

function ToolPartView({
  part,
  addToolApprovalResponse,
  playingTrackId,
  onTogglePlay
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
  playingTrackId: string | null;
  onTogglePlay: (previewUrl: string | null, trackId: string) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  // Completed
  if (part.state === "output-available") {
    const output = part.output;

    // Song results
    if (
      (toolName === "searchTracks" || toolName === "getRecommendations") &&
      isTrackArray(output)
    ) {
      return (
        <div className="flex justify-start w-full max-w-[85%]">
          <TrackList
            tracks={output}
            playingTrackId={playingTrackId}
            onTogglePlay={onTogglePlay}
          />
        </div>
      );
    }

    // Taste profile
    if (toolName === "getTasteProfile" && isTasteProfileArray(output)) {
      return (
        <div className="flex justify-start w-full max-w-[85%]">
          <Surface className="w-full px-4 py-3 rounded-xl ring ring-kumo-line">
            <div className="flex items-center gap-2 mb-3">
              <HeartIcon size={14} className="text-kumo-accent" weight="fill" />
              <Text size="xs" variant="secondary" bold>
                Your Taste Profile
              </Text>
            </div>
            <TasteProfileView data={output} />
          </Surface>
        </div>
      );
    }

    // Saved preference
    if (toolName === "savePreference" && isSavedPreference(output)) {
      return (
        <div className="flex justify-start">
          <SavedPreferenceView data={output} />
        </div>
      );
    }

    // Generic tool output
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(output, null, 2)}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  // Needs approval
  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-warning">
          <div className="flex items-center gap-2 mb-2">
            <GearIcon size={14} className="text-kumo-warning" />
            <Text size="sm" bold>
              Approval needed: {toolName}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  // Running
  if (part.state === "input-available" || part.state === "input-streaming") {
    const loadingLabel: Record<string, string> = {
      searchTracks: "Searching Spotify...",
      getRecommendations: "Finding tracks for you...",
      savePreference: "Remembering that...",
      getTasteProfile: "Loading your taste profile..."
    };

    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <MusicNoteIcon
              size={14}
              className="text-kumo-accent animate-pulse"
            />
            <Text size="xs" variant="secondary">
              {loadingLabel[toolName] ?? `Running ${toolName}...`}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// --- Suggestion prompts ---

const SUGGESTIONS = [
  "I'm feeling nostalgic tonight 🌙",
  "Give me something to get hyped for the gym 🔥",
  "I love Tyler the Creator — what else would I vibe with?",
  "I'm sad. Help me feel something."
];

// --- Main chat ---

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const handleTogglePlay = useCallback(
    (previewUrl: string | null, trackId: string) => {
      if (!previewUrl) return;

      if (playingTrackId === trackId) {
        audioRef.current?.pause();
        setPlayingTrackId(null);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
      }

      const audio = new Audio(previewUrl);
      audioRef.current = audio;
      audio
        .play()
        .catch(() => console.warn("Autoplay blocked for preview audio"));
      audio.onended = () => setPlayingTrackId(null);
      setPlayingTrackId(trackId);
    },
    [playingTrackId]
  );

  // Stop audio when leaving page
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const agent = useAgent({
    agent: "LyraAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });

  const { messages, sendMessage, clearHistory, addToolApprovalResponse, stop, status } =
    useAgentChat({ agent });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, sendMessage]);

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      {/* Header */}
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-kumo-accent/10 flex items-center justify-center">
                <HeadphonesIcon
                  size={18}
                  className="text-kumo-accent"
                  weight="fill"
                />
              </div>
              <div>
                <h1 className="text-base font-bold text-kumo-default leading-tight">
                  Lyra
                </h1>
                <p className="text-[10px] text-kumo-subtle leading-tight">
                  your music companion
                </p>
              </div>
            </div>
            {playingTrackId && (
              <Badge variant="primary">
                <MusicNoteIcon size={10} className="mr-1 animate-pulse" />
                Playing preview
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <ThemeToggle />
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={() => {
                audioRef.current?.pause();
                setPlayingTrackId(null);
                clearHistory();
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-kumo-accent/10 flex items-center justify-center">
                <HeadphonesIcon
                  size={32}
                  className="text-kumo-accent"
                  weight="fill"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-kumo-default mb-1">
                  What do you want to hear?
                </h2>
                <p className="text-sm text-kumo-subtle max-w-xs">
                  Tell me your mood, an artist you love, or just how you're
                  feeling — I'll find the music.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {SUGGESTIONS.map((prompt) => (
                  <button
                    key={prompt}
                    disabled={isStreaming}
                    onClick={() => {
                      sendMessage({
                        role: "user",
                        parts: [{ type: "text", text: prompt }]
                      });
                    }}
                    className="px-3 py-2 rounded-full text-sm border border-kumo-line bg-kumo-base hover:border-kumo-accent/40 hover:bg-kumo-accent/5 text-kumo-default transition-all disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {/* Tool parts */}
                {message.parts.filter(isToolUIPart).map((part) => (
                  <ToolPartView
                    key={part.toolCallId}
                    part={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                    playingTrackId={playingTrackId}
                    onTogglePlay={handleTogglePlay}
                  />
                ))}

                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    const text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                            {text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              placeholder="Tell me your mood, an artist, a feeling..."
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={!input.trim() || !connected}
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}

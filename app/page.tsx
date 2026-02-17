"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const wantListeningRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const toggleListening = useCallback(() => {
    if (listening) {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      setVoiceActive(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    };

    recognition.onspeechstart = () => setVoiceActive(true);
    recognition.onspeechend = () => setVoiceActive(false);

    recognition.onend = () => {
      setVoiceActive(false);
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          wantListeningRef.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech") return; // ignore silence, keep listening
      wantListeningRef.current = false;
      setListening(false);
      setVoiceActive(false);
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    recognition.start();
    setListening(true);
  }, [listening]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const cleanForSpeech = (text: string): string => {
    return (
      text
        // Remove markdown: headers, bold, italic, strikethrough, code
        .replace(/#{1,6}\s?/g, "")
        .replace(/(\*{1,3}|_{1,3}|~~)(.*?)\1/g, "$2")
        .replace(/`{1,3}[^`]*`{1,3}/g, "")
        // Remove markdown links [text](url) → text, and bare URLs
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "")
        // Remove markdown images, blockquotes, horizontal rules, list markers
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/^>\s?/gm, "")
        .replace(/^[-*]{3,}$/gm, "")
        .replace(/^[\s]*[-*+]\s/gm, " ")
        .replace(/^\d+\.\s/gm, " ")
        // Remove emojis and special Unicode symbols
        .replace(
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
          ""
        )
        // Collapse whitespace and trim
        .replace(/\n+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    );
  };

  const speakChunk = useCallback((text: string) => {
    if (!window.speechSynthesis) return;

    const clean = cleanForSpeech(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Pick the best available voice: prefer male Hindi (hi-IN), then
    // any Hindi voice, then a calm English fallback
    const voices = window.speechSynthesis.getVoices();
    const hiVoices = voices.filter((v) =>
      /^hi[-_]/i.test(v.lang)
    );
    const preferred =
      // 1. Male Hindi voice (name hints: male keywords or known male names)
      hiVoices.find(
        (v) =>
          /male|prabhat|madhur|hemant|ravi/i.test(v.name) &&
          !/female/i.test(v.name)
      ) ||
      // 2. Any Hindi voice (hi-IN, hi_IN, etc.)
      hiVoices[0] ||
      // 3. Calm English fallback
      voices.find(
        (v) =>
          v.name.includes("Google UK English Male") ||
          v.name.includes("Daniel") ||
          v.name.includes("Rishi") ||
          v.name.includes("Google UK English Female") ||
          v.name.includes("Samantha")
      );
    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      if (
        !window.speechSynthesis.speaking &&
        !window.speechSynthesis.pending
      ) {
        setSpeaking(false);
      }
    };
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const [loading, setLoading] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const streamWords = useCallback(
    (fullText: string) => {
      const words = fullText.split(/(\s+)/);
      let index = 0;
      setStreamedText("");

      // Cancel any previous speech before starting new reply
      window.speechSynthesis?.cancel();
      setSpeaking(false);

      // Pre-split into sentences for progressive TTS
      const sentences = fullText.split(/(?<=[.!?\n])\s+/).filter(Boolean);
      const sentenceEnds: number[] = [];
      let searchFrom = 0;
      for (const sentence of sentences) {
        const idx = fullText.indexOf(sentence, searchFrom);
        if (idx !== -1) {
          sentenceEnds.push(idx + sentence.length);
          searchFrom = idx + sentence.length;
        }
      }
      let spokenIndex = 0;

      streamIntervalRef.current = setInterval(() => {
        index++;
        if (index >= words.length) {
          if (streamIntervalRef.current)
            clearInterval(streamIntervalRef.current);
          // Speak any remaining unspoken text
          if (!mutedRef.current && spokenIndex < sentences.length) {
            const remaining = sentences.slice(spokenIndex).join(" ");
            if (remaining.trim()) speakChunk(remaining);
          }
          // Finalize: add full message to chat
          setStreamedText("");
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: fullText },
          ]);
          setLoading(false);
        } else {
          const currentText = words.slice(0, index + 1).join("");
          setStreamedText(currentText);

          // Speak sentences as they are fully revealed
          if (!mutedRef.current) {
            while (
              spokenIndex < sentenceEnds.length &&
              currentText.length >= sentenceEnds[spokenIndex]
            ) {
              speakChunk(sentences[spokenIndex]);
              spokenIndex++;
            }
          }
        }
      }, 75);
    },
    [speakChunk]
  );

  // Cleanup stream interval on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, reflecting, streamedText]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      const reply: string = data.reply;

      // Show reflecting loader, then stream the response
      setReflecting(true);
      setTimeout(() => {
        setReflecting(false);
        streamWords(reply);
      }, 2500);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I am unable to respond right now." },
      ]);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-3 font-sans md:p-6">
      {/* Chat card */}
      <div
        className="relative z-10 flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-lg backdrop-blur-sm md:h-[calc(100dvh-3rem)]"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--card-border)" }}
        >
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Krishna.ai
          </h1>
          <div className="flex items-center gap-2">
            {speaking && (
              <button
                onClick={stopSpeaking}
                className="rounded-lg px-2.5 py-1.5 text-xs text-foreground/50 transition-colors hover:text-foreground"
                style={{
                  border: "1px solid var(--input-border)",
                }}
                title="Stop speaking"
              >
                Stop
              </button>
            )}
            <button
              onClick={() => {
                if (!muted) stopSpeaking();
                setMuted((m) => !m);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                muted
                  ? "text-foreground/30"
                  : "text-foreground/50 hover:text-foreground"
              }`}
              style={{
                border: "1px solid var(--input-border)",
              }}
              title={muted ? "Unmute voice" : "Mute voice"}
            >
              {muted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <line x1="22" x2="16" y1="9" y2="15" />
                  <line x1="16" x2="22" y1="9" y2="15" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto flex flex-col gap-5">
            {messages.length === 0 && (
              <p className="py-24 text-center text-[15px] text-foreground/35">
                Start a conversation
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[78%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "var(--user-bubble)",
                          color: "var(--user-bubble-text)",
                        }
                      : {
                          background: "var(--assistant-bubble)",
                          color: "var(--assistant-bubble-text)",
                        }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {reflecting && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3 text-[15px] italic text-foreground/45"
                  style={{ background: "var(--assistant-bubble)" }}
                >
                  Krishna is reflecting on your question…
                </div>
              </div>
            )}
            {streamedText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[78%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed"
                  style={{
                    background: "var(--assistant-bubble)",
                    color: "var(--assistant-bubble-text)",
                  }}
                >
                  {streamedText}
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground/30 align-middle" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
        <footer
          className="px-4 py-4 md:px-6"
          style={{ borderTop: "1px solid var(--card-border)" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mx-auto flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type or speak a message..."
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-foreground/35"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--input-border-focus)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--input-border)")
              }
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`flex items-center justify-center rounded-xl px-3 py-2.5 text-sm transition-colors ${
                listening
                  ? "border-red-400 bg-red-500/10 text-red-500"
                  : "text-foreground/50 hover:text-foreground"
              }`}
              style={
                listening
                  ? { border: "1px solid rgb(248 113 113)" }
                  : { border: "1px solid var(--input-border)" }
              }
              title={listening ? "Stop listening" : "Start listening"}
            >
              {listening ? (
                <div className="flex h-4 items-center gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={`waveform-bar ${voiceActive ? "waveform-bar-active" : "waveform-bar-idle"}`}
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--user-bubble)" }}
            >
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

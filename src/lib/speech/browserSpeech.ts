import type { SpeechHandlers, SpeechToTextProvider, TextToSpeechProvider } from "@/lib/speech/types";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function createBrowserSpeechToText(): SpeechToTextProvider {
  let active: Recognition | null = null;
  return {
    isSupported: () => recognitionCtor() !== null,
    start(handlers: SpeechHandlers, locale: string) {
      const Ctor = recognitionCtor();
      if (!Ctor) {
        handlers.onError("unsupported");
        handlers.onEnd();
        return;
      }
      active?.abort();
      const recognition = new Ctor();
      active = recognition;
      recognition.lang = locale || "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let finalText = "";
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) finalText += piece;
          else partial += piece;
        }
        if (partial) handlers.onPartial?.(partial);
        if (finalText.trim()) handlers.onFinal(finalText.trim());
      };
      recognition.onerror = (event) => handlers.onError(event.error || "speech-error");
      recognition.onend = () => {
        if (active === recognition) active = null;
        handlers.onEnd();
      };
      try {
        recognition.start();
      } catch {
        handlers.onError("speech-error");
        handlers.onEnd();
      }
    },
    stop() {
      active?.stop();
      active = null;
    },
  };
}

export function createBrowserTextToSpeech(): TextToSpeechProvider {
  return {
    isSupported: () => typeof window !== "undefined" && "speechSynthesis" in window,
    speak(text: string, locale: string) {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale || "en-US";
      window.speechSynthesis.speak(utterance);
    },
    cancel() {
      window.speechSynthesis?.cancel();
    },
  };
}

import type { CartLine, OrderChannel, OrderTurnResult } from "@/lib/ordering/engine";

export type SpeechHandlers = {
  onPartial?: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError: (code: string) => void;
  onEnd: () => void;
};

/** Swap this implementation later without changing the ordering engine. */
export interface SpeechToTextProvider {
  isSupported(): boolean;
  start(handlers: SpeechHandlers, locale: string): void;
  stop(): void;
}

export interface TextToSpeechProvider {
  isSupported(): boolean;
  speak(text: string, locale: string): void;
  cancel(): void;
}

export type VoiceTurnRequest = {
  op: "turn" | "confirm" | "cancel";
  sessionId: string;
  slug: string;
  utterance?: string;
  cart: CartLine[];
  locale: string;
  channel: OrderChannel;
  turnId: string;
  pendingUpsellItemId?: string | null;
};

export type VoiceSessionResponse = {
  ok: true;
  sessionId: string;
  greeting: string;
  spokenResponses: boolean;
  upsellsEnabled: boolean;
};

export type VoiceTurnResponse =
  | (OrderTurnResult & { ok: true; sessionId: string })
  | { ok: false; error: string; code: string };

export interface ConversationProvider {
  startSession(input: { slug: string; channel: OrderChannel; locale: string }): Promise<VoiceSessionResponse | { ok: false; error: string; code: string }>;
  turn(input: VoiceTurnRequest): Promise<VoiceTurnResponse>;
}

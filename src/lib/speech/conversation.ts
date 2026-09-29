import { supabase } from "@/integrations/supabase/client";
import type { ConversationProvider, VoiceSessionResponse, VoiceTurnRequest, VoiceTurnResponse } from "@/lib/speech/types";

const MAX_UTTERANCE = 500;

function failure(code: string, error: string): { ok: false; code: string; error: string } {
  return { ok: false, code, error };
}

export function createSupabaseConversation(): ConversationProvider {
  return {
    async startSession(input) {
      const { data, error } = await supabase.functions.invoke("voice-order", {
        body: { op: "start", slug: input.slug, channel: input.channel, locale: input.locale },
      });
      if (error || !data || data.ok !== true || typeof data.sessionId !== "string") {
        console.error("[voice] session failed", error);
        return failure("unavailable", "Voice ordering is unavailable right now. You can still browse the menu.");
      }
      return data as VoiceSessionResponse;
    },
    async turn(input: VoiceTurnRequest): Promise<VoiceTurnResponse> {
      const utterance = (input.utterance ?? "").trim().slice(0, MAX_UTTERANCE);
      if (input.op === "turn" && !utterance) {
        return failure("empty", "Say what you'd like, or type it below.");
      }
      const { data, error } = await supabase.functions.invoke("voice-order", {
        body: { ...input, utterance },
      });
      if (error || !data || data.ok !== true) {
        console.error("[voice] turn failed", error, data);
        const message = typeof data?.error === "string"
          ? data.error
          : "I couldn't check that against the menu. Please try again.";
        return failure(typeof data?.code === "string" ? data.code : "unavailable", message);
      }
      return data as VoiceTurnResponse;
    },
  };
}

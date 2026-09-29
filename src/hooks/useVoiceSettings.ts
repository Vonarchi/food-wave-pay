import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VoiceSettings = {
  ready: boolean;
  enabled: boolean;
  spoken: boolean;
  greeting: string | null;
  name: string;
};

export function useVoiceSettings(slug: string): VoiceSettings {
  const demo = slug === "demo";
  const [settings, setSettings] = useState<VoiceSettings>({
    ready: demo,
    enabled: demo,
    spoken: false,
    greeting: null,
    name: demo ? "Smokin' Good BBQ" : "",
  });

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("food_trucks")
      .select("name, voice_ordering_enabled, spoken_responses_enabled, voice_greeting")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setSettings((current) => ({ ...current, ready: true, enabled: demo && current.enabled }));
          return;
        }
        setSettings({
          ready: true,
          enabled: Boolean(data.voice_ordering_enabled),
          spoken: Boolean(data.spoken_responses_enabled),
          greeting: data.voice_greeting,
          name: data.name ?? "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, demo]);

  return settings;
}

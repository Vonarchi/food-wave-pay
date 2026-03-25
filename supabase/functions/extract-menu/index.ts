import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

/** Used only when models.list fails */
const STATIC_MODEL_FALLBACK = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-flash-latest",
  "gemini-2.5-flash-preview-04-17",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
] as const;

type GeminiModelMeta = { name?: string; supportedGenerationMethods?: string[] };

/** Models this API key can call for generateContent (avoids 404 from wrong IDs). */
async function listGenerativeModels(apiKey: string): Promise<string[]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {}, 15000);
  } catch (e) {
    console.warn("[extract-menu] models.list fetch failed:", e);
    return [...STATIC_MODEL_FALLBACK];
  }
  if (!res.ok) {
    const t = await res.text();
    console.warn("[extract-menu] models.list status:", res.status, t.slice(0, 200));
    return [...STATIC_MODEL_FALLBACK];
  }
  let j: { models?: GeminiModelMeta[] };
  try {
    j = await res.json();
  } catch {
    return [...STATIC_MODEL_FALLBACK];
  }
  const ids = (j.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => (m.name || "").replace(/^models\//, ""))
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    console.warn("[extract-menu] models.list returned no generateContent models");
    return [...STATIC_MODEL_FALLBACK];
  }

  const flash = ids.filter((id) => /flash/i.test(id));
  const rest = ids.filter((id) => !/flash/i.test(id));
  const ordered = [...flash, ...rest];
  console.log("[extract-menu] usable models (first 10):", ordered.slice(0, 10).join(", "));
  return ordered;
}

/** OCR-first system prompt: structured draft, no invented modifiers */
const SYSTEM_PROMPT = `You extract restaurant menu data from images (OCR + layout). This is a FIRST DRAFT for the owner to edit—not final truth.

Rules:
- Transcribe visible text for item names and prices as accurately as possible.
- Use category headings from the menu when visible; otherwise infer simple categories (e.g. Appetizers, Mains, Drinks).
- description: only if clearly printed next to the item; otherwise use empty string "".
- price: number only (no $). If unreadable, use 0.
- modifier_groups: ONLY if the menu clearly shows options with prices or explicit choices (e.g. "Add cheese +1", "Small/Medium/Large", "Choose side"). Each group must have a name and options with name and price_delta (0 if no extra charge).
- Do NOT invent modifiers, allergens, or items not suggested by the image.
- Do NOT wrap in markdown. Return ONE JSON object only.

Required JSON shape:
{
  "categories": [ { "name": string, "sort_order": number } ],
  "menu_items": [
    {
      "category_name": string,
      "name": string,
      "description": string,
      "price": number,
      "modifier_groups": [
        {
          "name": string,
          "required": boolean,
          "min_select": number,
          "max_select": number,
          "options": [ { "name": string, "price_delta": number } ]
        }
      ]
    }
  ]
}

If no modifiers are visible for an item, use "modifier_groups": [].
sort_order: 0-based order of categories as they appear top-to-bottom on the menu.`;

type ApiItem = {
  category_name?: string;
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  modifier_groups?: unknown[];
};

function normalizeMenuItems(parsed: unknown): { items: object[] } {
  let menuItems: ApiItem[] = [];

  if (Array.isArray(parsed)) {
    menuItems = parsed as ApiItem[];
  } else if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.menu_items)) menuItems = o.menu_items as ApiItem[];
    else if (Array.isArray(o.items)) menuItems = o.items as ApiItem[];
  }

  const items = menuItems
    .map((row) => {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;
      const category = (row.category_name || row.category || "Main").trim() || "Main";
      const price = typeof row.price === "number" && !Number.isNaN(row.price) ? row.price : 0;
      const description = typeof row.description === "string" ? row.description.trim() : "";
      const modifier_groups = Array.isArray(row.modifier_groups) ? row.modifier_groups : [];
      return {
        name,
        description,
        price,
        category,
        modifier_groups,
      };
    })
    .filter(Boolean);

  return { items: items as object[] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let imageUrl: string | undefined;
    try {
      const body = await req.json();
      imageUrl = body?.imageUrl ?? body?.image_url;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    console.log("[extract-menu] imageUrl received:", imageUrl ? `${imageUrl.substring(0, 80)}...` : "(missing)");

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      return jsonResponse({ error: "Image URL is required and must be a valid HTTP(S) URL" }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    console.log("[extract-menu] api key loaded:", apiKey ? `yes (${apiKey.length} chars)` : "no");

    if (!apiKey) {
      return jsonResponse(
        {
          error:
            "GOOGLE_GEMINI_API_KEY is not set. Run: supabase secrets set GOOGLE_GEMINI_API_KEY=your_key — then redeploy extract-menu.",
        },
        500
      );
    }

    console.log("[extract-menu] image fetch started");
    let imageResponse: Response;
    try {
      imageResponse = await fetchWithTimeout(
        imageUrl,
        { headers: { "User-Agent": "KioKitchen-ExtractMenu/1.0" } },
        20000
      );
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Failed to fetch image";
      console.error("[extract-menu] image fetch failed:", msg);
      return jsonResponse({ error: `Image fetch failed: ${msg}` }, 502);
    }

    if (!imageResponse.ok) {
      console.error("[extract-menu] image fetch status:", imageResponse.status);
      return jsonResponse(
        { error: `Image fetch failed: ${imageResponse.status} ${imageResponse.statusText}` },
        502
      );
    }
    console.log("[extract-menu] image fetch succeeded, content-type:", imageResponse.headers.get("content-type"));

    const imageBytes = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(imageBytes);
    const maxBytes = 4 * 1024 * 1024;
    if (bytes.length > maxBytes) {
      return jsonResponse({ error: "Image too large (max 4MB)" }, 400);
    }

    const chunkSize = 4096;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Image = btoa(binary);
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    const requestBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            {
              text: "Extract the menu from this image. Return only the JSON object with categories and menu_items as specified.",
            },
            { inlineData: { mimeType: contentType, data: base64Image } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    const modelIds = await listGenerativeModels(apiKey);

    let geminiResponse: Response | null = null;
    let lastModel = "";
    let lastErrText = "";

    for (let i = 0; i < modelIds.length; i++) {
      const model = modelIds[i];
      lastModel = model;
      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      console.log("[extract-menu] Gemini generateContent try", i + 1, "/", modelIds.length, "model:", model);

      geminiResponse = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(requestBody),
        },
        120000
      );

      console.log("[extract-menu] Gemini response status:", geminiResponse.status, "model:", model);

      if (geminiResponse.ok) break;

      lastErrText = await geminiResponse.text();
      console.error("[extract-menu] Gemini error body:", lastErrText.slice(0, 500));

      const tryNext = geminiResponse.status === 404 || geminiResponse.status === 400;
      if (tryNext && i < modelIds.length - 1) {
        console.log("[extract-menu] Trying next model…");
        continue;
      }

      return jsonResponse(
        {
          error:
            `Gemini API error (${model}): ${geminiResponse.status} — ${lastErrText.slice(0, 400)}. ` +
            `If 404: create an API key in Google AI Studio (https://aistudio.google.com/apikey) for the Generative Language API, ` +
            `not Vertex-only. Redeploy after setting GOOGLE_GEMINI_API_KEY.`,
        },
        502
      );
    }

    if (!geminiResponse?.ok) {
      return jsonResponse(
        {
          error: `Gemini request failed after trying ${modelIds.length} model(s). Last: ${lastModel} — ${lastErrText.slice(0, 300)}`,
        },
        502
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await geminiResponse.json();
    } catch (parseErr) {
      console.error("[extract-menu] Failed to parse Gemini response JSON:", parseErr);
      return jsonResponse({ error: "Invalid JSON from Gemini API" }, 502);
    }

    const content =
      (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content
        ?.parts?.[0]?.text || "{}";

    let parsed: unknown;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned || "{}");
    } catch (e) {
      console.error("[extract-menu] Failed to parse model output as JSON:", e);
      console.log("[extract-menu] Raw snippet:", content?.slice(0, 300));
      return jsonResponse({ error: "Model returned invalid JSON. Try a clearer menu photo." }, 502);
    }

    const { items } = normalizeMenuItems(parsed);
    console.log("[extract-menu] normalized items count:", items.length, "model:", lastModel);

    return jsonResponse({ items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[extract-menu] unhandled:", error);
    return jsonResponse({ error: msg }, 500);
  }
});

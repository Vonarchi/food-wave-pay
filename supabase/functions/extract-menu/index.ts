import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATIC_MODEL_FALLBACK = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
] as const;

type GeminiModelMeta = {
  name?: string;
  supportedGenerationMethods?: string[];
};

type ApiItem = {
  category_name?: string;
  category?: string;
  name?: string;
  item_name?: string;
  title?: string;
  dish?: string;
  item?: string;
  description?: string;
  price?: number | string;
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** User-facing hint when Google returns INVALID_ARGUMENT for the Generative Language API key. */
const GEMINI_KEY_SETUP_MESSAGE =
  "Fix: In Supabase Dashboard → Project Settings → Edge Functions → Secrets, set GOOGLE_GEMINI_API_KEY to a new key from https://aistudio.google.com/apikey (copy the full key, no quotes or spaces). Save, then run: supabase functions deploy extract-menu --project-ref awryxczjacqrgjlctrjc";

function isGeminiInvalidApiKeyError(status: number, body: string): boolean {
  if (status !== 400 && status !== 403) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("please pass a valid api key") ||
    lower.includes("invalid api key")
  );
}

async function listGenerativeModels(apiKey: string): Promise<string[]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetchWithTimeout(url, {}, 15000);
    if (!response.ok) {
      const errorText = await readResponseText(response);
      console.warn("[extract-menu] models.list failed:", response.status, errorText.slice(0, 300));
      return [...STATIC_MODEL_FALLBACK];
    }

    const payload = (await response.json()) as { models?: GeminiModelMeta[] };
    const modelIds = (payload.models || [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => (model.name || "").replace(/^models\//, ""))
      .filter(Boolean);

    if (modelIds.length === 0) {
      console.warn("[extract-menu] models.list returned no usable generateContent models");
      return [...STATIC_MODEL_FALLBACK];
    }

    const flashModels = modelIds.filter((id) => /flash/i.test(id));
    const otherModels = modelIds.filter((id) => !/flash/i.test(id));
    return [...flashModels, ...otherModels];
  } catch (error) {
    console.warn("[extract-menu] models.list request failed:", error);
    return [...STATIC_MODEL_FALLBACK];
  }
}

function coercePrice(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickItemName(row: ApiItem): string {
  const candidates = [
    row.name,
    row.item_name,
    row.title,
    row.dish,
    typeof row.item === "string" ? row.item : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Collect menu rows from Gemini / loosely-shaped JSON */
function collectRawMenuRows(parsed: unknown): ApiItem[] {
  if (parsed == null) return [];

  if (Array.isArray(parsed)) {
    return parsed.filter((x) => x && typeof x === "object") as ApiItem[];
  }

  if (typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const keys = ["menu_items", "items", "menuItems", "dishes", "foods", "entries"] as const;
  for (const k of keys) {
    const arr = obj[k];
    if (Array.isArray(arr)) return arr.filter((x) => x && typeof x === "object") as ApiItem[];
  }

  for (const val of Object.values(obj)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const first = val[0];
    if (first && typeof first === "object" && pickItemName(first as ApiItem)) {
      return val as ApiItem[];
    }
  }

  return [];
}

function normalizeMenuItems(parsed: unknown): { items: object[] } {
  const rawItems = collectRawMenuRows(parsed);

  const items = rawItems
    .map((row) => {
      const name = pickItemName(row);
      if (!name) return null;

      const categorySource = row.category_name || row.category || "Main";
      const category = typeof categorySource === "string" ? categorySource.trim() || "Main" : "Main";
      const description = typeof row.description === "string" ? row.description.trim() : "";
      const price = coercePrice(row.price);

      return {
        name,
        description,
        price,
        category,
      };
    })
    .filter(Boolean);

  return { items: items as object[] };
}

const SYSTEM_PROMPT = `You extract restaurant menu items from menu photos.

Return JSON only. Do not return markdown.

Preferred shape:
{
  "menu_items": [
    {
      "category_name": "Mains",
      "name": "Burger",
      "description": "Optional description",
      "price": 12.99
    }
  ]
}

Rules:
- Extract only items visible in the image.
- Use category headings when visible; otherwise infer simple categories like Appetizers, Mains, Sides, Drinks, Desserts.
- Every item MUST include string "name" and numeric "price" (use 0 if unreadable).
- description should be an empty string if not clearly shown.
- price must be a JSON number when possible; strings like "12.99" are acceptable.
- Do not invent items or extra fields.
- Put all dishes inside the "menu_items" array only.`;

serve(async (req) => {
  console.log("[extract-menu] incoming", req.method, new Date().toISOString());

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

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      return jsonResponse({ error: "Image URL is required and must be a valid HTTP(S) URL" }, 400);
    }

    const rawKey =
      Deno.env.get("GOOGLE_GEMINI_API_KEY")?.trim() ||
      Deno.env.get("GEMINI_API_KEY")?.trim();
    const apiKey = rawKey || undefined;
    if (!apiKey) {
      return jsonResponse(
        {
          error:
            "No Gemini API key in Edge secrets. In Supabase: set GOOGLE_GEMINI_API_KEY (preferred) or GEMINI_API_KEY to a key from https://aistudio.google.com/apikey (paste only the key, no quotes). Then redeploy extract-menu.",
        },
        500,
      );
    }

    console.log("[extract-menu] imageUrl received");

    let imageResponse: Response;
    try {
      imageResponse = await fetchWithTimeout(
        imageUrl,
        { headers: { "User-Agent": "KioKitchen-ExtractMenu/1.0" } },
        20000,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch image";
      return jsonResponse({ error: `Image fetch failed: ${message}` }, 502);
    }

    if (!imageResponse.ok) {
      return jsonResponse(
        { error: `Image fetch failed: ${imageResponse.status} ${imageResponse.statusText}` },
        502,
      );
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (imageBytes.length > 4 * 1024 * 1024) {
      return jsonResponse({ error: "Image too large (max 4MB)" }, 400);
    }

    let binary = "";
    const chunkSize = 4096;
    for (let i = 0; i < imageBytes.length; i += chunkSize) {
      const chunk = imageBytes.subarray(i, Math.min(i + chunkSize, imageBytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const base64Image = btoa(binary);
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    const requestBody = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [
            {
              text: "Extract the menu from this image. Return JSON only.",
            },
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
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
    let lastErrorText = "";

    for (let index = 0; index < modelIds.length; index += 1) {
      const model = modelIds[index];
      lastModel = model;

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

      geminiResponse = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
        },
        120000,
      );

      if (geminiResponse.ok) {
        break;
      }

      lastErrorText = await readResponseText(geminiResponse);
      console.error("[extract-menu] Gemini error:", model, geminiResponse.status, lastErrorText.slice(0, 500));

      if (isGeminiInvalidApiKeyError(geminiResponse.status, lastErrorText)) {
        return jsonResponse(
          {
            error: `Google Gemini API key is invalid or revoked. ${GEMINI_KEY_SETUP_MESSAGE}`,
          },
          502,
        );
      }

      const shouldTryNextModel =
        (geminiResponse.status === 400 || geminiResponse.status === 404) &&
        index < modelIds.length - 1;

      if (shouldTryNextModel) {
        continue;
      }

      return jsonResponse(
        {
          error:
            `Gemini API error (${model}): ${geminiResponse.status} ${lastErrorText.slice(0, 600)}` ||
            `Gemini API error (${model}): ${geminiResponse.status}`,
        },
        502,
      );
    }

    if (!geminiResponse?.ok) {
      return jsonResponse(
        {
          error:
            `Gemini request failed after trying ${modelIds.length} model(s). Last model: ${lastModel}. ${lastErrorText.slice(0, 600)}`,
        },
        502,
      );
    }

    const payload = (await geminiResponse.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const blockReason = payload.promptFeedback?.blockReason;
    if (blockReason) {
      console.warn("[extract-menu] prompt blocked:", blockReason);
      return jsonResponse(
        {
          error: `Model blocked this image (${blockReason}). Try a different photo or cropping; menu text must be clearly visible.`,
        },
        502,
      );
    }

    const candidate = payload.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
      console.warn("[extract-menu] finishReason (still attempting parse):", finish);
    }

    const parts = candidate?.content?.parts ?? [];
    const content = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim() || "{}";

    if (content === "{}" || !content.length) {
      console.error("[extract-menu] Empty model text; candidates:", JSON.stringify(payload.candidates).slice(0, 400));
      return jsonResponse({ error: "Model returned empty content. Try again or use a clearer menu photo." }, 502);
    }

    let parsed: unknown;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned || "{}");
    } catch (error) {
      console.error("[extract-menu] Failed to parse Gemini JSON:", error);
      console.log("[extract-menu] Raw Gemini content:", content.slice(0, 800));
      return jsonResponse({ error: "Model returned invalid JSON. Try a clearer menu photo." }, 502);
    }

    const normalized = normalizeMenuItems(parsed);
    console.log("[extract-menu] extracted items:", normalized.items.length);

    if (normalized.items.length === 0) {
      const topKeys =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.keys(parsed as object).join(", ")
          : Array.isArray(parsed)
            ? `array(len=${parsed.length})`
            : String(typeof parsed);
      console.warn("[extract-menu] zero items after normalize; top-level:", topKeys, "sample:", content.slice(0, 400));
      return jsonResponse({
        items: [],
        error:
          `No dishes could be read from the model output (shape: ${topKeys}). Check extract-menu logs in Supabase, or retry with a sharper, well-lit photo.`,
      });
    }

    return jsonResponse(normalized);
  } catch (error) {
    console.error("[extract-menu] unhandled:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

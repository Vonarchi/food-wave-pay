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
  description?: string;
  price?: number;
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

function normalizeMenuItems(parsed: unknown): { items: object[] } {
  let rawItems: ApiItem[] = [];

  if (Array.isArray(parsed)) {
    rawItems = parsed as ApiItem[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.menu_items)) rawItems = obj.menu_items as ApiItem[];
    else if (Array.isArray(obj.items)) rawItems = obj.items as ApiItem[];
  }

  const items = rawItems
    .map((row) => {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;

      const categorySource = row.category_name || row.category || "Main";
      const category = typeof categorySource === "string" ? categorySource.trim() || "Main" : "Main";
      const description = typeof row.description === "string" ? row.description.trim() : "";
      const price = typeof row.price === "number" && !Number.isNaN(row.price) ? row.price : 0;

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
- description should be an empty string if not clearly shown.
- price must be a number only, no currency symbol.
- If a price is unreadable, use 0.
- Do not invent items or extra fields.`;

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

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      return jsonResponse({ error: "Image URL is required and must be a valid HTTP(S) URL" }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        {
          error:
            "GOOGLE_GEMINI_API_KEY is not set. Run: supabase secrets set GOOGLE_GEMINI_API_KEY=your_key and redeploy extract-menu.",
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
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsed: unknown;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned || "{}");
    } catch (error) {
      console.error("[extract-menu] Failed to parse Gemini JSON:", error);
      console.log("[extract-menu] Raw Gemini content:", content.slice(0, 500));
      return jsonResponse({ error: "Model returned invalid JSON. Try a clearer menu photo." }, 502);
    }

    const normalized = normalizeMenuItems(parsed);
    console.log("[extract-menu] extracted items:", normalized.items.length);

    return jsonResponse(normalized);
  } catch (error) {
    console.error("[extract-menu] unhandled:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing menu image:", imageUrl);

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const imageBytes = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(imageBytes);
    const chunkSize = 4096;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Image = btoa(binary);
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `You are an expert at extracting menu items from restaurant menu images. 
Extract all menu items and return them as a JSON array. 
For each item, include: name, description (if visible), price (as a number, not string), and category.
If a price is not clearly visible, estimate based on similar items or use 0.
Group items by logical categories (Appetizers, Mains, Sides, Drinks, Desserts, etc.).
Return ONLY valid JSON, no markdown or explanation.

Example format:
[
  {"name": "Burger", "description": "Classic beef patty with lettuce and tomato", "price": 12.99, "category": "Mains"},
  {"name": "Fries", "description": "Crispy golden fries", "price": 4.99, "category": "Sides"}
]`,
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  text: "Extract all menu items from this menu image. Return only valid JSON array.",
                },
                {
                  inlineData: {
                    mimeType: contentType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Response received");

    const content =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Try to parse the JSON from the response
    let menuItems;
    try {
      const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      menuItems = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse menu items:", parseError);
      console.log("Raw content:", content);
      menuItems = [];
    }

    console.log(`Extracted ${menuItems.length} menu items`);

    return new Response(
      JSON.stringify({ items: menuItems }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing menu:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

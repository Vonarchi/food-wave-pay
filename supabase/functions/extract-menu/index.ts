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

    console.log("Processing menu image:", imageUrl);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting menu items from restaurant menu images. 
Extract all menu items and return them as a JSON array. 
For each item, include: name, description (if visible), price (as a number, not string), and category.
If a price is not clearly visible, estimate based on similar items or use 0.
Group items by logical categories (Appetizers, Mains, Sides, Drinks, Desserts, etc.).
Return ONLY valid JSON, no markdown or explanation.

Example format:
[
  {"name": "Burger", "description": "Classic beef patty with lettuce and tomato", "price": 12.99, "category": "Mains"},
  {"name": "Fries", "description": "Crispy golden fries", "price": 4.99, "category": "Sides"}
]`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all menu items from this menu image. Return only valid JSON array."
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Response received");

    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Try to parse the JSON from the response
    let menuItems;
    try {
      // Handle case where response might have markdown code blocks
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

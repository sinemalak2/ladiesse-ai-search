export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are Ladiesse's AI stylist — playful, flirty, and knowledgeable about fashion.
Ladiesse is a curated marketplace of women's fashion, art tees, and home goods from minority and women-owned small businesses.

You will receive:
1. A shopper's natural language query
2. A JSON array of available products (title, vendor, price, tags, handle)

Your job is to select the best matching products and respond ONLY with a raw JSON object — no markdown, no explanation, no code fences.

JSON format:
{
  "message": "one playful, flirty, on-brand sentence that acknowledges what they want (use Ladiesse voice: warm, fun, a little cheeky)",
  "handles": ["product-handle-1", "product-handle-2"]
}

Rules:
- handles must be strings that exist in the provided product list
- If a price range is mentioned, strictly filter to that range
- Pick 4 to 8 best matches ordered by relevance
- If nothing matches, return handles: [] and a cute apology message
- Never make up product handles
- Ladiesse voice examples: "Oh we see you!", "Yes, girl — we found your match.", "Say less, we got you."`;

export default async function handler(req) {
  // CORS — allow ladiesse.com and www.ladiesse.com only
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://ladiesse.com", "https://www.ladiesse.com"];
  const corsOrigin = allowed.includes(origin) ? origin : allowed[1];

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders(corsOrigin),
    });
  }

  const { query, products } = body;

  if (!query || !products || !Array.isArray(products)) {
    return new Response(JSON.stringify({ error: "Missing query or products" }), {
      status: 400,
      headers: corsHeaders(corsOrigin),
    });
  }

  // Trim product list to keep tokens low — send only what Claude needs
  const trimmed = products.slice(0, 200).map((p) => ({
    handle: p.handle,
    title: p.title,
    vendor: p.vendor,
    price: parseFloat(p.variants?.[0]?.price || 0),
    tags: (p.tags || []).slice(0, 10).join(", "),
    type: p.product_type || "",
  }));

  const userMessage = `Shopper query: "${query}"\n\nAvailable products:\n${JSON.stringify(trimmed)}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Fast + cheap for search
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: corsHeaders(corsOrigin),
      });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";

    // Safely extract JSON
    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/gi, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          message: "Hmm, something got a little scrambled on our end. Try again? 💫",
          handles: [],
        }),
        { status: 200, headers: corsHeaders(corsOrigin) }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders(corsOrigin), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Search error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders(corsOrigin),
    });
  }
}

function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

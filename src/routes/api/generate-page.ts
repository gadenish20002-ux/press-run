import type { Context } from "hono";

type GenerateRequest = {
  service: string;
  location: string;
  tone?: string;
  language?: string;
  extraInstructions?: string;
};

type GeneratedPage = {
  title: string;
  meta_description: string;
  h1: string;
  intro: string;
  why_us: string[];
  services: { name: string; description: string }[];
  local_section: string;
  faq: { q: string; a: string }[];
  cta: string;
  slug: string;
};

const SYSTEM_PROMPT = `You are an expert SEO copywriter generating high-quality, unique programmatic landing pages for local businesses.

You will receive a service description and a target location. Generate a complete landing page that:
- Is genuinely unique to that location (mention real neighborhoods, landmarks, or local context — be specific, not generic)
- Has natural, conversational copy — NOT keyword-stuffed
- Targets the search intent of someone in that location looking for that service
- Uses local angle authentically

Return ONLY valid JSON matching this exact shape:
{
  "title": "SEO title tag, 50-60 chars, includes service + location",
  "meta_description": "Meta description, 140-160 chars, compelling CTA",
  "h1": "Main page heading, includes service + location naturally",
  "intro": "2-3 sentence opening paragraph hooking the local visitor",
  "why_us": ["benefit 1", "benefit 2", "benefit 3", "benefit 4"],
  "services": [
    {"name": "Service 1", "description": "1-2 sentences"},
    {"name": "Service 2", "description": "1-2 sentences"},
    {"name": "Service 3", "description": "1-2 sentences"}
  ],
  "local_section": "A paragraph (3-5 sentences) specifically about serving this location — mention real neighborhood names, landmarks, or local context where appropriate",
  "faq": [
    {"q": "Local-relevant question 1", "a": "1-2 sentence answer"},
    {"q": "Local-relevant question 2", "a": "1-2 sentence answer"},
    {"q": "Local-relevant question 3", "a": "1-2 sentence answer"}
  ],
  "cta": "Final call-to-action sentence",
  "slug": "url-slug-with-service-and-location"
}

Strict rules:
- Output must be valid JSON only, no markdown fences, no commentary
- Match the requested language exactly
- Be specific about the location — generic copy is a failure`;

async function callZo(prompt: string): Promise<GeneratedPage> {
  const apiKey = process.env.ZO_API_KEY;
  if (!apiKey) {
    throw new Error("ZO_API_KEY env var not set. Add it in Settings > Advanced.");
  }

  const response = await fetch("https://api.zo.computer/zo/ask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: `${SYSTEM_PROMPT}\n\n---\n\nNow generate the page for:\n\n${prompt}`,
      output_format: {
        type: "object",
        properties: {
          title: { type: "string" },
          meta_description: { type: "string" },
          h1: { type: "string" },
          intro: { type: "string" },
          why_us: { type: "array", items: { type: "string" } },
          services: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
              required: ["name", "description"],
            },
          },
          local_section: { type: "string" },
          faq: {
            type: "array",
            items: {
              type: "object",
              properties: {
                q: { type: "string" },
                a: { type: "string" },
              },
              required: ["q", "a"],
            },
          },
          cta: { type: "string" },
          slug: { type: "string" },
        },
        required: [
          "title",
          "meta_description",
          "h1",
          "intro",
          "why_us",
          "services",
          "local_section",
          "faq",
          "cta",
          "slug",
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zo API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.output as GeneratedPage;
}

export default async (c: Context) => {
  try {
    const body = (await c.req.json()) as GenerateRequest;
    const { service, location, tone, language, extraInstructions } = body;

    if (!service || !location) {
      return c.json({ error: "service and location are required" }, 400);
    }

    const prompt = [
      `SERVICE: ${service}`,
      `LOCATION: ${location}`,
      `LANGUAGE: ${language || "English"}`,
      `TONE: ${tone || "Professional, friendly, locally rooted"}`,
      extraInstructions ? `EXTRA INSTRUCTIONS: ${extraInstructions}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const page = await callZo(prompt);
    return c.json({ ok: true, page });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-page error:", message);
    return c.json({ ok: false, error: message }, 500);
  }
};

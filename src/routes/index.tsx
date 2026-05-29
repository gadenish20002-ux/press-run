import { useState, useMemo, useEffect, useRef } from "react";

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

type Row = {
  location: string;
  status: "pending" | "generating" | "done" | "error";
  page?: GeneratedPage;
  error?: string;
};

/* --------------------------------------------------------------------------
   PALETTE — "Press Run" — set as if hand-mixed on the make-ready table.
   -------------------------------------------------------------------------- */
const palette = {
  paper: "#f3ecdd",
  paperDeep: "#ebe1cb",
  paperEdge: "#d8caa9",
  ink: "#171310",
  inkSoft: "#3a3128",
  inkFaded: "#6c5e4b",
  oxblood: "#7d2018",
  oxbloodDeep: "#5a160f",
  sage: "#56624a",
  marginRed: "#c43d2e",
  ochre: "#b88a3e",
};

/* --------------------------------------------------------------------------
   Helpers preserved from the previous build — we still owe the user real HTML
   and CSV exports. No need to redesign data plumbing.
   -------------------------------------------------------------------------- */
function buildHtml(p: GeneratedPage): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.meta_description)}" />
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a; line-height: 1.7; background: #fbf8f1; }
  h1 { font-size: 2.4rem; margin: 0 0 16px; line-height: 1.15; letter-spacing: -0.01em; }
  h2 { font-size: 1.35rem; margin-top: 36px; letter-spacing: -0.005em; }
  ul { padding-left: 20px; }
  .cta { background: #171310; color: #fbf8f1; padding: 14px 22px; display: inline-block; text-decoration: none; margin-top: 18px; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.85rem; }
  .faq dt { font-weight: 700; margin-top: 16px; }
  .faq dd { margin: 6px 0 0; color: #4a4138; }
  .services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
  @media (max-width: 600px) { .services-grid { grid-template-columns: 1fr; } }
  .service { padding: 16px; border-top: 2px solid #171310; }
  .service-name { font-weight: 700; }
</style>
</head>
<body>
  <h1>${esc(p.h1)}</h1>
  <p>${esc(p.intro)}</p>
  <h2>Why choose us</h2>
  <ul>
    ${p.why_us.map((b) => `<li>${esc(b)}</li>`).join("\n    ")}
  </ul>
  <h2>Our services</h2>
  <div class="services-grid">
    ${p.services
      .map(
        (s) =>
          `<div class="service"><div class="service-name">${esc(s.name)}</div><div>${esc(
            s.description,
          )}</div></div>`,
      )
      .join("\n    ")}
  </div>
  <h2>Serving the area</h2>
  <p>${esc(p.local_section)}</p>
  <h2>Frequently asked questions</h2>
  <dl class="faq">
    ${p.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("\n    ")}
  </dl>
  <p><a href="#contact" class="cta">${esc(p.cta)}</a></p>
</body>
</html>`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: Row[]): string {
  const header = [
    "location",
    "slug",
    "title",
    "meta_description",
    "h1",
    "intro",
    "why_us",
    "services_json",
    "local_section",
    "faq_json",
    "cta",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    if (row.status !== "done" || !row.page) continue;
    const p = row.page;
    lines.push(
      [
        csvEscape(row.location),
        csvEscape(p.slug),
        csvEscape(p.title),
        csvEscape(p.meta_description),
        csvEscape(p.h1),
        csvEscape(p.intro),
        csvEscape(p.why_us.join(" | ")),
        csvEscape(JSON.stringify(p.services)),
        csvEscape(p.local_section),
        csvEscape(JSON.stringify(p.faq)),
        csvEscape(p.cta),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function downloadBlob(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------------------
   Type-setting helpers
   -------------------------------------------------------------------------- */
function romanize(num: number): string {
  if (num <= 0) return "";
  const lookup: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let r = "";
  for (const [v, s] of lookup) {
    while (num >= v) { r += s; num -= v; }
  }
  return r;
}

function folio(n: number): string {
  return `№\u202f${n.toString().padStart(3, "0")}`;
}

function todayParts() {
  const d = new Date();
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const days = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
  // Edition derived from day-of-year — gives a stable, plausible-looking serial.
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return {
    weekday: days[d.getDay()],
    month: months[d.getMonth()],
    day: d.getDate(),
    year: d.getFullYear(),
    yearRoman: romanize(d.getFullYear()),
    edition: Math.floor(diff),
  };
}

/* --------------------------------------------------------------------------
   Paper-grain SVG, inlined as a data URI. Cheap atmosphere, no extra fetch.
   -------------------------------------------------------------------------- */
const paperGrain =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'>
      <filter id='n'>
        <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/>
        <feColorMatrix values='0 0 0 0 0.09  0 0 0 0 0.075  0 0 0 0 0.05  0 0 0 0.14 0'/>
      </filter>
      <rect width='100%' height='100%' filter='url(#n)' opacity='1'/>
    </svg>`,
  );

/* --------------------------------------------------------------------------
   Glyphs used as in-line ornament.
   -------------------------------------------------------------------------- */
const Pilcrow = ({ size = 14, color = palette.oxblood }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M16 4H10C7.79 4 6 5.79 6 8C6 10.21 7.79 12 10 12H12V20" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M16 4V20" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const Fleuron = ({ size = 18, color = palette.oxblood }: { size?: number; color?: string }) => (
  <span style={{ color, fontSize: size, lineHeight: 1, letterSpacing: 0 }} aria-hidden="true">
    ❦
  </span>
);

const SectionMark = ({ color = palette.inkFaded }: { color?: string }) => (
  <span style={{ color, fontFamily: "Fraunces, serif", fontStyle: "italic", letterSpacing: 0 }} aria-hidden="true">
    §
  </span>
);

/* --------------------------------------------------------------------------
   Page component
   -------------------------------------------------------------------------- */
export default function PressRun() {
  // Inject the font stack once on mount. Fraunces variable + Instrument Sans
  // + JetBrains Mono. No npm install required; loads from Google Fonts.
  useEffect(() => {
    if (document.getElementById("press-run-fonts")) return;
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "anonymous";
    const link = document.createElement("link");
    link.id = "press-run-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:ital,wght@0,400..700;1,400..700&display=swap";
    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(link);
  }, []);

  const [service, setService] = useState(
    "Emergency plumbing — 24/7 leak repair, drain unclogging, water heater installation, pipe replacement",
  );
  const [locationsText, setLocationsText] = useState("Brooklyn, NY\nQueens, NY\nManhattan, NY");
  const [tone, setTone] = useState("Trustworthy local pro, no fluff");
  const [language, setLanguage] = useState("English");
  const [extra, setExtra] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const proofRef = useRef<HTMLDivElement>(null);

  const locations = useMemo(
    () =>
      locationsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    [locationsText],
  );

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const pendingIndex = rows.findIndex((r) => r.status === "generating");
  const dateParts = useMemo(todayParts, []);

  async function generateOne(location: string): Promise<{ page?: GeneratedPage; error?: string }> {
    try {
      const res = await fetch("/api/generate-page", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ service, location, tone, language, extraInstructions: extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { error: data.error || `HTTP ${res.status}` };
      }
      return { page: data.page as GeneratedPage };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function run() {
    setGlobalError(null);
    if (!service.trim() || locations.length === 0) {
      setGlobalError("Set a subject and at least one town before going to press.");
      return;
    }
    setRunning(true);
    const initial: Row[] = locations.map((loc) => ({ location: loc, status: "pending" }));
    setRows(initial);
    setOpenIdx(null);

    for (let i = 0; i < locations.length; i++) {
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, status: "generating" } : r)));
      const result = await generateOne(locations[i]);
      setRows((prev) =>
        prev.map((r, j) =>
          j === i
            ? {
                ...r,
                status: result.error ? "error" : "done",
                page: result.page,
                error: result.error,
              }
            : r,
        ),
      );
      // Auto-open the first successful proof for instant gratification.
      if (!result.error && openIdx === null) {
        setOpenIdx(i);
      }
    }
    setRunning(false);
  }

  function copyHtml(idx: number) {
    const r = rows[idx];
    if (!r.page) return;
    navigator.clipboard.writeText(buildHtml(r.page));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  function downloadHtml(idx: number) {
    const r = rows[idx];
    if (!r.page) return;
    downloadBlob(buildHtml(r.page), `${r.page.slug || "page"}.html`, "text/html");
  }

  function downloadAllCsv() {
    if (!rows.some((r) => r.status === "done")) return;
    downloadBlob(buildCsv(rows), "press-run.csv", "text/csv");
  }

  // Stable fonts as inline strings — referenced via style={{ fontFamily }}
  const F_DISPLAY = '"Fraunces", "Times New Roman", Georgia, serif';
  const F_SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';
  const F_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

  return (
    <main
      style={{
        minHeight: "100vh",
        background: palette.paper,
        color: palette.ink,
        fontFamily: F_SANS,
        backgroundImage: `url("${paperGrain}"), radial-gradient(ellipse at 18% 12%, ${palette.paperDeep} 0%, ${palette.paper} 38%, ${palette.paperEdge} 110%)`,
        backgroundSize: "260px 260px, auto",
        backgroundBlendMode: "multiply, normal",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes prInk {
          0% { opacity: 0; transform: translateY(10px) rotate(-0.4deg); filter: blur(2px); }
          60% { filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) rotate(0); filter: blur(0); }
        }
        @keyframes prMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes prBlink {
          0%, 64% { opacity: 1; }
          65%, 100% { opacity: 0.18; }
        }
        @keyframes prRoller {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(0); }
        }
        .pr-reveal { animation: prInk 520ms cubic-bezier(.18,.7,.2,1) both; }
        .pr-marquee { animation: prMarquee 38s linear infinite; }
        .pr-blink { animation: prBlink 1.6s steps(1, end) infinite; }
        .pr-field {
          background: transparent;
          color: ${palette.ink};
          border: none;
          border-bottom: 1.5px solid ${palette.ink};
          padding: 8px 2px 6px;
          font-family: ${F_DISPLAY};
          font-size: 1.05rem;
          font-weight: 400;
          width: 100%;
          outline: none;
          transition: border-color 160ms ease, background 160ms ease;
        }
        .pr-field::placeholder { color: ${palette.inkFaded}; opacity: 0.7; font-style: italic; }
        .pr-field:focus { border-bottom-color: ${palette.oxblood}; background: rgba(125,32,24,0.04); }
        textarea.pr-field { border: 1.5px solid ${palette.ink}; padding: 12px 14px; line-height: 1.5; }
        textarea.pr-field:focus { border-color: ${palette.oxblood}; background: rgba(125,32,24,0.03); }
        .pr-label {
          font-family: ${F_SANS};
          font-size: 10.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: ${palette.inkSoft};
          display: block;
          margin-bottom: 6px;
        }
        .pr-rule { border: 0; border-top: 1px solid ${palette.ink}; opacity: 0.9; }
        .pr-rule-thick { border: 0; border-top: 3px solid ${palette.ink}; }
        .pr-rule-double {
          border: 0;
          height: 7px;
          background: linear-gradient(${palette.ink}, ${palette.ink}) top/100% 1px no-repeat,
                      linear-gradient(${palette.ink}, ${palette.ink}) bottom/100% 1px no-repeat;
        }
        .pr-press-lever {
          font-family: ${F_DISPLAY};
          font-weight: 600;
          font-variation-settings: "opsz" 144, "SOFT" 30;
          letter-spacing: 0.02em;
          background: ${palette.ink};
          color: ${palette.paper};
          border: none;
          padding: 18px 22px 16px;
          width: 100%;
          font-size: 1.7rem;
          line-height: 1;
          cursor: pointer;
          position: relative;
          transition: transform 120ms ease, background 200ms ease;
          box-shadow:
            inset 0 0 0 2px ${palette.ink},
            inset 0 0 0 4px ${palette.paper},
            inset 0 0 0 5px ${palette.ink},
            6px 6px 0 ${palette.oxblood};
        }
        .pr-press-lever:hover:not(:disabled) {
          background: ${palette.oxbloodDeep};
          transform: translate(-2px, -2px);
          box-shadow:
            inset 0 0 0 2px ${palette.oxbloodDeep},
            inset 0 0 0 4px ${palette.paper},
            inset 0 0 0 5px ${palette.oxbloodDeep},
            10px 10px 0 ${palette.oxblood};
        }
        .pr-press-lever:active:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow:
            inset 0 0 0 2px ${palette.ink},
            inset 0 0 0 4px ${palette.paper},
            inset 0 0 0 5px ${palette.ink},
            2px 2px 0 ${palette.oxblood};
        }
        .pr-press-lever:disabled {
          cursor: wait;
          opacity: 0.85;
        }
        .pr-toc-row {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: baseline;
          gap: 12px;
          padding: 14px 0;
          border-bottom: 1px dotted ${palette.inkFaded};
          font-family: ${F_DISPLAY};
          font-size: 1.05rem;
          color: ${palette.ink};
          cursor: pointer;
          text-align: left;
          width: 100%;
          background: transparent;
          border-left: 0; border-right: 0; border-top: 0;
        }
        .pr-toc-row:hover { background: rgba(125,32,24,0.04); }
        .pr-toc-leader {
          overflow: hidden;
          color: ${palette.inkFaded};
          letter-spacing: 2px;
        }
        .pr-folio {
          font-family: ${F_MONO};
          font-size: 0.8rem;
          letter-spacing: 0.04em;
          color: ${palette.inkFaded};
        }
        .pr-drop {
          float: left;
          font-family: ${F_DISPLAY};
          font-weight: 700;
          font-size: 4.3rem;
          line-height: 0.85;
          padding: 6px 10px 0 0;
          color: ${palette.oxblood};
          font-variation-settings: "opsz" 144, "SOFT" 0;
        }
        .pr-margin-note {
          position: absolute;
          right: -8px;
          top: 4px;
          transform: rotate(-3deg);
          font-family: ${F_DISPLAY};
          font-style: italic;
          font-size: 0.78rem;
          color: ${palette.marginRed};
          background: ${palette.paper};
          padding: 2px 8px;
          border: 1px dashed ${palette.marginRed};
        }
        .pr-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: ${F_MONO};
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 4px 8px;
          border: 1px solid ${palette.ink};
          color: ${palette.ink};
          background: ${palette.paper};
        }
        .pr-pill-red {
          border-color: ${palette.oxblood};
          color: ${palette.oxblood};
        }
        .pr-pill-sage {
          border-color: ${palette.sage};
          color: ${palette.sage};
        }
        .pr-link {
          color: ${palette.ink};
          text-decoration: none;
          border-bottom: 1px solid ${palette.ink};
          padding-bottom: 1px;
          font-family: ${F_SANS};
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: transparent;
          cursor: pointer;
          transition: color 140ms ease, border-color 140ms ease;
        }
        .pr-link:hover { color: ${palette.oxblood}; border-color: ${palette.oxblood}; }
        .pr-link:disabled { opacity: 0.35; cursor: not-allowed; }
        .pr-proof {
          background: ${palette.paper};
          border: 1px solid ${palette.ink};
          padding: 38px clamp(20px, 4vw, 56px) 44px;
          position: relative;
          box-shadow: 14px 14px 0 ${palette.paperEdge}, 14px 14px 0 1px ${palette.ink};
        }
        .pr-proof::before {
          content: "";
          position: absolute;
          inset: 6px;
          border: 1px solid ${palette.inkFaded};
          pointer-events: none;
          opacity: 0.4;
        }
        .pr-stamp {
          font-family: ${F_SANS};
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          font-size: 11px;
          color: ${palette.oxblood};
          border: 2px solid ${palette.oxblood};
          padding: 6px 10px;
          display: inline-block;
          transform: rotate(-4deg);
          background: ${palette.paper};
          box-shadow: 2px 2px 0 ${palette.oxblood};
        }
        .pr-headline {
          font-family: ${F_DISPLAY};
          font-weight: 500;
          letter-spacing: -0.025em;
          font-variation-settings: "opsz" 144, "SOFT" 60;
          color: ${palette.ink};
        }
        .pr-italic {
          font-family: ${F_DISPLAY};
          font-style: italic;
          font-variation-settings: "opsz" 144, "SOFT" 100;
        }
        .pr-tag {
          font-family: ${F_MONO};
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: ${palette.inkSoft};
        }
        @media (max-width: 900px) {
          .pr-headline-xl { font-size: 4.4rem !important; line-height: 0.96 !important; }
        }
        @media (max-width: 640px) {
          .pr-headline-xl { font-size: 3.2rem !important; }
          .pr-margin-note { display: none; }
        }
        .pr-shadow-paper {
          box-shadow: 0 1px 0 ${palette.paperEdge}, 6px 6px 0 ${palette.paperEdge};
        }
      `}</style>

      {/* ============================== MASTHEAD ============================== */}
      <header style={{ borderBottom: `3px solid ${palette.ink}`, position: "relative", overflow: "hidden" }}>
        {/* Hairline ticker — runs continuously, like a stock ticker. */}
        <div
          style={{
            background: palette.ink,
            color: palette.paper,
            fontFamily: F_MONO,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "5px 0",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div className="pr-marquee" style={{ whiteSpace: "nowrap", display: "inline-block" }}>
            {Array.from({ length: 2 }).map((_, k) => (
              <span key={k} style={{ paddingRight: 40 }}>
                {[
                  `▸ PRESS RUN  ·  Volume I  ·  Issue ${dateParts.edition}`,
                  `▸ Set in Fraunces, Instrument Sans, &amp; JetBrains Mono`,
                  `▸ One subject. Many towns. Unique copy on every plate.`,
                  `▸ ${dateParts.weekday} ${dateParts.day} ${dateParts.month} ${dateParts.yearRoman}`,
                  `▸ Going to press at the rate of one page per breath`,
                ].map((t, i) => (
                  <span key={i} style={{ paddingRight: 40 }} dangerouslySetInnerHTML={{ __html: t }} />
                ))}
              </span>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 28px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 20,
              fontFamily: F_MONO,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.inkSoft,
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div>Edition Nº {dateParts.edition.toString().padStart(3, "0")}</div>
              <div style={{ marginTop: 4 }}>
                Quarto {dateParts.day < 10 ? "0" + dateParts.day : dateParts.day}/{(new Date().getMonth() + 1).toString().padStart(2, "0")}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ background: palette.ink, color: palette.paper, padding: "5px 11px", letterSpacing: "0.22em" }}>
                ESTd. {dateParts.year}
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>{dateParts.weekday}</div>
              <div style={{ marginTop: 4 }}>{dateParts.day} {dateParts.month} · {dateParts.yearRoman}</div>
            </div>
          </div>

          <h1
            style={{
              fontFamily: F_DISPLAY,
              fontWeight: 600,
              fontVariationSettings: '"opsz" 144, "SOFT" 30',
              fontSize: "clamp(3.5rem, 12vw, 8.5rem)",
              lineHeight: 0.85,
              letterSpacing: "-0.04em",
              textAlign: "center",
              margin: "18px 0 6px",
              color: palette.ink,
            }}
          >
            Press<span style={{ color: palette.oxblood, fontStyle: "italic", fontWeight: 500 }}>·</span>Run
          </h1>
          <div
            style={{
              fontFamily: F_DISPLAY,
              fontStyle: "italic",
              textAlign: "center",
              fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
              color: palette.inkSoft,
              letterSpacing: "0.01em",
              marginBottom: 6,
            }}
          >
            a programmatic letterpress for the local search column · printed daily, by request
          </div>

          <hr className="pr-rule-double" style={{ marginTop: 18 }} />
        </div>
      </header>

      {/* ============================== HERO BROADSHEET ============================== */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 28px 24px", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)", gap: 36, alignItems: "end" }} className="pr-hero-grid">
            <div style={{ position: "relative" }}>
              <span className="pr-tag" style={{ display: "inline-block", marginBottom: 14 }}>
                ¶ The lead story
              </span>
              <h2
                className="pr-headline pr-headline-xl"
                style={{
                  fontSize: "clamp(3.6rem, 8.2vw, 7.4rem)",
                  lineHeight: 0.92,
                  margin: 0,
                  letterSpacing: "-0.035em",
                  fontWeight: 500,
                }}
              >
                Set a hundred
                <br />
                local pages{" "}
                <span className="pr-italic" style={{ color: palette.oxblood, fontWeight: 400 }}>
                  to type.
                </span>
              </h2>
              <p
                style={{
                  fontFamily: F_DISPLAY,
                  fontStyle: "italic",
                  fontSize: "clamp(1.05rem, 1.5vw, 1.3rem)",
                  lineHeight: 1.5,
                  color: palette.inkSoft,
                  marginTop: 22,
                  maxWidth: 620,
                }}
              >
                A small press built for SEO agencies and local-service shops. Describe the
                subject once. Drop in the towns. Pull the lever. Walk away with unique copy,
                title, meta, FAQ, and HTML — the kind of pages that don't read like they were
                typeset by a machine, even though they were.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
                <span className="pr-pill">Unique by town · not find-and-replace</span>
                <span className="pr-pill">Title + meta + H1 + FAQ + local angle</span>
                <span className="pr-pill pr-pill-sage">Export CSV · download HTML</span>
              </div>
            </div>

            {/* Side stack: edition info + colophon-style stat block */}
            <aside
              style={{
                borderLeft: `1px solid ${palette.ink}`,
                paddingLeft: 28,
                fontFamily: F_DISPLAY,
                color: palette.ink,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <span
                  className="pr-blink"
                  style={{ display: "inline-block", width: 8, height: 8, background: palette.oxblood, borderRadius: 1 }}
                />
                <span className="pr-tag" style={{ color: palette.oxblood }}>
                  Press status · warm
                </span>
              </div>

              <Stat label="Plates in the case" value="∞" hint="one per town, on request" />
              <Stat label="Today's run" value={rows.length.toString().padStart(3, "0")} hint={`${doneCount} printed · ${errorCount} spoiled`} />
              <Stat label="Voice" value="Yours" hint="we set what you describe" />
              <Stat label="Galley" value="CSV · HTML" hint="export-ready, single click" />

              <div
                style={{
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: `1px solid ${palette.ink}`,
                  fontFamily: F_MONO,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: palette.inkFaded,
                }}
              >
                ※ Set from a single subject in a half-dozen breaths. Composed in code, finished by hand.
              </div>
            </aside>
          </div>
        </div>

        <hr className="pr-rule" style={{ marginTop: 44 }} />
      </section>

      {/* ============================== TWO-UP: COMPOSING ROOM + RUN ============================== */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "12px 28px 80px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)",
            gap: 56,
            alignItems: "start",
          }}
          className="pr-twoup"
        >
          {/* ----------- COMPOSING ROOM ----------- */}
          <div style={{ position: "sticky", top: 24, alignSelf: "start" }} className="pr-compose">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.22em", color: palette.oxblood }}>I.</span>
              <span className="pr-tag">The composing room</span>
            </div>
            <h3
              className="pr-headline"
              style={{
                fontSize: "2.05rem",
                fontWeight: 500,
                margin: "2px 0 18px",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                position: "relative",
              }}
            >
              Set the type.
              <span className="pr-margin-note">make-ready</span>
            </h3>
            <hr className="pr-rule-thick" style={{ marginBottom: 24 }} />

            <div style={{ marginBottom: 22 }}>
              <label className="pr-label">
                <span style={{ color: palette.oxblood, marginRight: 6 }}>i.</span>The subject
              </label>
              <textarea
                value={service}
                onChange={(e) => setService(e.target.value)}
                rows={3}
                placeholder="What you sell, in plain English — be specific."
                className="pr-field"
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label className="pr-label">
                <span style={{ color: palette.oxblood, marginRight: 6 }}>ii.</span>
                Towns &amp; districts
                <span style={{ color: palette.inkFaded, marginLeft: 8, letterSpacing: "0.08em" }}>· one per line</span>
              </label>
              <textarea
                value={locationsText}
                onChange={(e) => setLocationsText(e.target.value)}
                rows={6}
                placeholder={"Brooklyn, NY\nQueens, NY\nManhattan, NY"}
                className="pr-field"
                style={{ fontFamily: F_MONO, fontSize: "0.9rem", fontStyle: "normal" }}
              />
              <div style={{ marginTop: 6, fontFamily: F_MONO, fontSize: 10.5, color: palette.inkFaded, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {locations.length} plate{locations.length === 1 ? "" : "s"} queued
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
              <div>
                <label className="pr-label">
                  <span style={{ color: palette.oxblood, marginRight: 6 }}>iii.</span>Voice
                </label>
                <input value={tone} onChange={(e) => setTone(e.target.value)} className="pr-field" />
              </div>
              <div>
                <label className="pr-label">
                  <span style={{ color: palette.oxblood, marginRight: 6 }}>iv.</span>Language
                </label>
                <input value={language} onChange={(e) => setLanguage(e.target.value)} className="pr-field" />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label className="pr-label">
                <span style={{ color: palette.oxblood, marginRight: 6 }}>v.</span>
                Editor's note
                <span style={{ color: palette.inkFaded, marginLeft: 8, letterSpacing: "0.08em" }}>· optional</span>
              </label>
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                rows={2}
                placeholder="e.g. open 24/7, family-owned since 1985"
                className="pr-field"
              />
            </div>

            <button
              onClick={run}
              disabled={running || locations.length === 0}
              className="pr-press-lever"
              aria-label={running ? "Pressing" : "Go to press"}
            >
              {running ? (
                <>
                  ON PRESS<span style={{ color: palette.oxblood, marginLeft: 6 }}>·</span>
                  <span style={{ fontSize: "0.85rem", letterSpacing: "0.18em", fontFamily: F_MONO, marginLeft: 8 }}>
                    {(doneCount + errorCount).toString().padStart(3, "0")}/{rows.length.toString().padStart(3, "0")}
                  </span>
                </>
              ) : (
                <>Go to press</>
              )}
              <div
                style={{
                  marginTop: 8,
                  fontFamily: F_MONO,
                  fontSize: 9.5,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: palette.paperDeep,
                  opacity: 0.78,
                  fontWeight: 400,
                }}
              >
                — sets the type. inks the plate. pulls the lever. —
              </div>
            </button>

            {globalError && (
              <div
                style={{
                  marginTop: 18,
                  padding: "12px 14px",
                  border: `1.5px solid ${palette.marginRed}`,
                  background: "rgba(196, 61, 46, 0.06)",
                  fontFamily: F_DISPLAY,
                  fontStyle: "italic",
                  color: palette.marginRed,
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontFamily: F_SANS, fontStyle: "normal", fontWeight: 700, fontSize: 11, letterSpacing: "0.2em" }}>
                  STET ·
                </span>
                <span>{globalError}</span>
              </div>
            )}

            <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", alignItems: "center", color: palette.inkFaded }}>
              <Fleuron />
              <span className="pr-tag">composed in the morning</span>
              <Fleuron />
            </div>
          </div>

          {/* ----------- TODAY'S RUN ----------- */}
          <div ref={proofRef}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.22em", color: palette.oxblood }}>II.</span>
              <span className="pr-tag">Today's run</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <h3
                className="pr-headline"
                style={{
                  fontSize: "2.05rem",
                  fontWeight: 500,
                  margin: "2px 0 6px",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                }}
              >
                The galley.
              </h3>
              <button onClick={downloadAllCsv} disabled={doneCount === 0} className="pr-link" style={{ alignSelf: "center" }}>
                ⇣ Take the whole galley as CSV
              </button>
            </div>
            <hr className="pr-rule-thick" style={{ marginBottom: 18 }} />

            {rows.length === 0 && (
              <EmptyGalley fontDisplay={F_DISPLAY} fontMono={F_MONO} />
            )}

            {rows.length > 0 && (
              <>
                <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: palette.inkSoft }}>
                  <span>Set: <strong style={{ color: palette.ink, fontFamily: F_MONO }}>{rows.length}</strong></span>
                  <span style={{ color: palette.paperEdge }}>·</span>
                  <span>Printed: <strong style={{ color: palette.sage, fontFamily: F_MONO }}>{doneCount}</strong></span>
                  {errorCount > 0 && (
                    <>
                      <span style={{ color: palette.paperEdge }}>·</span>
                      <span>Spoiled: <strong style={{ color: palette.marginRed, fontFamily: F_MONO }}>{errorCount}</strong></span>
                    </>
                  )}
                  {pendingIndex >= 0 && (
                    <>
                      <span style={{ color: palette.paperEdge }}>·</span>
                      <span>On press: <strong style={{ color: palette.oxblood, fontFamily: F_MONO }}>{rows[pendingIndex]?.location}</strong></span>
                    </>
                  )}
                </div>

                <div role="list">
                  {rows.map((row, idx) => (
                    <TocEntry
                      key={idx}
                      row={row}
                      idx={idx}
                      open={openIdx === idx}
                      onToggle={() => setOpenIdx(openIdx === idx ? null : idx)}
                      fontDisplay={F_DISPLAY}
                      fontMono={F_MONO}
                      fontSans={F_SANS}
                      onCopy={() => copyHtml(idx)}
                      onDownload={() => downloadHtml(idx)}
                      copied={copiedIdx === idx}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============================== COLOPHON ============================== */}
      <footer style={{ borderTop: `3px double ${palette.ink}`, background: palette.paperDeep }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "30px 28px 38px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 32,
              fontFamily: F_DISPLAY,
              color: palette.inkSoft,
              fontSize: "0.95rem",
              lineHeight: 1.55,
            }}
            className="pr-colophon"
          >
            <div>
              <div className="pr-tag" style={{ color: palette.oxblood, marginBottom: 10 }}>
                ¶ Colophon
              </div>
              <p style={{ margin: 0 }}>
                <em>Press·Run</em> is set in <strong style={{ fontWeight: 600 }}>Fraunces</strong> (display), <strong style={{ fontWeight: 600 }}>Instrument&nbsp;Sans</strong> (utility), and <strong style={{ fontWeight: 600 }}>JetBrains&nbsp;Mono</strong> (folios &amp; folios alone). Inks mixed by hand: <em>oxblood</em>, <em>sage</em>, and one shade of <em>aged paper</em>.
              </p>
            </div>
            <div>
              <div className="pr-tag" style={{ color: palette.oxblood, marginBottom: 10 }}>
                ❦ The press
              </div>
              <p style={{ margin: 0 }}>
                Each plate is written from the subject you provided. No find-and-replace. No two towns wear the same coat. When the lever falls, every page comes out with its own local angle — neighborhoods, landmarks, a bit of weather.
              </p>
            </div>
            <div>
              <div className="pr-tag" style={{ color: palette.oxblood, marginBottom: 10 }}>
                § Imprint
              </div>
              <p style={{ margin: 0 }}>
                Set, inked, and pulled on <strong style={{ fontWeight: 600 }}>Zo</strong>. Lifted from the $38k MRR pattern of RankAI. Built in one sitting, on purpose. Bring your own subjects.
              </p>
            </div>
          </div>

          <hr className="pr-rule" style={{ margin: "28px 0 14px" }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: F_MONO,
              fontSize: 10.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: palette.inkFaded,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>—  press·run  ·  vol. I  ·  {dateParts.yearRoman}  —</span>
            <span>printed on a quiet morning · all type lock-up · 30·MMXXVI</span>
          </div>
        </div>
      </footer>

      {/* Responsive tweaks for narrow screens */}
      <style>{`
        @media (max-width: 920px) {
          .pr-twoup { grid-template-columns: 1fr !important; gap: 48px !important; }
          .pr-compose { position: relative !important; top: 0 !important; }
          .pr-hero-grid { grid-template-columns: 1fr !important; }
          .pr-colophon { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

/* --------------------------------------------------------------------------
   <Stat> — single line item in the masthead aside.
   -------------------------------------------------------------------------- */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gridTemplateRows: "auto auto",
        alignItems: "baseline",
        paddingBottom: 12,
        marginBottom: 12,
        borderBottom: `1px dotted ${palette.inkFaded}`,
        rowGap: 2,
      }}
    >
      <div
        style={{
          fontFamily: '"Instrument Sans", sans-serif',
          fontSize: 10.5,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: palette.inkSoft,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Fraunces", serif',
          fontWeight: 500,
          fontSize: "1.4rem",
          color: palette.ink,
          fontVariationSettings: '"opsz" 144, "SOFT" 60',
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            gridColumn: "1 / -1",
            fontFamily: '"Fraunces", serif',
            fontStyle: "italic",
            fontSize: "0.78rem",
            color: palette.inkFaded,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   <EmptyGalley> — placeholder while no rows exist.
   -------------------------------------------------------------------------- */
function EmptyGalley({ fontDisplay, fontMono }: { fontDisplay: string; fontMono: string }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "44px 32px",
        border: `1.5px dashed ${palette.ink}`,
        background: `repeating-linear-gradient(0deg, transparent 0, transparent 22px, rgba(23,19,16,0.045) 22px, rgba(23,19,16,0.045) 23px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span className="pr-stamp">to be set</span>
      </div>
      <h4
        className="pr-headline"
        style={{ fontFamily: fontDisplay, fontSize: "1.65rem", fontWeight: 500, lineHeight: 1.15, margin: 0, letterSpacing: "-0.02em" }}
      >
        The galley is still empty.
      </h4>
      <p
        style={{
          fontFamily: fontDisplay,
          fontStyle: "italic",
          color: palette.inkSoft,
          maxWidth: 520,
          margin: "10px 0 0",
          fontSize: "1.05rem",
          lineHeight: 1.5,
        }}
      >
        Set a subject in the composing room, list the towns you want to court, and pull the lever.
        Each plate prints one at a time, then files itself here.
      </p>
      <div
        style={{
          marginTop: 18,
          display: "flex",
          gap: 16,
          fontFamily: fontMono,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: palette.inkFaded,
        }}
      >
        <span>i. set type</span>
        <span>—</span>
        <span>ii. ink the plate</span>
        <span>—</span>
        <span>iii. pull</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   <TocEntry> — single row in the table of contents.
   When open, expands into the full proof sheet.
   -------------------------------------------------------------------------- */
function TocEntry({
  row,
  idx,
  open,
  onToggle,
  onCopy,
  onDownload,
  copied,
  fontDisplay,
  fontMono,
  fontSans,
}: {
  row: Row;
  idx: number;
  open: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
  fontDisplay: string;
  fontMono: string;
  fontSans: string;
}) {
  const status =
    row.status === "done"
      ? "Printed"
      : row.status === "generating"
        ? "On press"
        : row.status === "error"
          ? "Spoiled"
          : "Set";
  const statusColor =
    row.status === "done"
      ? palette.sage
      : row.status === "generating"
        ? palette.oxblood
        : row.status === "error"
          ? palette.marginRed
          : palette.inkFaded;

  return (
    <article className="pr-reveal" style={{ position: "relative" }}>
      <button onClick={onToggle} className="pr-toc-row" aria-expanded={open}>
        <span className="pr-folio">{folio(idx + 1)}</span>
        <span style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ background: palette.paper, paddingRight: 8, fontFamily: fontDisplay, fontWeight: 500 }}>
            {row.location}
          </span>
          <span className="pr-toc-leader">{".".repeat(220)}</span>
        </span>
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: statusColor,
            fontWeight: 600,
          }}
        >
          {row.status === "generating" && <span className="pr-blink" style={{ marginRight: 6 }}>●</span>}
          {status}
        </span>
        <span
          style={{
            fontFamily: fontDisplay,
            fontStyle: "italic",
            color: palette.inkFaded,
            fontSize: "0.95rem",
            paddingLeft: 6,
          }}
        >
          {open ? "—" : "+"}
        </span>
      </button>

      {/* Inline error */}
      {row.status === "error" && row.error && (
        <div
          style={{
            margin: "0 0 18px",
            padding: "10px 14px",
            borderLeft: `3px solid ${palette.marginRed}`,
            background: "rgba(196,61,46,0.06)",
            fontFamily: fontDisplay,
            fontStyle: "italic",
            color: palette.marginRed,
            fontSize: "0.92rem",
          }}
        >
          <strong style={{ fontFamily: fontSans, fontStyle: "normal", fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            Marginalia ·
          </strong>{" "}
          {row.error}
        </div>
      )}

      {/* Expanded proof */}
      {open && row.status === "done" && row.page && (
        <div className="pr-reveal pr-proof" style={{ margin: "10px 0 30px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 22,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: fontMono,
                  fontSize: 10.5,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: palette.inkFaded,
                  marginBottom: 4,
                }}
              >
                Plate {folio(idx + 1)} · {row.location}
              </div>
              <div
                style={{
                  fontFamily: fontMono,
                  fontSize: 11,
                  color: palette.oxblood,
                  letterSpacing: "0.04em",
                }}
              >
                /{row.page.slug}
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button onClick={onCopy} className="pr-link">
                {copied ? "Copied ✓" : "⌘ Copy HTML"}
              </button>
              <button onClick={onDownload} className="pr-link">
                ⇣ Download .html
              </button>
              <span className="pr-stamp">Proof</span>
            </div>
          </div>

          <hr className="pr-rule-double" style={{ marginBottom: 22 }} />

          <ProofField label="Title tag" value={row.page.title} fontDisplay={fontDisplay} fontMono={fontMono} fontSans={fontSans} />
          <ProofField label="Meta description" value={row.page.meta_description} fontDisplay={fontDisplay} fontMono={fontMono} fontSans={fontSans} />

          <h2
            style={{
              fontFamily: fontDisplay,
              fontWeight: 500,
              fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: "26px 0 14px",
              color: palette.ink,
              fontVariationSettings: '"opsz" 144, "SOFT" 60',
            }}
          >
            {row.page.h1}
          </h2>

          <p
            style={{
              fontFamily: fontDisplay,
              fontSize: "1.08rem",
              lineHeight: 1.65,
              color: palette.ink,
              margin: 0,
            }}
          >
            <span className="pr-drop">{row.page.intro.charAt(0)}</span>
            {row.page.intro.slice(1)}
          </p>

          <hr className="pr-rule" style={{ margin: "28px 0 22px" }} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 32,
            }}
            className="pr-proof-grid"
          >
            <div>
              <SectionHeader text="Why us" fontSans={fontSans} />
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontFamily: fontDisplay, fontSize: "1rem", lineHeight: 1.55 }}>
                {row.page.why_us.map((b, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "8px 0", borderBottom: `1px dotted ${palette.inkFaded}` }}>
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: palette.oxblood, letterSpacing: "0.1em" }}>
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionHeader text="Services" fontSans={fontSans} />
              <div style={{ display: "grid", gap: 12 }}>
                {row.page.services.map((s, i) => (
                  <div key={i} style={{ borderTop: `2px solid ${palette.ink}`, paddingTop: 10 }}>
                    <div
                      style={{
                        fontFamily: fontDisplay,
                        fontWeight: 600,
                        fontSize: "1.02rem",
                        marginBottom: 4,
                        fontVariationSettings: '"opsz" 24, "SOFT" 30',
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontFamily: fontDisplay,
                        fontStyle: "italic",
                        fontSize: "0.94rem",
                        color: palette.inkSoft,
                        lineHeight: 1.5,
                      }}
                    >
                      {s.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <hr className="pr-rule" style={{ margin: "28px 0 22px" }} />

          <SectionHeader text="The local angle" fontSans={fontSans} />
          <p
            style={{
              fontFamily: fontDisplay,
              fontSize: "1.02rem",
              lineHeight: 1.65,
              color: palette.ink,
              margin: 0,
              columnCount: 2,
              columnGap: 28,
            }}
            className="pr-local-cols"
          >
            {row.page.local_section}
          </p>

          <hr className="pr-rule" style={{ margin: "28px 0 22px" }} />

          <SectionHeader text="Questions asked, plainly answered" fontSans={fontSans} />
          <dl style={{ margin: 0 }}>
            {row.page.faq.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, paddingBottom: 14, marginBottom: 14, borderBottom: `1px dotted ${palette.inkFaded}` }}>
                <span
                  style={{
                    fontFamily: fontMono,
                    fontSize: 10.5,
                    letterSpacing: "0.12em",
                    color: palette.oxblood,
                    paddingTop: 4,
                  }}
                >
                  Q{(i + 1).toString().padStart(2, "0")}
                </span>
                <div>
                  <dt
                    style={{
                      fontFamily: fontDisplay,
                      fontWeight: 600,
                      fontSize: "1.02rem",
                      letterSpacing: "-0.005em",
                      color: palette.ink,
                    }}
                  >
                    {f.q}
                  </dt>
                  <dd
                    style={{
                      margin: "4px 0 0",
                      fontFamily: fontDisplay,
                      fontStyle: "italic",
                      fontSize: "0.98rem",
                      lineHeight: 1.55,
                      color: palette.inkSoft,
                    }}
                  >
                    {f.a}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          <hr className="pr-rule-double" style={{ margin: "30px 0 24px" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div
              style={{
                fontFamily: fontDisplay,
                fontStyle: "italic",
                fontSize: "1.1rem",
                color: palette.ink,
                maxWidth: 520,
                lineHeight: 1.4,
              }}
            >
              {row.page.cta}
            </div>
            <span
              style={{
                fontFamily: fontSans,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontSize: 11,
                color: palette.paper,
                background: palette.ink,
                padding: "10px 14px",
                boxShadow: `4px 4px 0 ${palette.oxblood}`,
              }}
            >
              Call to action
            </span>
          </div>

          <style>{`
            @media (max-width: 720px) {
              .pr-proof-grid { grid-template-columns: 1fr !important; }
              .pr-local-cols { column-count: 1 !important; }
            }
          `}</style>
        </div>
      )}
    </article>
  );
}

/* --------------------------------------------------------------------------
   <SectionHeader>
   -------------------------------------------------------------------------- */
function SectionHeader({ text, fontSans }: { text: string; fontSans: string }) {
  return (
    <div
      style={{
        fontFamily: fontSans,
        fontSize: 10.5,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: palette.ink,
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <span style={{ color: palette.oxblood }}>❦</span>
      <span style={{ fontWeight: 700 }}>{text}</span>
      <span style={{ flex: 1, height: 1, background: palette.ink, opacity: 0.8 }} />
    </div>
  );
}

/* --------------------------------------------------------------------------
   <ProofField> — title / meta presentation strip
   -------------------------------------------------------------------------- */
function ProofField({
  label,
  value,
  fontDisplay,
  fontMono,
  fontSans,
}: {
  label: string;
  value: string;
  fontDisplay: string;
  fontMono: string;
  fontSans: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 18,
        alignItems: "baseline",
        marginBottom: 10,
        paddingBottom: 10,
        borderBottom: `1px dotted ${palette.inkFaded}`,
      }}
    >
      <span
        style={{
          fontFamily: fontSans,
          fontSize: 10.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: palette.inkSoft,
          minWidth: 140,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fontDisplay,
          fontSize: "1rem",
          color: palette.ink,
          lineHeight: 1.45,
        }}
      >
        {value}
      </span>
    </div>
  );
}

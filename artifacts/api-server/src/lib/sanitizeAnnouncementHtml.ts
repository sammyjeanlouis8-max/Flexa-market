/**
 * Allowlist HTML sanitizer for official announcement bodies.
 * Strips scripts/event handlers and unknown tags without a heavy dependency.
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "span", "div", "a",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  p: new Set(["class"]),
};

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed.slice(0, 500);
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 500);
  if (trimmed.startsWith("mailto:")) return trimmed.slice(0, 200);
  return null;
}

/** Convert plain text with newlines into simple paragraph HTML. */
export function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "<p></p>";
  return blocks
    .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function sanitizeAnnouncementHtml(input: string): string {
  if (!input || typeof input !== "string") return "";
  // If the admin pasted plain text (no tags), wrap paragraphs.
  if (!/<[a-z][\s\S]*>/i.test(input)) {
    return plainTextToHtml(input.slice(0, 50_000));
  }

  let html = input.slice(0, 50_000)
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|link|meta)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return `</${tag}>`;
    if (tag === "br") return "<br/>";

    const allowed = ALLOWED_ATTRS[tag];
    if (!allowed || !rawAttrs.trim()) return `<${tag}>`;

    const attrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = attrRe.exec(rawAttrs)) !== null) {
      const name = match[1].toLowerCase();
      if (!allowed.has(name)) continue;
      let value = match[3] ?? match[4] ?? match[5] ?? "";
      if (name === "href") {
        const safe = sanitizeHref(value);
        if (!safe) continue;
        value = safe;
        attrs.push(`href="${escapeText(value)}"`, `rel="noopener noreferrer"`);
        if (value.startsWith("http")) attrs.push(`target="_blank"`);
        continue;
      }
      if (name === "class") {
        // Only allow our highlight utility classes
        const safeClass = value.split(/\s+/).filter((c) => /^[a-z0-9_-]+$/i.test(c)).slice(0, 5).join(" ");
        if (safeClass) attrs.push(`class="${safeClass}"`);
        continue;
      }
      attrs.push(`${name}="${escapeText(value)}"`);
    }
    return attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
  });

  return html;
}

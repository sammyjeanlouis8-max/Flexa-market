/** Extract up to 4 short feature lines from real description text — never invent. */
export function extractListingFeatures(description: string | null | undefined, max = 4): string[] {
  if (!description?.trim()) return [];
  const text = description.replace(/\r/g, "").trim();
  const hasStructure = /[\n•\u2022]|(?:^|\n)\s*[-–—*]\s+|(?:^|\n)\s*\d+[.)]\s+/.test(text);
  if (!hasStructure) {
    // Unstructured blurbs stay as the info-panel paragraph — don't fake a feature list.
    return [];
  }
  const raw = text
    .split(/\n+|•|\u2022|(?:^|\s)[-–—]\s+|(?:^|\s)\*\s+|(?:^|\s)\d+[.)]\s+/)
    .map((s) => s.replace(/^[\s•\-*–—\d.)]+/, "").trim())
    .filter((s) => s.length >= 8 && s.length <= 80);
  const unique: string[] = [];
  for (const line of raw) {
    if (unique.some((u) => u.toLowerCase() === line.toLowerCase())) continue;
    unique.push(line);
    if (unique.length >= max) break;
  }
  return unique;
}

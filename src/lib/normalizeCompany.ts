/**
 * Normalize company names so "google", "Google", "Google LLC", "Google, Inc." etc.
 * all resolve to one canonical form.
 */

const CANONICAL: Record<string, string> = {
  google: "Google",
  "google llc": "Google",
  "google inc": "Google",
  "google inc.": "Google",
  "google, inc.": "Google",
  "google, inc": "Google",
  "google deepmind": "Google",
  microsoft: "Microsoft",
  "microsoft corp": "Microsoft",
  "microsoft corp.": "Microsoft",
  "microsoft corporation": "Microsoft",
  meta: "Meta",
  "meta platforms": "Meta",
  "meta platforms inc": "Meta",
  "meta platforms, inc.": "Meta",
  apple: "Apple",
  "apple inc": "Apple",
  "apple inc.": "Apple",
  amazon: "Amazon",
  "amazon.com": "Amazon",
  "amazon web services": "AWS",
  aws: "AWS",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "anthropic, pbc": "Anthropic",
  ibm: "IBM",
  "ibm corp": "IBM",
  nvidia: "NVIDIA",
  "nvidia corporation": "NVIDIA",
  stripe: "Stripe",
  "stripe, inc": "Stripe",
  "stripe, inc.": "Stripe",
  okta: "Okta",
  "okta, inc.": "Okta",
  "linux foundation": "Linux Foundation",
  "the linux foundation": "Linux Foundation",
};

const SUFFIX_RE = /[,.]?\s*(?:inc\.?|llc|ltd\.?|corp\.?|corporation|co\.?|pbc|gmbh|plc)$/i;

export function normalizeCompany(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  let name = raw.trim().replace(/^@/, "").trim();
  if (!name) return "Unknown";

  const key = name.toLowerCase();
  if (CANONICAL[key]) return CANONICAL[key];

  // Strip common suffixes and check again
  const stripped = name.replace(SUFFIX_RE, "").trim();
  const strippedKey = stripped.toLowerCase();
  if (CANONICAL[strippedKey]) return CANONICAL[strippedKey];

  // Title-case the stripped version if it differs
  return stripped || name;
}

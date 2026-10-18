import vocabulary from "../../docs/transcription-vocabulary.json";
import type { Language } from "./contracts";

export function transcriptionOptions(language: Language, contextNames: string[] = []) {
  const keyterm: string[] = [];
  const seen = new Set<string>();
  // shortcut: a conservative 400-byte shortlist, revisit with provider token counting for larger vocabularies.
  let bytes = 0;
  for (const candidate of [...contextNames, ...vocabulary.previous_suggestions, ...vocabulary.user_supplied]) {
    const term = candidate.trim();
    const size = new TextEncoder().encode(term).length;
    if (!term || seen.has(term.toLowerCase()) || bytes + size > 400 || keyterm.length >= 40) continue;
    seen.add(term.toLowerCase());
    bytes += size;
    keyterm.push(term);
  }
  return { language, model: "nova-3", punctuate: true, includeRawResponse: true, extra: { keyterm, diarize_model: "latest" } };
}

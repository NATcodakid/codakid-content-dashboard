import { errorResponse, json, requireUser, HttpError } from './_auth.mjs';

// Google Autocomplete ("Suggest") is free and keyless. We expand a seed term into
// hundreds of real search phrases, then bucket them into questions, comparisons,
// prepositions, and related ideas — a free stand-in for a keyword research tool.
const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'are', 'is', 'do', 'will'];
const COMPARISON_WORDS = ['vs', 'or', 'versus', 'alternative', 'like', 'compared'];
const PREPOSITIONS = ['for', 'with', 'without', 'near', 'best', 'free', 'online', 'cheap'];

export async function handler(event) {
  try {
    await requireUser(event);
    const seed = String(event.queryStringParameters?.seed || '').trim().toLowerCase();
    if (!seed) throw new HttpError(400, 'A seed keyword is required.');
    if (seed.length > 80) throw new HttpError(400, 'Seed keyword is too long.');

    // Build a focused set of prefix/suffix queries (kept small to stay within the function timeout).
    const queries = new Set([seed]);
    for (const word of QUESTION_WORDS) queries.add(`${word} ${seed}`);
    for (const word of PREPOSITIONS) queries.add(`${seed} ${word}`);
    queries.add(`${seed} vs`);
    for (const letter of 'abcdefg') queries.add(`${seed} ${letter}`);

    const lists = await Promise.all([...queries].map((q) => suggest(q)));
    const all = new Map();
    for (const list of lists) {
      for (const phrase of list) {
        const clean = phrase.trim().toLowerCase();
        if (!clean || clean === seed || !clean.includes(seed.split(' ')[0])) continue;
        if (!all.has(clean)) all.set(clean, classify(clean));
      }
    }

    const ideas = [...all.entries()].map(([keyword, group]) => ({ keyword, group, words: keyword.split(/\s+/).length }));
    const grouped = {
      questions: ideas.filter((i) => i.group === 'question').map((i) => i.keyword).sort().slice(0, 40),
      comparisons: ideas.filter((i) => i.group === 'comparison').map((i) => i.keyword).sort().slice(0, 25),
      modifiers: ideas.filter((i) => i.group === 'modifier').map((i) => i.keyword).sort().slice(0, 30),
      related: ideas.filter((i) => i.group === 'related').map((i) => i.keyword).sort().slice(0, 40),
    };

    return json(
      200,
      {
        seed,
        generatedAt: new Date().toISOString(),
        source: 'Google Autocomplete',
        total: ideas.length,
        groups: grouped,
      },
      { 'cache-control': 'private, max-age=900' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function suggest(query) {
  try {
    const url = `${SUGGEST_ENDPOINT}?client=firefox&hl=en&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'user-agent': UA } });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    // Firefox client returns: [query, [suggestion, ...]]
    if (Array.isArray(payload) && Array.isArray(payload[1])) return payload[1];
    return [];
  } catch {
    return [];
  }
}

function classify(phrase) {
  const words = phrase.split(/\s+/);
  if (QUESTION_WORDS.includes(words[0])) return 'question';
  if (words.some((w) => COMPARISON_WORDS.includes(w))) return 'comparison';
  if (words.some((w) => PREPOSITIONS.includes(w))) return 'modifier';
  return 'related';
}

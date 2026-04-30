/**
 * Lightweight, dependency-free "embeddings" for in-process semantic
 * similarity. We use feature-hashed bag-of-words + char n-grams instead of
 * a transformer model:
 *
 *   - No heavy dependency (no onnxruntime, no node-fetch'd embedding API).
 *   - Deterministic, runs in O(tokens) on each call.
 *   - Good enough for the kinds of fuzzy comparisons we need:
 *       * "react" ≈ "reactjs"        (token-level overlap)
 *       * "k8s" ≈ "kubernetes"        (synonym table covers it; we just
 *                                       need to *fall back* to similarity
 *                                       when the table misses)
 *       * resume vs. JD topical similarity for semanticScorer.
 *
 * If we ever upgrade to real embeddings, the public API (`embedText`,
 * `cosine`, `similarity`) is the place to swap implementations — every
 * caller sticks to it.
 */

const HASH_DIM = 1024;            // sparse hashed BoW dimension
const NGRAM_DIM = 512;             // char n-gram dimension
const NGRAM_N = 3;

function fnv1a(str) {
  // 32-bit FNV-1a — fast, no dep, good distribution for our scale.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashedTokenIndex(token, dim) {
  return fnv1a(token) % dim;
}

/**
 * Build a sparse hashed-TF vector keyed by `index → weight`. Sparse maps
 * are ~50x smaller than dense vectors for typical resumes and cosine on
 * sparse maps is the same big-O.
 */
function hashedTokenVector(tokens, dim = HASH_DIM) {
  const v = new Map();
  for (const t of tokens) {
    const idx = hashedTokenIndex(t, dim);
    v.set(idx, (v.get(idx) || 0) + 1);
  }
  return v;
}

function charNgrams(str, n = NGRAM_N) {
  const padded = ` ${String(str || '').toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const out = [];
  for (let i = 0; i <= padded.length - n; i++) {
    out.push(padded.slice(i, i + n));
  }
  return out;
}

function hashedNgramVector(str, dim = NGRAM_DIM) {
  const v = new Map();
  for (const g of charNgrams(str)) {
    const idx = fnv1a(g) % dim;
    v.set(idx, (v.get(idx) || 0) + 1);
  }
  return v;
}

function dot(a, b) {
  // Iterate the smaller map for the typical sparse case.
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [k, v] of s) {
    const w = l.get(k);
    if (w) sum += v * w;
  }
  return sum;
}

function norm(v) {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

/**
 * Cheap fuzzy similarity between two short strings. Used by the synonym
 * fallback ("kuberntes" → "kubernetes") and by the partial-match path in
 * the skill scorer.
 */
function ngramSimilarity(a, b) {
  if (!a || !b) return 0;
  const va = hashedNgramVector(a);
  const vb = hashedNgramVector(b);
  return cosine(va, vb);
}

/**
 * Document-level embedding: combine a hashed BoW of tokens (captures topic)
 * with a hashed BoW of char tri-grams of the original text (captures
 * morphology — "kubernetes" and "kuberntes" land near each other). The two
 * vectors live in disjoint hash spaces so concatenation is a plain merge.
 */
function embedText(text, tokens) {
  const v = hashedTokenVector(tokens || [], HASH_DIM);
  const ng = hashedNgramVector(text || '', NGRAM_DIM);
  // Offset the n-gram indices so they don't collide with token indices.
  for (const [k, w] of ng) v.set(k + HASH_DIM, w);
  return v;
}

/** Convenience wrapper: cosine of two embedded documents. */
function similarity(a, b) {
  return cosine(a, b);
}

module.exports = {
  embedText,
  hashedTokenVector,
  hashedNgramVector,
  charNgrams,
  cosine,
  similarity,
  ngramSimilarity,
  HASH_DIM,
  NGRAM_DIM,
};

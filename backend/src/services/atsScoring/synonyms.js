/**
 * Skill synonym map. Each canonical skill key maps to a set of accepted
 * surface forms. Keys are lowercase. Surface forms are matched after the
 * same normalization pipeline used for resumes (see normalize.js).
 *
 * Two ways to "canonicalize" a surface form:
 *
 *   - canonicalize(s)            → exact lookup in the synonym table.
 *                                   Returns the input lowercased if no hit.
 *
 *   - fuzzyCanonicalize(s, opt)  → exact-then-similarity. Falls back to
 *                                   character n-gram cosine similarity
 *                                   above a configurable threshold so
 *                                   typos / minor variants ("kuberntes",
 *                                   "tailwindscss") still snap to the
 *                                   right canonical key.
 *
 * Adding entries to RAW remains the cheapest way to improve recall.
 */

const { ngramSimilarity } = require('./embeddings');

const RAW = {
  javascript: ['javascript', 'js', 'es6', 'es2015', 'ecmascript', 'vanilla js'],
  typescript: ['typescript', 'ts'],
  nodejs: ['nodejs', 'node js', 'node.js', 'node'],
  reactjs: ['reactjs', 'react js', 'react.js', 'react'],
  nextjs: ['nextjs', 'next js', 'next.js'],
  vuejs: ['vuejs', 'vue js', 'vue.js', 'vue'],
  angular: ['angular', 'angularjs'],
  redux: ['redux'],
  graphql: ['graphql', 'gql'],
  rest: ['rest', 'restful', 'rest api', 'restful api'],
  html: ['html', 'html5'],
  css: ['css', 'css3'],
  tailwind: ['tailwind', 'tailwindcss', 'tailwind css'],
  sass: ['sass', 'scss'],
  python: ['python', 'py', 'python3'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  java: ['java'],
  spring: ['spring', 'spring boot', 'springboot'],
  kotlin: ['kotlin'],
  golang: ['golang', 'go'],
  rust: ['rust'],
  csharp: ['c#', 'csharp', 'c-sharp', 'dotnet', '.net'],
  ruby: ['ruby'],
  rails: ['rails', 'ruby on rails', 'ror'],
  php: ['php'],
  laravel: ['laravel'],
  cpp: ['c++', 'cpp', 'cplusplus'],
  postgresql: ['postgresql', 'postgres', 'psql'],
  mysql: ['mysql'],
  mariadb: ['mariadb'],
  sqlite: ['sqlite'],
  mongodb: ['mongodb', 'mongo'],
  redis: ['redis'],
  elasticsearch: ['elasticsearch', 'elastic search', 'es'],
  kafka: ['kafka', 'apache kafka'],
  rabbitmq: ['rabbitmq', 'rabbit mq'],
  prisma: ['prisma', 'prisma orm'],
  sequelize: ['sequelize'],
  typeorm: ['typeorm'],
  sql: ['sql'],
  nosql: ['nosql'],
  aws: ['aws', 'amazon web services'],
  gcp: ['gcp', 'google cloud', 'google cloud platform'],
  azure: ['azure', 'microsoft azure'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform'],
  ansible: ['ansible'],
  jenkins: ['jenkins'],
  github_actions: ['github actions', 'gh actions'],
  cicd: ['ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous delivery'],
  linux: ['linux', 'unix'],
  bash: ['bash', 'shell scripting', 'shell'],
  git: ['git'],
  testing: ['testing', 'unit testing', 'integration testing'],
  jest: ['jest'],
  vitest: ['vitest'],
  cypress: ['cypress'],
  playwright: ['playwright'],
  figma: ['figma'],
  ux: ['ux', 'user experience'],
  ui: ['ui', 'user interface'],
  accessibility: ['accessibility', 'a11y', 'wcag'],
  agile: ['agile', 'scrum', 'kanban'],
  framer_motion: ['framer motion', 'framer-motion'],
};

// Build a flat surface-form → canonical map for O(1) lookup.
const SURFACE_TO_CANONICAL = new Map();
for (const [canonical, forms] of Object.entries(RAW)) {
  for (const form of forms) {
    SURFACE_TO_CANONICAL.set(form.toLowerCase(), canonical);
  }
}

// Surface forms sorted longest-first so multi-word matches win.
const SURFACE_FORMS_BY_LEN = [...SURFACE_TO_CANONICAL.keys()].sort(
  (a, b) => b.length - a.length,
);

function canonicalize(surface) {
  if (!surface) return null;
  const k = surface.toLowerCase().trim();
  return SURFACE_TO_CANONICAL.get(k) || k;
}

function knownSurfaceForms() {
  return SURFACE_FORMS_BY_LEN;
}

/**
 * Best-effort canonicalization with similarity fallback.
 *
 *   - Exact hit in the synonym table → return canonical.
 *   - No hit → walk surface forms, pick the closest by char n-gram cosine,
 *     return the canonical of the winner if similarity ≥ threshold.
 *   - Below threshold → return the lowercased input (graceful fallback).
 *
 * The fallback is bounded by length difference so we don't compare "java"
 * to "javascript" and get a false positive — different concepts that
 * happen to share characters.
 */
function fuzzyCanonicalize(surface, { threshold = 0.85, maxLenRatio = 1.6 } = {}) {
  if (!surface) return null;
  const lower = surface.toLowerCase().trim();
  const exact = SURFACE_TO_CANONICAL.get(lower);
  if (exact) return exact;

  let best = { canonical: lower, score: 0, surface: null };
  for (const form of SURFACE_FORMS_BY_LEN) {
    // Don't bother comparing wildly different lengths.
    const r = Math.max(form.length, lower.length) / Math.max(1, Math.min(form.length, lower.length));
    if (r > maxLenRatio) continue;

    const s = ngramSimilarity(form, lower);
    if (s > best.score) {
      best = { canonical: SURFACE_TO_CANONICAL.get(form), score: s, surface: form };
    }
  }
  return best.score >= threshold ? best.canonical : lower;
}

module.exports = {
  canonicalize,
  fuzzyCanonicalize,
  knownSurfaceForms,
  RAW,
};

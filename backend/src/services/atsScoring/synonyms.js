/**
 * Skill synonym map. Each canonical skill key maps to a set of accepted
 * surface forms. Keys are lowercase. Surface forms are matched after the
 * same normalization pipeline used for resumes (see normalize.js).
 *
 * Adding entries here is the cheapest way to improve recall without ML.
 */

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

function canonicalize(surface) {
  if (!surface) return null;
  const k = surface.toLowerCase().trim();
  return SURFACE_TO_CANONICAL.get(k) || k;
}

function knownSurfaceForms() {
  return [...SURFACE_TO_CANONICAL.keys()].sort((a, b) => b.length - a.length);
}

module.exports = { canonicalize, knownSurfaceForms, RAW };

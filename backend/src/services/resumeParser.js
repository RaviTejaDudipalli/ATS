const path = require('path');
const fs = require('fs/promises');

const { logger } = require('../lib/logger');
const { normalize } = require('./atsScoring/normalize');
const { canonicalize, knownSurfaceForms } = require('./atsScoring/synonyms');

const MAX_RESUME_TEXT = 200_000; // chars; plenty for any real resume.

/**
 * Extract clean, normalized text from a resume file.
 *
 * What this fixes vs. the previous version:
 *   - Per-format extraction (PDF / DOCX / TXT) with explicit fallbacks
 *   - Strips soft hyphens, fixes hyphenated line breaks
 *   - Two-column PDFs: a custom pdf-parse pagerender groups glyphs by Y so
 *     they come out row-major instead of column-major
 *   - Rejects legacy `.doc` with a clear error instead of returning noise
 *   - Caps text length to defend against pathological resumes
 */
async function extractText(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  const log = logger.child({ resumeParser: ext });

  try {
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      return capped(await extractPdf(filePath));
    }

    if (
      ext === '.docx' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({ path: filePath });
      return capped(cleanText(out.value || ''));
    }

    if (ext === '.txt' || mimeType === 'text/plain') {
      const buf = await fs.readFile(filePath, 'utf8');
      return capped(cleanText(buf));
    }

    if (ext === '.doc') {
      const err = new Error(
        'Legacy .doc files are not supported. Please save as .docx or PDF.',
      );
      err.code = 'UNSUPPORTED_LEGACY_DOC';
      throw err;
    }
  } catch (err) {
    if (err.code === 'UNSUPPORTED_LEGACY_DOC') throw err;
    log.warn({ err: err.message }, 'resume extraction failed');
    // Surface a non-fatal empty string — apply still works, scoring just dips.
  }

  return '';
}

async function extractPdf(filePath) {
  const pdfParse = require('pdf-parse');
  const buf = await fs.readFile(filePath);

  // Custom page renderer: group glyphs into lines by Y coordinate so multi-
  // column layouts come out in row-major order. Falls back to the default
  // text dump if anything goes wrong.
  const options = {
    pagerender: async (pageData) => {
      try {
        const tc = await pageData.getTextContent({ disableCombineTextItems: false });
        const lines = new Map();
        for (const item of tc.items) {
          if (!item.str) continue;
          const y = Math.round(item.transform[5]);
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y).push({ x: item.transform[4], str: item.str });
        }
        return [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, items]) =>
            items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '),
          )
          .join('\n');
      } catch {
        return pageData
          .getTextContent()
          .then((tc) => tc.items.map((i) => i.str).join(' '));
      }
    },
  };

  const out = await pdfParse(buf, options);
  return cleanText(out.text || '');
}

function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/­/g, '')                  // soft hyphen
    .replace(/\f/g, '\n')                    // form-feed
    .replace(/-\s*\n\s*/g, '')               // hyphenated line wraps
    .replace(/ /g, ' ')                 // nbsp
    .replace(/[ -​  　]/g, ' ') // exotic spaces
    .replace(/[\t\v]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function capped(s) {
  return (s || '').slice(0, MAX_RESUME_TEXT);
}

/**
 * Extract a deduped, canonicalized list of skills from resume text. Used to
 * pre-compute `Resume.detectedSkills` so we can rescore an application
 * without re-running PDF extraction.
 */
function extractSkills(resumeText) {
  if (!resumeText) return [];
  const norm = normalize(resumeText);
  const found = new Set();

  // Iterate longest → shortest so "react native" beats "react".
  for (const form of knownSurfaceForms()) {
    const pattern = form
      .replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m)
      .replace(/\s+/g, '\\s+');
    const re = new RegExp(`(?:^|[^\\w])${pattern}(?=$|[^\\w])`);
    if (re.test(norm)) found.add(canonicalize(form));
  }

  return [...found];
}

module.exports = { extractText, extractSkills, cleanText, MAX_RESUME_TEXT };

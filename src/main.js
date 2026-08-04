import './style.css'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const log = (...args) => console.log('[CP Worksheet]', ...args)
const logError = (...args) => console.error('[CP Worksheet]', ...args)

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="shell">
    <div class="device-frame">
      <div class="topbar">
        <p class="ui-proto-banner">Critical Points Machine</p>
        <p class="topbar-meta">Live web app</p>
      </div>

      <header class="hero">
        <p class="eyebrow">Critical Points Machine</p>
        <h1>Worksheet<br /><span class="title-accent">Filler</span></h1>
        <p class="lede">
          A simple web tool for your ATI critical points worksheets.<br />
          Use it on any computer — nothing to install.
        </p>
      </header>

      <details class="guide">
        <summary class="guide-summary">
          <span class="guide-summary-label">How it works</span>
        </summary>
        <div class="guide-body">
          <p class="guide-lead">
            Upload your ATI report. We fill the worksheet headers. You write the three points, then download.
          </p>
        </div>
      </details>

      <section class="tryout">
        <p class="tryout-kicker">Try it out</p>
        <p class="tryout-title">Want to see it work first?</p>
        <p class="tryout-copy">
          Tap below to load a practice ATI report with no names or school info.
          Then watch the worksheets fill in.
        </p>
        <button id="loadSampleReport" type="button" class="tryout-cta">Use practice sample</button>
      </section>

      <section class="section control-grid tool-start">
        <div>
          <p class="section-kicker">Start here</p>
          <p class="section-title">ATI Report PDF</p>
        </div>
        <p class="template-note">
          Choose your report, then autofill the worksheet headers.
        </p>
        <label class="file-field">
          <span class="visually-hidden">Choose ATI report PDF</span>
          <input id="sourceReport" type="file" accept=".pdf,application/pdf" />
        </label>
        <button id="extractFromReport" type="button">Autofill Headings From Report</button>
        <p id="status" aria-live="polite"></p>
      </section>

      <section class="section control-grid" id="worksheetHintCard">
        <div>
          <p class="section-kicker">Worksheets</p>
          <p class="section-title">Waiting</p>
        </div>
        <p id="worksheetHint">After autofill, your three worksheets appear here for review and editing.</p>
      </section>

      <section id="worksheetCards" class="worksheets-grid is-hidden"></section>

      <section class="section control-grid">
        <div>
          <p class="section-kicker">Export</p>
          <p class="section-title">Three Worksheets<br /><span class="title-line">One PDF</span></p>
        </div>
        <p class="template-note">Review P1–P3, then save them together.</p>
        <button id="generateCombined" type="button">Generate Combined PDF</button>
      </section>

      <section class="section control-grid human-check">
        <div>
          <p class="section-kicker">Before you submit</p>
          <p class="section-title">Check your work</p>
        </div>
        <p class="template-note">
          Tools aren’t perfect. It’s up to the human to make sure your work is correct.
          We want everyone to do their best, so compare your output to the official reference
          grading criteria below.
        </p>
        <a
          class="button-link"
          href="./exemplar-3-critical-points.pdf"
          download="exemplar-3-critical-points.pdf"
        >Download Official Reference Grading Criteria</a>
      </section>

      <section class="contact-note">
        <p>
          If you hit a bug or error, email
          <a class="text-link" href="mailto:george.ulloa@downstate.edu?subject=Critical%20Points%20Machine%20bug">george.ulloa@downstate.edu</a>.
        </p>
        <p>
          Attach a screenshot and a sample file if you can.
          The more information you share, the easier it is to fix :)
        </p>
      </section>

      <footer class="dev-credit">
        <div class="dev-credit-copy">
          <p class="dev-credit-label">Developed by G.</p>
          <p class="dev-credit-note">“Let's make life a little easier.”</p>
        </div>
        <img class="dev-credit-logo" src="./george-logo.png" alt="" width="56" height="56" />
      </footer>
    </div>
  </main>
`

const statusEl = document.querySelector('#status')
const sourceReportEl = document.querySelector('#sourceReport')
const extractButtonEl = document.querySelector('#extractFromReport')
const loadSampleReportEl = document.querySelector('#loadSampleReport')
const worksheetCardsEl = document.querySelector('#worksheetCards')
const worksheetHintCardEl = document.querySelector('#worksheetHintCard')
const generateCombinedButtonEl = document.querySelector('#generateCombined')

// Hard-force one card per row (guards against stale Safari stylesheet caching).
worksheetCardsEl.style.gridTemplateColumns = '1fr'

const setStatus = (text, isError = false) => {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}

const setWorksheetEditorVisibility = (isVisible) => {
  worksheetCardsEl.classList.toggle('is-hidden', !isVisible)
  worksheetHintCardEl.classList.toggle('is-hidden', isVisible)
  generateCombinedButtonEl.disabled = !isVisible
}

let extractedExamName = ''
let cachedReportText = ''
let cachedCategoryScores = []

// Order matches common ATI major-area sequencing; optional rows (e.g. Psychosocial) may be
// omitted on some assessments — parsing uses only categories that actually appear in the PDF.
// ATI has renamed some labels across years (e.g. Safety…); keep current + legacy names.
const KNOWN_CATEGORIES = [
  'Management of Care',
  'Safety and Infection Prevention and Control',
  'Safety and Infection Control',
  'Health Promotion and Maintenance',
  'Psychosocial Integrity',
  'Basic Care and Comfort',
  'Pharmacological and Parenteral Therapies',
  'Reduction of Risk Potential',
  'Physiological Adaptation',
  'Clinical Judgment',
]

/** Same NCLEX area under different ATI report wordings. */
const CATEGORY_ALIAS_GROUPS = [
  ['Safety and Infection Prevention and Control', 'Safety and Infection Control'],
]

const categoryNameVariants = (category) => {
  const normalized = normalizeWhitespace(category)
  const variants = new Set([normalized])
  for (const group of CATEGORY_ALIAS_GROUPS) {
    if (group.some((name) => name.toLowerCase() === normalized.toLowerCase())) {
      for (const name of group) variants.add(name)
    }
  }
  return [...variants]
}

const worksheetConfigs = [
  {
    id: 'p1',
    title: 'Worksheet P1',
    defaults: {
      clientCareNeedCategory: '',
      subConcept: '',
      content: '',
      criticalPoint1: '',
      criticalPoint2: '',
      criticalPoint3: '',
    },
  },
  {
    id: 'p2',
    title: 'Worksheet P2',
    defaults: {
      clientCareNeedCategory: '',
      subConcept: '',
      content: '',
      criticalPoint1: '',
      criticalPoint2: '',
      criticalPoint3: '',
    },
  },
  {
    id: 'p3',
    title: 'Worksheet P3',
    defaults: {
      clientCareNeedCategory: '',
      subConcept: '',
      content: '',
      criticalPoint1: '',
      criticalPoint2: '',
      criticalPoint3: '',
    },
  },
]

const CRITICAL_POINT_ROWS = [
  { label: 'CP1', bulletBaselineY: 437.4 },
  { label: 'CP2', bulletBaselineY: 386.4 },
  { label: 'CP3', bulletBaselineY: 335.2 },
]

const CRITICAL_POINT_TEXT_X = 128
const CRITICAL_POINT_TEXT_MAX_WIDTH = 405
const CRITICAL_POINT_TEXT_MAX_HEIGHT = 28
const CRITICAL_POINT_VERTICAL_NUDGE = -24

const CATEGORY_TEXT_X = 118
const CATEGORY_TEXT_MAX_WIDTH = 450
const SUBCONCEPT_TEXT_X = 118
const SUBCONCEPT_TEXT_MAX_WIDTH = 450
const CONTENT_TEXT_X = 105
const CONTENT_TEXT_MAX_WIDTH = 480

const SHOW_CRITICAL_POINT_DEBUG_BOXES = false

const slugifyFilenamePart = (text) =>
  text
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const extractExamName = (fullText) => {
  const normalized = normalizeWhitespace(fullText)
  const examPatterns = [
    /\bRN\s+[A-Za-z0-9/&,\-\s]+?\s+Online\s+Practice\s+\d{4}\s*[A-Z]\b/i,
    /\bRN\s+[A-Za-z0-9/&,\-\s]+?\s+Practice\s+\d{4}\s*[A-Z]\b/i,
  ]

  for (const pattern of examPatterns) {
    const match = normalized.match(pattern)
    if (match) return match[0].trim()
  }

  return ''
}

const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').trim()
/** PDF.js sometimes omits spaces between letters and digits — breaks Safari parsing. */
const normalizePdfLetterDigitGaps = (text) =>
  text
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')

/**
 * One pass for text extracted via PDF.js (especially WebKit): collapse whitespace, fix glued
 * letter/digit pairs, split accidental camelCase merges (TherapeuticCommunication), and expand
 * common glued headings (TopicsToReview).
 */
const normalizePdfExtractedText = (text) => {
  const collapsed = String(text).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  const gapFixed = normalizePdfLetterDigitGaps(collapsed)
  const camelSplit = gapFixed.replace(/([a-z])([A-Z])/g, '$1 $2')
  return camelSplit.replace(/TopicsToReview/gi, 'Topics To Review').replace(/％/g, '%').trim()
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const formatError = (error) => (error instanceof Error ? error.message : String(error))

const findTopicsToReviewIndex = (fullText) => {
  // Prefer a real section heading, not footer copy like
  // "explanation of the Scores and Topics to Review sections".
  const headingRe = /Topics[\s\u00A0]*To[\s\u00A0]*Review(?!\s+sections?\b)/gim
  let match = headingRe.exec(fullText)
  while (match !== null) {
    if (match.index !== undefined) return match.index
    match = headingRe.exec(fullText)
  }
  return -1
}

/** Cut Topics blocks before page footers / score-interpretation sections. */
const findTopicsBlockEnd = (topicsTail) => {
  const markers = [
    topicsTail.search(/\bPlease\s+see\s+page\b/i),
    topicsTail.search(/\bScore\s+Explanation\s+and\s+Interpretation\b/i),
    topicsTail.search(/\bPriority\s+Setting\b/i),
    topicsTail.search(/\bThinking\s+Skills\b/i),
    topicsTail.search(/\bClinical\s+Areas\b/i),
    topicsTail.search(/\bPage\s+\d+\s+of\b/i),
    topicsTail.search(/\bOutcomes\b/),
  ].filter((idx) => idx >= 0)
  return markers.length ? Math.min(...markers) : topicsTail.length
}

/**
 * Keep only the short remediation content after a colon (e.g. "Access to the Internet"),
 * and stop before footer/page-2 score dumps or the next "Label: ..." topic line.
 */
const clipTopicContent = (rawContent, subConcept = '') => {
  let content = normalizeWhitespace(rawContent)
  if (!content) return ''

  const cutPoints = [
    content.search(/\bPlease\s+see\s+page\b/i),
    content.search(/\bScore\s+Explanation\s+and\s+Interpretation\b/i),
    content.search(/\bPage\s+\d+\s+of\b/i),
    content.search(/\bPriority\s+Setting\b/i),
    content.search(/\bThinking\s+Skills\b/i),
    content.search(/\bClinical\s+Areas\b/i),
    content.search(/\bQSEN\b/),
    content.search(/\bNo\s+of\s+Points\b/i),
  ].filter((idx) => idx >= 0)

  if (cutPoints.length) {
    content = content.slice(0, Math.min(...cutPoints)).trim()
  }

  // If more topics continue as "Same Sub Concept: next topic", keep only the first.
  if (subConcept) {
    const nextSame = content.search(new RegExp(`\\s${escapeRegExp(subConcept)}\\s*:`, 'i'))
    if (nextSame > 0) content = content.slice(0, nextSame).trim()
  }

  // Another continuing topic usually looks like "Title Case Words: more text".
  const nextTopicLine = content.search(/\s[A-Z][A-Za-z0-9/'&\-\s]{2,80}:\s+[A-Za-z]/)
  if (nextTopicLine > 0) {
    content = content.slice(0, nextTopicLine).trim()
  }

  return content.slice(0, 400).trim()
}

/** All section titles that can appear under Topics — used to slice the next block. */
const topicBoundaryLabels = () => [...new Set([...KNOWN_CATEGORIES])]
const removeSubConceptPrefixFromContent = (subConcept, content) => {
  let cleaned = normalizeWhitespace(content)
  const escapedSubConcept = escapeRegExp(subConcept)
  const subConceptPatternWithOrWithoutParens = new RegExp(
    `^${escapedSubConcept}\\s*(?:\\(\\s*\\d+\\s*item[s]?\\s*\\)|\\d+\\s*item[s]?)?\\s*`,
    'i',
  )

  cleaned = cleaned.replace(subConceptPatternWithOrWithoutParens, '').trimStart()

  // Safety fallback for odd spacing/encoding that bypasses the regex above.
  if (cleaned.toLowerCase().startsWith(subConcept.toLowerCase())) {
    cleaned = cleaned.slice(subConcept.length).trimStart()
    if (cleaned.startsWith('(')) {
      const closeParenIndex = cleaned.indexOf(')')
      if (closeParenIndex !== -1 && /item/i.test(cleaned.slice(0, closeParenIndex + 1))) {
        cleaned = cleaned.slice(closeParenIndex + 1).trimStart()
      }
    } else {
      cleaned = cleaned.replace(/^\d+\s*item[s]?\s*/i, '').trimStart()
    }
  }

  return cleaned
}

const extractTextFromPdf = async (file) => {
  log('extractTextFromPdf start', {
    name: file?.name,
    size: file?.size,
    type: file?.type,
    workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc,
  })

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const pdf = await loadingTask.promise
    const pages = []

    log('PDF loaded', { numPages: pdf.numPages })

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item) => item.str).join('\n')
      pages.push(pageText)
    }

    const joined = pages.join('\n\n')
    log('extractTextFromPdf done', { textLength: joined.length })
    return joined
  } catch (error) {
    logError('extractTextFromPdf failed', error)
    throw new Error(
      `Could not read PDF text (often Safari/worker or a bad file). ${formatError(error)}`,
    )
  }
}

const isPlausibleCategoryLabel = (label) => {
  const t = normalizeWhitespace(label)
  if (t.length < 3 || t.length > 130) return false
  if (/^[\d\s.%]+$/.test(t)) return false
  const lower = t.toLowerCase()
  if (
    /^(national|program|type|mean|individual|percentile|rank|score|sub-scale|points|items|note)\b/i.test(
      lower,
    )
  ) {
    return false
  }
  if (/\bpage\s+\d+\s+of\b/i.test(lower)) return false
  if (/\(%\s*correct\)/i.test(lower)) return false
  if (/\bindividual\s+score\b/i.test(lower)) return false
  if (/\bsub-scale\b/i.test(lower) && /\bpoints\b/i.test(lower)) return false
  return true
}

/** Last resort: pull `Label <points> <score>%` rows from a slice (Nurse’s Touch / communications). */
const parseLabeledPointsPercentRows = (slice) => {
  const re =
    /([A-Za-z][A-Za-z0-9\s,/'&\-\.]*?)\s+(\d{1,3})\s+(\d{1,3}(?:\.\d{1,4})?)\s*%/gi
  const seen = new Set()
  const scores = []
  let match = re.exec(slice)
  while (match !== null) {
    const category = normalizeWhitespace(match[1])
    const score = Number.parseFloat(match[3])
    const key = `${category}|${score}`
    if (
      Number.isFinite(score) &&
      score >= 0 &&
      score <= 100 &&
      isPlausibleCategoryLabel(category) &&
      !seen.has(key)
    ) {
      seen.add(key)
      scores.push({ category, score })
    }
    match = re.exec(slice)
  }
  return scores
}

const findMajorPerformanceAnchor = (text) => {
  const ordered = [
    /Individual\s+Performance\s+in\s+the\s+Major\s+Content\s+Areas/i,
    /Performance\s+in\s+the\s+Major\s+Content\s+Areas/i,
  ]
  for (const re of ordered) {
    const m = text.match(re)
    if (m && m.index !== undefined) return m
  }
  const loose = text.match(/\bMajor\s+Content\s+Areas\b/i)
  if (loose && loose.index !== undefined) {
    const winStart = Math.max(0, loose.index - 100)
    const window = text.slice(winStart, loose.index + 160)
    if (/\bSub-Scale\b/i.test(window) || /\bIndividual\b/i.test(window)) return loose
  }
  const subScale = text.match(
    /\bSub-Scale\b[\s\S]{0,500}?\bPoints\b[\s\S]{0,500}?\bScore\b/i,
  )
  if (subScale && subScale.index !== undefined) return subScale
  return null
}

/**
 * First real data row — not column headers like "National Program Type".
 * Uses earliest NCLEX label in text, else leftmost plausible percent row (skips merged headers).
 */
const findLeftmostPlausiblePercentRowIndex = (tableSlice, rowRegex) => {
  const flags = rowRegex.flags.includes('i') ? 'gi' : 'g'
  const re = new RegExp(rowRegex.source, flags)
  let match = re.exec(tableSlice)
  while (match !== null) {
    if (match[1] && isPlausibleCategoryLabel(match[1])) return match.index
    match = re.exec(tableSlice)
  }
  return -1
}

const findGenericTableDataStart = (tableSlice) => {
  let bestKnown = -1
  for (const category of KNOWN_CATEGORIES) {
    const re = new RegExp(escapeRegExp(category).replace(/\s+/g, '\\s+') + '\\s+\\d', 'i')
    const m = tableSlice.match(re)
    if (m && m.index !== undefined) {
      if (bestKnown === -1 || m.index < bestKnown) bestKnown = m.index
    }
  }

  const row3Re =
    /([A-Za-z][A-Za-z0-9\s,/'&\-\.]*?)\s+\d+\s+\d+\s+\d+(?:\.\d+)?%/i
  const row2Re =
    /([A-Za-z][A-Za-z0-9\s,/'&\-\.]*?)\s+\d+\s+\d+(?:\.\d+)?%/i

  let bestGeneric = findLeftmostPlausiblePercentRowIndex(tableSlice, row3Re)
  const row2Plausible = findLeftmostPlausiblePercentRowIndex(tableSlice, row2Re)
  if (row2Plausible !== -1 && (bestGeneric === -1 || row2Plausible < bestGeneric)) {
    bestGeneric = row2Plausible
  }

  if (bestKnown === -1) return bestGeneric === -1 ? 0 : bestGeneric
  if (bestGeneric === -1) return bestKnown
  return Math.min(bestKnown, bestGeneric)
}

const parseGenericCategoryScoresWithSlice = (tableSlice) => {
  const dataStart = findGenericTableDataStart(tableSlice)
  const body = tableSlice.slice(dataStart)
  const scores = []
  let pos = 0

  while (pos < body.length) {
    const rest = body.slice(pos)
    let m = rest.match(/^\s*(.+?)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)%/)
    let scoreGroup = 4
    if (!m) {
      m = rest.match(/^\s*(.+?)\s+(\d+)\s+(\d+(?:\.\d+)?)%/i)
      scoreGroup = 3
    }
    if (!m) break

    const category = normalizeWhitespace(m[1])
    const score = Number.parseFloat(m[scoreGroup])

    if (isPlausibleCategoryLabel(category)) {
      scores.push({ category, score })
    }

    pos += m[0].length
  }

  return scores
}

/**
 * Last resort: find every `label + points + score%` in the slice (handles messy extraction).
 */
const parseGenericCategoryScoresGlobalFallback = (tableSlice) => {
  const row2Re =
    /([A-Za-z][A-Za-z0-9\s,/'&\-\.]*?)\s+(\d+)\s+(\d+(?:\.\d+)?)%/gi
  const seen = new Set()
  const scores = []
  let match = row2Re.exec(tableSlice)
  while (match !== null) {
    const category = normalizeWhitespace(match[1])
    const score = Number.parseFloat(match[3])
    const key = `${category}|${score}`
    if (isPlausibleCategoryLabel(category) && !seen.has(key)) {
      seen.add(key)
      scores.push({ category, score })
    }
    match = row2Re.exec(tableSlice)
  }
  return scores
}

const parseGenericCategoryScores = (majorLine) => {
  const topicsIdx = findTopicsToReviewIndex(majorLine)
  const tableSlice = topicsIdx === -1 ? majorLine : majorLine.slice(0, topicsIdx)

  const sequential = parseGenericCategoryScoresWithSlice(tableSlice)
  if (sequential.length) return sequential

  const globalFallback = parseGenericCategoryScoresGlobalFallback(tableSlice)
  if (globalFallback.length) {
    log('parseGenericCategoryScores: used global fallback', { count: globalFallback.length })
    return globalFallback
  }

  const loose = parseLabeledPointsPercentRows(tableSlice)
  if (loose.length) {
    log('parseGenericCategoryScores: used labeled points-% fallback', { count: loose.length })
    return loose
  }

  return []
}

const parseKnownNclexCategoryScores = (majorLine) => {
  const present = []
  for (const category of KNOWN_CATEGORIES) {
    const categoryPattern = escapeRegExp(category).replace(/\s+/g, '\\s+')
    const marker = new RegExp(`${categoryPattern}\\s+`, 'i')
    const match = majorLine.match(marker)
    if (match && match.index !== undefined) {
      present.push({ category, index: match.index })
    }
  }

  present.sort((a, b) => a.index - b.index)

  const scores = []
  for (let i = 0; i < present.length; i += 1) {
    const { category } = present[i]
    const nextCategory = present[i + 1]?.category ?? null
    const categoryPattern = escapeRegExp(category).replace(/\s+/g, '\\s+')
    const nextCategoryPattern = nextCategory
      ? escapeRegExp(nextCategory).replace(/\s+/g, '\\s+')
      : null

    const rowRegex = nextCategoryPattern
      ? new RegExp(`${categoryPattern}\\s+([\\s\\S]*?)(?=${nextCategoryPattern})`, 'i')
      : new RegExp(
          `${categoryPattern}\\s+([\\s\\S]*?)(?=\\bNOTE:\\b|Topics[\\s\\u00A0]+To[\\s\\u00A0]+Review|$)`,
          'i',
        )
    const rowMatch = majorLine.match(rowRegex)
    if (!rowMatch) continue

    // Table formats differ by assessment type; first percent in row is the
    // individual's category score in both variants we've seen.
    const percentMatch = rowMatch[1].match(/(\d+(?:\.\d+)?)%/)
    if (!percentMatch) continue

    scores.push({ category, score: Number.parseFloat(percentMatch[1]) })
  }

  return scores
}

const parseCategoryScores = (fullText) => {
  const normalized = normalizePdfExtractedText(fullText)
  if (!normalized.length) {
    throw new Error(
      'No text was extracted from this PDF. Use a downloaded ATI report (not a scan) and try Safari with npm run dev.',
    )
  }

  const majorMatch = findMajorPerformanceAnchor(normalized)
  if (!majorMatch || majorMatch.index === undefined) {
    throw new Error('Could not find "Major Content Areas" section in this PDF.')
  }

  const trailingText = normalized.slice(majorMatch.index)
  // Some PDFs include a "Page X of Y" marker in the header area before the table,
  // so cutting at the *first* page marker can drop the entire table in Safari.
  // Prefer cutting after the Topics block; otherwise use a generous window.
  const topicsRelIdx = findTopicsToReviewIndex(trailingText)
  const pageMarkerSearchStart = topicsRelIdx === -1 ? 0 : topicsRelIdx
  const pageMarkerAfterTopics = trailingText
    .slice(pageMarkerSearchStart)
    .search(/\bPage\s+\d+\s+of\b/i)
  const endByPageMarker =
    pageMarkerAfterTopics === -1 ? -1 : pageMarkerSearchStart + pageMarkerAfterTopics

  const safeEnd = endByPageMarker !== -1 ? endByPageMarker : Math.min(trailingText.length, 12000)
  const majorBlock = trailingText.slice(0, safeEnd)
  const majorLine = normalizePdfExtractedText(majorBlock)

  log('parseCategoryScores', {
    majorLen: majorLine.length,
    topicsFound: findTopicsToReviewIndex(majorLine) !== -1,
    preview: majorLine.slice(0, 280),
  })

  const knownScores = parseKnownNclexCategoryScores(majorLine)
  if (knownScores.length) return knownScores

  const genericScores = parseGenericCategoryScores(majorLine)
  if (!genericScores.length) {
    const fromAnchor = normalized.slice(majorMatch.index)
    const topicsRel = findTopicsToReviewIndex(fromAnchor)
    const rescueSlice =
      topicsRel === -1 ? fromAnchor.slice(0, 4500) : fromAnchor.slice(0, topicsRel)
    const rescue = parseLabeledPointsPercentRows(rescueSlice)
    if (rescue.length) {
      log('parseCategoryScores: rescue parse from post-anchor window', { count: rescue.length })
      return rescue
    }
    logError('parseCategoryScores: no rows after sequential + global fallback', {
      preview: majorLine.slice(0, 500),
    })
    throw new Error(
      'Could not parse category scores. Open the browser console and expand the "[CP Worksheet] parseCategoryScores" log — if majorLen is 0, PDF text did not extract.',
    )
  }
  return genericScores
}

const determineLowestCategories = (fullText, count = 3) => {
  const scores = parseCategoryScores(fullText)
  return pickLowestCategoriesPreferringTopics(scores, fullText, count)
}

const mergeTopicBoundaries = (scoreCategories) => [
  ...new Set([
    ...scoreCategories,
    ...scoreCategories.flatMap((c) => categoryNameVariants(c)),
    ...topicBoundaryLabels(),
  ]),
]

/** Headed Topics To Review rows like `Clinical Judgment (12 items)`. */
const listTopicsHeadingLabels = (fullText) => {
  const topicsStart = findTopicsToReviewIndex(fullText)
  if (topicsStart === -1) return []

  const topicsTail = fullText.slice(topicsStart)
  let topicsBlock = normalizeWhitespace(topicsTail.slice(0, findTopicsBlockEnd(topicsTail)))
  // Drop the section title so it is not glued onto the first category heading.
  topicsBlock = topicsBlock.replace(/^Topics\s+To\s+Review\s*/i, '')
  const headingRe = /([A-Za-z][A-Za-z0-9/'&\-\s]+?)\s*\(\s*\d+\s*item[s]?\s*\)/gi
  const labels = []
  let match = headingRe.exec(topicsBlock)
  while (match !== null) {
    labels.push(normalizeWhitespace(match[1]))
    match = headingRe.exec(topicsBlock)
  }
  return labels
}

const categoryAppearsInTopicsHeadings = (category, topicsHeadings) => {
  const variants = categoryNameVariants(category).map((name) => name.toLowerCase())
  return topicsHeadings.some((heading) => variants.includes(heading.toLowerCase()))
}

/**
 * Prefer the weakest scores that also have a Topics To Review block.
 * Perfect-score major areas often have no Topics heading — never invent error copy for them.
 */
const pickLowestCategoriesPreferringTopics = (scores, fullText, count = 3) => {
  const sorted = [...scores].sort((a, b) => a.score - b.score)
  const topicsHeadings = listTopicsHeadingLabels(fullText)
  if (!topicsHeadings.length) return sorted.slice(0, count)

  const withTopics = sorted.filter((entry) =>
    categoryAppearsInTopicsHeadings(entry.category, topicsHeadings),
  )
  const withoutTopics = sorted.filter(
    (entry) => !categoryAppearsInTopicsHeadings(entry.category, topicsHeadings),
  )

  const picked = []
  for (const entry of withTopics) {
    if (picked.length >= count) break
    picked.push(entry)
  }
  for (const entry of withoutTopics) {
    if (picked.length >= count) break
    picked.push(entry)
  }
  return picked
}

/** Slice the Topics To Review block for one major category (shared by strict + soft extractors). */
const sliceNormalizedTopicsForCategory = (fullText, category, boundaryCategories = KNOWN_CATEGORIES) => {
  const topicsStart = findTopicsToReviewIndex(fullText)
  if (topicsStart === -1) return { kind: 'error', code: 'no-topics' }

  const topicsTail = fullText.slice(topicsStart)
  const topicsBlock = topicsTail.slice(0, findTopicsBlockEnd(topicsTail))

  const normalizedTopics = normalizeWhitespace(topicsBlock)
  const categoryVariants = categoryNameVariants(category)
  let startMatch = null
  for (const variant of categoryVariants) {
    const escapedCategory = escapeRegExp(variant).replace(/\s+/g, '\\s+')
    const startRegex = new RegExp(`${escapedCategory}\\s*\\(\\d+\\s+item[s]?\\)`, 'i')
    const attempt = normalizedTopics.match(startRegex)
    if (attempt && attempt.index !== undefined) {
      startMatch = attempt
      break
    }
  }

  if (!startMatch || startMatch.index === undefined) {
    return { kind: 'error', code: 'no-category', normalizedTopics }
  }

  const startIndex = startMatch.index + startMatch[0].length
  let endIndex = normalizedTopics.length

  const boundaries = [
    ...new Set(boundaryCategories.flatMap((c) => (c ? categoryNameVariants(c) : []))),
  ].filter((c) => !categoryVariants.some((v) => v.toLowerCase() === c.toLowerCase()))
  const sortedBoundaries = [...boundaries].sort((a, b) => b.length - a.length)

  for (const nextCategory of sortedBoundaries) {
    const escapedNext = escapeRegExp(nextCategory).replace(/\s+/g, '\\s+')
    const nextRegex = new RegExp(`${escapedNext}\\s*\\(\\d+\\s+item[s]?\\)`, 'i')
    const nextMatch = normalizedTopics.slice(startIndex).match(nextRegex)
    if (nextMatch && nextMatch.index !== undefined) {
      endIndex = Math.min(endIndex, startIndex + nextMatch.index)
    }
  }

  return {
    kind: 'ok',
    section: normalizedTopics.slice(startIndex, endIndex),
  }
}

/**
 * Nurse’s Touch / communications reports often omit “(Active Learning Template …)” lines.
 * Fill Sub Concept + Content from the major-category block when the strict parser throws.
 */
const extractFromMajorCategorySoft = (fullText, category, boundaryCategories = KNOWN_CATEGORIES) => {
  const sliced = sliceNormalizedTopicsForCategory(fullText, category, boundaryCategories)
  if (sliced.kind === 'error') {
    // Never put diagnostic copy into the worksheet Content field.
    return {
      subConcept: category,
      content: '',
    }
  }

  const section = sliced.section.trim()
  if (!section) {
    return {
      subConcept: category,
      content: '',
    }
  }

  let subConcept = category
  let rawContent = ''

  const innerItem = section.match(/([A-Za-z][A-Za-z0-9/'&\-\s]*?)\s+\(\d+\s+item[s]?\)/i)
  const altMatches = [...section.matchAll(/([^()]+?)\s+\(Active Learning Template/gi)]

  if (altMatches.length) {
    if (innerItem) subConcept = normalizeWhitespace(innerItem[1])
    rawContent = normalizeWhitespace(altMatches[0][1])
  } else if (innerItem) {
    const afterInner = section.slice(innerItem.index + innerItem[0].length).trim()
    const colonIdx = afterInner.indexOf(':')
    if (colonIdx !== -1) {
      const lineTitle = normalizeWhitespace(afterInner.slice(0, colonIdx))
      subConcept =
        lineTitle.length && lineTitle.length <= 100 ? lineTitle : normalizeWhitespace(innerItem[1])
      rawContent = normalizeWhitespace(afterInner.slice(colonIdx + 1))
    } else {
      subConcept = normalizeWhitespace(innerItem[1])
      rawContent = afterInner
    }
  } else {
    const colonIdx = section.indexOf(':')
    if (colonIdx === -1) {
      subConcept = category
      rawContent = normalizeWhitespace(section).slice(0, 600)
    } else {
      subConcept =
        normalizeWhitespace(section.slice(0, colonIdx).replace(/^[^A-Za-z0-9]+/, '')) || category
      rawContent = normalizeWhitespace(section.slice(colonIdx + 1))
    }
  }

  rawContent = clipTopicContent(
    rawContent.replace(/\s*\(Active Learning Template[\s\S]*$/i, '').replace(/\bALT\s*#?\d*\b/gi, ''),
    subConcept,
  )

  const cleanedContent = removeSubConceptPrefixFromContent(subConcept, rawContent)

  return {
    subConcept,
    content: cleanedContent || rawContent || '',
  }
}

const extractTopicMappingBestEffort = (fullText, category, boundaryCategories = KNOWN_CATEGORIES) => {
  try {
    return extractTopicMapping(fullText, category, boundaryCategories)
  } catch (e) {
    log('extractTopicMapping: soft fallback', { category, err: formatError(e) })
    return extractFromMajorCategorySoft(fullText, category, boundaryCategories)
  }
}

/**
 * Emergency fallback for reports where score-table parsing fails.
 * Builds P1/P2/P3 directly from "Topics To Review" headings and first colon line.
 */
const parseTopicsOnlyFallback = (fullText) => {
  const normalized = normalizePdfExtractedText(fullText)
  const topicsStart = findTopicsToReviewIndex(normalized)

  let topicsBlock = normalized
  if (topicsStart !== -1) {
    const tail = normalized.slice(topicsStart)
    topicsBlock = normalizeWhitespace(tail.slice(0, findTopicsBlockEnd(tail))).replace(
      /^Topics\s+To\s+Review\s*/i,
      '',
    )
  } else {
    // Extreme extraction fallback: keep a large normalized window and look for heading rows globally.
    topicsBlock = normalizeWhitespace(normalized.slice(0, 18000))
  }

  // Accept both "(1 item)" and tightly merged "(1item)" variants.
  const headingRe = /([A-Za-z][A-Za-z0-9/'&\-\s]+?)\s*\(\s*\d+\s*item[s]?\s*\)/gi
  const headings = []
  let match = headingRe.exec(topicsBlock)
  while (match !== null) {
    const category = normalizeWhitespace(match[1])
    headings.push({
      category,
      start: match.index + match[0].length,
      index: headings.length,
    })
    match = headingRe.exec(topicsBlock)
  }

  const rows = headings.map((entry, i) => {
    const nextStart = headings[i + 1]?.start ?? topicsBlock.length
    const section = normalizeWhitespace(topicsBlock.slice(entry.start, nextStart))
    const colonPos = section.indexOf(':')
    const mapped = colonPos === -1
      ? { subConcept: entry.category, content: clipTopicContent(section, entry.category) }
      : {
          subConcept: normalizeWhitespace(section.slice(0, colonPos)) || entry.category,
          content: clipTopicContent(section.slice(colonPos + 1), normalizeWhitespace(section.slice(0, colonPos))),
        }

    return {
      category: entry.category,
      score: entry.index, // synthetic rank score so existing sorting/picker flow still works
      mapping: {
        subConcept: mapped.subConcept || entry.category,
        content:
          removeSubConceptPrefixFromContent(mapped.subConcept || entry.category, mapped.content) ||
          mapped.content ||
          '',
      },
    }
  })

  // If we captured no heading rows, try direct colon-line harvesting from Topics text.
  if (!rows.length && topicsStart !== -1) {
    const lineLike = [...topicsBlock.matchAll(/([A-Za-z][A-Za-z0-9/'&\-\s]{3,120}):\s+([^:]{6,300})/gi)]
      .slice(0, worksheetConfigs.length)
      .map((m, index) => {
        const category = normalizeWhitespace(m[1])
        const content = normalizeWhitespace(m[2])
        return {
          category,
          score: index,
          mapping: {
            subConcept: category,
            content: content || '',
          },
        }
      })
    return lineLike
  }

  return rows
}

const extractTopicMapping = (fullText, category, boundaryCategories = KNOWN_CATEGORIES) => {
  const sliced = sliceNormalizedTopicsForCategory(fullText, category, boundaryCategories)
  if (sliced.kind === 'error') {
    if (sliced.code === 'no-topics') throw new Error('Could not find "Topics To Review" section.')
    throw new Error(`Could not find "${category}" inside Topics To Review.`)
  }

  const { section } = sliced
  const subConceptMatch = section.match(/([A-Za-z][A-Za-z/'&\-\s]+?)\s+\(\d+\s+item[s]?\)/)

  let subConcept = ''
  let rawContent = ''

  if (subConceptMatch) {
    subConcept = normalizeWhitespace(subConceptMatch[1])
    const contentMatches = [...section.matchAll(/([^()]+?)\s+\(Active Learning Template/gi)]
    if (!contentMatches.length) {
      throw new Error(`Could not extract sub concept/content for "${category}".`)
    }

    rawContent = normalizeWhitespace(contentMatches[0][1])
    const subConceptIndex = rawContent.toLowerCase().indexOf(subConcept.toLowerCase())
    if (subConceptIndex > 0) {
      rawContent = rawContent.slice(subConceptIndex)
    }
    rawContent = clipTopicContent(rawContent, subConcept)
  } else {
    const colonIdx = section.indexOf(':')
    if (colonIdx === -1) {
      throw new Error(`Could not extract sub concept/content for "${category}".`)
    }

    subConcept =
      normalizeWhitespace(section.slice(0, colonIdx).replace(/^[^A-Za-z]+/, '')) || category

    let afterColon = section.slice(colonIdx + 1).trim()
    const repeatLabel = new RegExp(`\\s${escapeRegExp(subConcept)}\\s*:`, 'i')
    const dupIdx = afterColon.search(repeatLabel)
    if (dupIdx > 0) {
      afterColon = afterColon.slice(0, dupIdx).trim()
    }

    rawContent = clipTopicContent(
      afterColon.replace(/\s*\(Active Learning Template[\s\S]*$/i, '').trim(),
      subConcept,
    )
  }

  const cleanedContent = removeSubConceptPrefixFromContent(subConcept, rawContent)

  return {
    subConcept,
    content: cleanedContent || rawContent,
  }
}

const wrapTextByWidth = (text, font, size, maxWidth) => {
  if (!text) return []

  const lines = []
  const paragraphs = text.replaceAll('\r\n', '\n').split('\n')

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }

    const words = paragraph.trim().split(/\s+/)
    let current = words[0]

    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`
      const width = font.widthOfTextAtSize(candidate, size)

      if (width <= maxWidth) {
        current = candidate
      } else {
        lines.push(current)
        current = words[i]
      }
    }

    lines.push(current)
  }

  return lines
}

const drawWrappedTextBlock = ({
  page,
  text,
  font,
  size,
  x,
  topY,
  maxWidth,
  maxHeight,
  lineHeight,
}) => {
  const lines = wrapTextByWidth(text, font, size, maxWidth)
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))

  for (let i = 0; i < Math.min(lines.length, maxLines); i += 1) {
    page.drawText(lines[i], {
      x,
      y: topY - i * lineHeight,
      size,
      font,
      color: rgb(0, 0, 0),
    })
  }
}

const drawDebugOutline = ({ page, x, y, width, height, label }) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.9, 0.15, 0.15),
    borderWidth: 1,
  })

  if (label) {
    page.drawText(label, {
      x: x + 4,
      y: y + height - 10,
      size: 8,
      color: rgb(0.9, 0.15, 0.15),
    })
  }
}

const getFieldId = (worksheetId, fieldName) => `${worksheetId}-${fieldName}`

const renderWorksheetCards = () => {
  const cardsEl = document.querySelector('#worksheetCards')
  cardsEl.innerHTML = worksheetConfigs
    .map(
      ({ id, title }) => `
      <article class="worksheet-card">
        <div>
          <p class="section-kicker">${id.toUpperCase()}</p>
          <h2>${title}</h2>
        </div>
        <p class="filename-line"><span id="${id}-filename"></span></p>

        <label>
          Client Care Need Category
          <input id="${getFieldId(id, 'clientCareNeedCategory')}" type="text" maxlength="140" />
        </label>

        <label>
          Sub Concept
          <textarea id="${getFieldId(id, 'subConcept')}" rows="2" maxlength="220"></textarea>
        </label>

        <label>
          Content
          <textarea id="${getFieldId(id, 'content')}" rows="4" maxlength="1200"></textarea>
        </label>

        <label>
          Critical Point 1
          <textarea id="${getFieldId(id, 'criticalPoint1')}" rows="3" maxlength="600"></textarea>
        </label>

        <label>
          Critical Point 2
          <textarea id="${getFieldId(id, 'criticalPoint2')}" rows="3" maxlength="600"></textarea>
        </label>

        <label>
          Critical Point 3
          <textarea id="${getFieldId(id, 'criticalPoint3')}" rows="3" maxlength="600"></textarea>
        </label>

        <div class="worksheet-actions">
          <button class="generate-one" data-worksheet-id="${id}" type="button">Generate ${id.toUpperCase()}</button>
        </div>
      </article>
    `,
    )
    .join('')
}

const getWorksheetValues = (worksheetId) => ({
  clientCareNeedCategory: document.querySelector(`#${getFieldId(worksheetId, 'clientCareNeedCategory')}`).value.trim(),
  subConcept: document.querySelector(`#${getFieldId(worksheetId, 'subConcept')}`).value.trim(),
  content: document.querySelector(`#${getFieldId(worksheetId, 'content')}`).value.trim(),
  criticalPoint1: document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint1')}`).value.trim(),
  criticalPoint2: document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint2')}`).value.trim(),
  criticalPoint3: document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint3')}`).value.trim(),
})

const setWorksheetValues = (worksheetId, values) => {
  document.querySelector(`#${getFieldId(worksheetId, 'clientCareNeedCategory')}`).value =
    values.clientCareNeedCategory || ''
  document.querySelector(`#${getFieldId(worksheetId, 'subConcept')}`).value = values.subConcept || ''
  document.querySelector(`#${getFieldId(worksheetId, 'content')}`).value = values.content || ''
  document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint1')}`).value = values.criticalPoint1 || ''
  document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint2')}`).value = values.criticalPoint2 || ''
  document.querySelector(`#${getFieldId(worksheetId, 'criticalPoint3')}`).value = values.criticalPoint3 || ''
}

const buildOutputFilename = (suffix = '') => {
  const safeExamName = slugifyFilenamePart(extractedExamName)
  const baseName = safeExamName
    ? `3-critical-points-filled-${safeExamName}`
    : '3-critical-points-filled'

  return suffix ? `${baseName}-${suffix}.pdf` : `${baseName}.pdf`
}

const buildCombinedOutputFilename = () => {
  const safeExamName = slugifyFilenamePart(extractedExamName)
  const baseName = safeExamName
    ? `3-critical-points-filled-${safeExamName}`
    : '3-critical-points-filled'

  return `${baseName}-p1-p2-p3-combined.pdf`
}

/**
 * Browsers may overwrite same-named downloads (esp. Safari). We add (2), (3), …
 * ourselves so each save keeps the previous file.
 */
const allocateUniqueDownloadFilename = (filename) => {
  const match = filename.match(/^(.*?)(\.[^.]+)?$/)
  const stem = match?.[1] || filename
  const ext = match?.[2] || ''
  const storageKey = `cpws:download-count:${stem}`

  let count = 0
  try {
    count = Number.parseInt(localStorage.getItem(storageKey) || '0', 10)
    if (!Number.isFinite(count) || count < 0) count = 0
  } catch {
    count = 0
  }

  count += 1
  try {
    localStorage.setItem(storageKey, String(count))
  } catch {
    // Private mode / blocked storage — still return a unique-enough name.
    return count === 1 ? `${stem}${ext}` : `${stem} (${count})${ext}`
  }

  return count === 1 ? `${stem}${ext}` : `${stem} (${count})${ext}`
}

const updateWorksheetFilenamePreviews = () => {
  for (const worksheet of worksheetConfigs) {
    const filenameEl = document.querySelector(`#${worksheet.id}-filename`)
    filenameEl.textContent = buildOutputFilename(worksheet.id)
  }
}

const extractAndPopulateWorksheets = async (file) => {
  const rawText = await extractTextFromPdf(file)
  const fullText = normalizePdfExtractedText(rawText)
  cachedReportText = fullText
  extractedExamName = extractExamName(fullText)

  let scores = []
  let fallbackTopicRows = []
  try {
    scores = parseCategoryScores(fullText)
  } catch (error) {
    fallbackTopicRows = parseTopicsOnlyFallback(fullText)
    if (!fallbackTopicRows.length) throw error
    log('extractAndPopulateWorksheets: using topics-only fallback', {
      count: fallbackTopicRows.length,
      reason: formatError(error),
    })
    scores = fallbackTopicRows.map(({ category, score }) => ({ category, score }))
  }

  cachedCategoryScores = scores

  const boundaries = mergeTopicBoundaries(scores.map((entry) => entry.category))
  const lowestThree = pickLowestCategoriesPreferringTopics(
    scores,
    fullText,
    worksheetConfigs.length,
  )

  for (let i = 0; i < worksheetConfigs.length; i += 1) {
    const worksheet = worksheetConfigs[i]
    const scoredCategory = lowestThree[i]

    if (!scoredCategory) {
      setWorksheetValues(worksheet.id, worksheet.defaults)
      continue
    }

    const fallbackRow = fallbackTopicRows.find((row) => row.category === scoredCategory.category)
    const mapping =
      fallbackRow?.mapping ??
      extractTopicMappingBestEffort(fullText, scoredCategory.category, boundaries)
    setWorksheetValues(worksheet.id, {
      clientCareNeedCategory: scoredCategory.category,
      subConcept: mapping.subConcept,
      content: mapping.content,
      criticalPoint1: '',
      criticalPoint2: '',
      criticalPoint3: '',
    })
  }

  updateWorksheetFilenamePreviews()

  const usingSyntheticScores = fallbackTopicRows.length > 0
  const filledSummary = usingSyntheticScores
    ? lowestThree.map((entry, index) => `P${index + 1}: ${entry.category}`).join(' | ')
    : lowestThree
        .map((entry, index) => `P${index + 1}: ${entry.category} (${entry.score.toFixed(1)}%)`)
        .join(' | ')

  return filledSummary
}

const createFilledPdfBytes = async ({
  clientCareNeedCategory,
  subConcept,
  content,
  criticalPoint1,
  criticalPoint2,
  criticalPoint3,
}) => {
  // Relative path works for Vite web preview and Electron packaged builds.
  const templateUrl = new URL('template.pdf', document.baseURI).toString()
  log('Loading template', templateUrl)
  const templateResponse = await fetch(templateUrl)
  if (!templateResponse.ok) {
    logError('template fetch failed', templateResponse.status, templateResponse.statusText)
    throw new Error(
      `Template PDF could not be loaded (${templateResponse.status}). Restart the app or use “npm run dev” in the browser.`,
    )
  }

  const templateBuffer = await templateResponse.arrayBuffer()
  const pdfBytes = new Uint8Array(templateBuffer)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const page = pdfDoc.getPage(0)

  drawWrappedTextBlock({
    page,
    text: clientCareNeedCategory,
    font,
    size: 12,
    x: CATEGORY_TEXT_X,
    topY: 595,
    maxWidth: CATEGORY_TEXT_MAX_WIDTH,
    maxHeight: 36,
    lineHeight: 14,
  })

  drawWrappedTextBlock({
    page,
    text: subConcept,
    font,
    size: 12,
    x: SUBCONCEPT_TEXT_X,
    topY: 537,
    maxWidth: SUBCONCEPT_TEXT_MAX_WIDTH,
    maxHeight: 36,
    lineHeight: 14,
  })

  drawWrappedTextBlock({
    page,
    text: content,
    font,
    size: 11,
    x: CONTENT_TEXT_X,
    topY: 475,
    maxWidth: CONTENT_TEXT_MAX_WIDTH,
    maxHeight: 66,
    lineHeight: 13,
  })

  const criticalPoints = [criticalPoint1, criticalPoint2, criticalPoint3]
  for (let i = 0; i < CRITICAL_POINT_ROWS.length; i += 1) {
    const row = CRITICAL_POINT_ROWS[i]
    const textTopY = row.bulletBaselineY + CRITICAL_POINT_VERTICAL_NUDGE
    const debugBox = {
      x: CRITICAL_POINT_TEXT_X - 2,
      y: textTopY - CRITICAL_POINT_TEXT_MAX_HEIGHT,
      width: CRITICAL_POINT_TEXT_MAX_WIDTH + 4,
      height: CRITICAL_POINT_TEXT_MAX_HEIGHT,
    }

    if (SHOW_CRITICAL_POINT_DEBUG_BOXES) {
      drawDebugOutline({ page, ...debugBox })
    }

    drawWrappedTextBlock({
      page,
      text: criticalPoints[i] || '',
      font,
      size: 10,
      x: CRITICAL_POINT_TEXT_X,
      topY: textTopY,
      maxWidth: CRITICAL_POINT_TEXT_MAX_WIDTH,
      maxHeight: CRITICAL_POINT_TEXT_MAX_HEIGHT,
      lineHeight: 10,
    })
  }

  return pdfDoc.save()
}

const triggerPdfDownload = (bytes, filename) => {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = allocateUniqueDownloadFilename(filename)
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const downloadFilledPdf = async (
  { clientCareNeedCategory, subConcept, content, criticalPoint1, criticalPoint2, criticalPoint3 },
  suffix = '',
) => {
  const filledPdfBytes = await createFilledPdfBytes({
    clientCareNeedCategory,
    subConcept,
    content,
    criticalPoint1,
    criticalPoint2,
    criticalPoint3,
  })
  triggerPdfDownload(filledPdfBytes, buildOutputFilename(suffix))
}

const downloadCombinedPdf = async () => {
  const combinedPdf = await PDFDocument.create()

  for (const worksheet of worksheetConfigs) {
    const values = getWorksheetValues(worksheet.id)
    const filledPdfBytes = await createFilledPdfBytes(values)
    const filledPdfDoc = await PDFDocument.load(filledPdfBytes)
    const [filledPage] = await combinedPdf.copyPages(filledPdfDoc, [0])
    combinedPdf.addPage(filledPage)
  }

  const combinedPdfBytes = await combinedPdf.save()
  triggerPdfDownload(combinedPdfBytes, buildCombinedOutputFilename())
}

renderWorksheetCards()

for (const worksheet of worksheetConfigs) {
  setWorksheetValues(worksheet.id, worksheet.defaults)
}

updateWorksheetFilenamePreviews()
setWorksheetEditorVisibility(false)

const runAutofillFromFile = async (file) => {
  setStatus('Reading headings from report...')
  const filledSummary = await extractAndPopulateWorksheets(file)
  setWorksheetEditorVisibility(true)
  setStatus(`Filled headings for: ${filledSummary}`)
}

extractButtonEl.addEventListener('click', async () => {
  try {
    const file = sourceReportEl.files?.[0]
    if (!file) {
      setStatus('Choose an ATI report PDF first.', true)
      return
    }

    await runAutofillFromFile(file)
  } catch (error) {
    console.error(error)
    setWorksheetEditorVisibility(false)
    setStatus(`Could not read that report PDF: ${formatError(error)}`, true)
  }
})

loadSampleReportEl.addEventListener('click', async () => {
  try {
    loadSampleReportEl.disabled = true
    setStatus('Loading practice sample…')
    const sampleUrl = new URL('sample-ati-report.pdf', document.baseURI).toString()
    const response = await fetch(sampleUrl)
    if (!response.ok) {
      throw new Error(`Could not fetch practice sample (${response.status}).`)
    }

    const blob = await response.blob()
    const file = new File([blob], 'sample-ati-report.pdf', { type: 'application/pdf' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    sourceReportEl.files = transfer.files

    await runAutofillFromFile(file)
    document.querySelector('.tool-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    console.error(error)
    setWorksheetEditorVisibility(false)
    setStatus(`Could not load the practice sample: ${formatError(error)}`, true)
  } finally {
    loadSampleReportEl.disabled = false
  }
})

sourceReportEl.addEventListener('change', async () => {
  const file = sourceReportEl.files?.[0]
  if (!file) {
    setWorksheetEditorVisibility(false)
    setStatus('')
    return
  }

  try {
    await runAutofillFromFile(file)
  } catch (error) {
    console.error(error)
    setWorksheetEditorVisibility(false)
    setStatus(`Could not read that report PDF: ${formatError(error)}`, true)
  }
})

document.querySelector('#generateCombined').addEventListener('click', async () => {
  try {
    setStatus('Generating combined PDF for p1, p2, p3...')
    await downloadCombinedPdf()
    setStatus('Generated combined worksheet PDF (3 pages).')
  } catch (error) {
    console.error(error)
    setStatus(`Could not generate combined PDF: ${formatError(error)}`, true)
  }
})

for (const button of document.querySelectorAll('.generate-one')) {
  button.addEventListener('click', async () => {
    const worksheetId = button.dataset.worksheetId
    if (!worksheetId) return

    try {
      setStatus(`Generating PDF for ${worksheetId.toUpperCase()}...`)
      const values = getWorksheetValues(worksheetId)
      await downloadFilledPdf(values, worksheetId)
      setStatus(`Generated worksheet PDF: ${worksheetId}.`)
    } catch (error) {
      console.error(error)
      setStatus(`Could not generate ${worksheetId} PDF: ${formatError(error)}`, true)
    }
  })
}

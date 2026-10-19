const normalizeWhitespace = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sameLabel = (left, right) => left.toLowerCase() === right.toLowerCase()

/**
 * Content is the topic title. A subconcept may appear inside that title
 * ("Role of the Nurse in Client Advocacy") and must stay there.
 * Only a repeated heading label is removed, and only from the front.
 */
export const finalizeTopicContent = (subConcept, rawContent) => {
  const title = normalizeWhitespace(rawContent)
  const label = normalizeWhitespace(subConcept)
  if (!title) return ''
  if (!label) return title

  const candidate = title
    .replace(
      new RegExp(
        `^${escapeRegExp(label)}\\s+(?:\\(\\s*\\d+\\s*items?\\s*\\)|\\d+\\s*items?)\\s+`,
        'i',
      ),
      '',
    )
    .trim()

  if (!candidate) return title
  if (sameLabel(candidate, label) && !sameLabel(title, label)) return title
  return candidate
}

/**
 * First subconcept and Active Learning Template title in one Topics section.
 * `clip` may trim footer text before the title is finalized.
 */
export const mapActiveLearningSection = (section, clip = (text) => text) => {
  const text = normalizeWhitespace(section)
  const subConceptMatch = text.match(/([A-Za-z][A-Za-z/'&\-\s]+?)\s+\(\d+\s+items?\)/i)
  if (!subConceptMatch) return null

  const contentMatches = [...text.matchAll(/([^()]+?)\s+\(Active Learning Template/gi)]
  if (!contentMatches.length) return null

  const subConcept = normalizeWhitespace(subConceptMatch[1])
  const rawContent = normalizeWhitespace(clip(contentMatches[0][1], subConcept))
  return {
    subConcept,
    content: finalizeTopicContent(subConcept, rawContent),
  }
}

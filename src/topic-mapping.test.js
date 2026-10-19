import assert from 'node:assert/strict'
import test from 'node:test'

import { finalizeTopicContent, mapActiveLearningSection } from './topic-mapping.js'

const managementOfCareSection = [
  'Advocacy (1 item)',
  'Role of the Nurse in Client Advocacy (Active Learning Template - Basic Concept)',
  'Assignment, Delegation and Supervision (1 item)',
  'Effective Communication to Assistive Personnel (Active Learning Template - Basic Concept)',
].join(' ')

test('a topic title that contains the subconcept stays the full title', () => {
  const mapped = mapActiveLearningSection(managementOfCareSection)
  assert.equal(mapped.subConcept, 'Advocacy')
  assert.equal(mapped.content, 'Role of the Nurse in Client Advocacy')
  assert.notEqual(mapped.content, mapped.subConcept)
})

test('the subconcept can sit in the middle of a longer title', () => {
  const mapped = mapActiveLearningSection(
    'Advocacy (1 item) Role of the Nurse in Client Advocacy During Discharge (Active Learning Template - Basic Concept)',
  )
  assert.equal(mapped.content, 'Role of the Nurse in Client Advocacy During Discharge')
})

test('a repeated heading with an item count is removed from the front', () => {
  assert.equal(
    finalizeTopicContent(
      'Advocacy',
      'Advocacy (1 item) Role of the Nurse in Client Advocacy',
    ),
    'Role of the Nurse in Client Advocacy',
  )
})

test('a longer title is not replaced by the subconcept word', () => {
  assert.equal(
    finalizeTopicContent('Advocacy', 'Role of the Nurse in Client Advocacy'),
    'Role of the Nurse in Client Advocacy',
  )
})

test('a title that starts with the subconcept is kept', () => {
  assert.equal(
    finalizeTopicContent('Advocacy', 'Advocacy for a Client Who Refuses Care'),
    'Advocacy for a Client Who Refuses Care',
  )
})

test('the same rule applies to any subconcept', () => {
  const mapped = mapActiveLearningSection(
    'Infection Control (1 item) Evaluating Understanding of Infection Control (Active Learning Template - Nursing Skill)',
  )
  assert.equal(mapped.subConcept, 'Infection Control')
  assert.equal(mapped.content, 'Evaluating Understanding of Infection Control')
  assert.notEqual(mapped.content, mapped.subConcept)
})

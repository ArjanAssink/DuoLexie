#!/usr/bin/env node
/**
 * Best-effort import of the word list from github.com/ArjanAssink/Hangman
 * into shared/curriculum/words.json.
 *
 * Segments each word into DuoLexie klanken with a greedy longest-match
 * scan (try 4-letter klanken, then 3, then 2, then 1, at each position).
 * This is NOT real Dutch phonics analysis — it's a heuristic that happens
 * to work for most regular spellings but has no notion of syllable
 * boundaries or loanword exceptions. Every imported word is marked
 * `reviewed: false` and must be spot-checked by a human before being
 * trusted the way the hand-curated words are.
 *
 * Words containing a letter outside DuoLexie's klanken alphabet (c, q, x, y —
 * loanwords like ACCORDEON, XYLOFOON) can't be segmented at all and are
 * skipped, reported separately, never guessed.
 *
 * Usage: node tools/import-hangman-words.mjs <path-to-hangman-index.html>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const hangmanPath = process.argv[2]
if (!hangmanPath) {
  console.error('Usage: node tools/import-hangman-words.mjs <path-to-hangman-index.html>')
  process.exit(1)
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const soundsPath = `${repoRoot}shared/curriculum/sounds.json`
const wordsPath = `${repoRoot}shared/curriculum/words.json`

const sounds = JSON.parse(readFileSync(soundsPath, 'utf8'))
const words = JSON.parse(readFileSync(wordsPath, 'utf8'))

// klank -> category, and a fixed "how advanced" tier per category (mede doesn't count —
// every word has consonants; the word's category is its most advanced *vowel* tier).
const categoryOfKlank = new Map()
const TIER = { mede: 0, kort: 1, lang: 2, twee: 3, drie: 4, vier: 5 }
for (const cat of sounds.categories) {
  for (const s of cat.sounds) categoryOfKlank.set(s, cat.id)
}

// longest-match-first order
const KLANKEN = [...categoryOfKlank.keys()].sort((a, b) => b.length - a.length)

function segment(word) {
  const lower = word.toLowerCase()
  const klanken = []
  let i = 0
  while (i < lower.length) {
    const hit = KLANKEN.find((k) => lower.startsWith(k, i))
    if (!hit) return null // unknown letter (loanword) — can't segment, don't guess
    klanken.push(hit)
    i += hit.length
  }
  return klanken
}

function categoryFor(klanken) {
  let best = 'kort'
  let bestTier = 0
  for (const k of klanken) {
    const cat = categoryOfKlank.get(k)
    if (cat && TIER[cat] > bestTier) {
      bestTier = TIER[cat]
      best = cat
    }
  }
  return best
}

const html = readFileSync(hangmanPath, 'utf8')
const wordRe = /\{\s*word:\s*'([^']+)',\s*hint:\s*'((?:[^'\\]|\\.)*)'\s*\}/g
const hangmanEntries = []
let match
while ((match = wordRe.exec(html))) {
  hangmanEntries.push({ word: match[1], hint: match[2].replace(/\\'/g, "'") })
}

const existingIds = new Set(words.words.map((w) => w.id))
const added = []
const skipped = []
const dupes = []

for (const { word, hint } of hangmanEntries) {
  const id = word.toLowerCase()
  if (existingIds.has(id)) {
    dupes.push(word)
    continue
  }
  const klanken = segment(word)
  if (!klanken) {
    skipped.push({ word, hint, reason: 'contains a letter outside the klanken alphabet (likely a loanword)' })
    continue
  }
  added.push({
    id,
    text: id,
    category: categoryFor(klanken),
    klanken,
    reviewed: false,
    hint, // kept only in the review report below, NOT written into words.json
  })
}

// write words.json without the `hint` field — it's not part of the app's Word schema
words.words.push(
  ...added.map(({ hint, ...w }) => w), // eslint-disable-line no-unused-vars
)
writeFileSync(wordsPath, JSON.stringify(words, null, 2) + '\n')

const report = [
  `# Hangman word import — review report`,
  ``,
  `${hangmanEntries.length} words found in the source file.`,
  `${dupes.length} already existed in words.json (skipped as duplicates).`,
  `${added.length} segmented and added to words.json, all marked "reviewed": false.`,
  `${skipped.length} could not be segmented at all (loanword letters) and were left out entirely.`,
  ``,
  `## Added — please spot-check the klanken breakdown against the hint`,
  ``,
  '| word | hint | category | klanken |',
  '|---|---|---|---|',
  ...added.map((w) => `| ${w.text} | ${w.hint} | ${w.category} | ${w.klanken.join(' · ')} |`),
  ``,
  `## Skipped entirely (not added anywhere)`,
  ``,
  '| word | hint | reason |',
  '|---|---|---|',
  ...skipped.map((w) => `| ${w.word} | ${w.hint} | ${w.reason} |`),
].join('\n')

writeFileSync(`${repoRoot}tools/hangman-import-report.md`, report + '\n')

console.log(`Added ${added.length}, skipped ${skipped.length} (loanwords), ${dupes.length} duplicates.`)
console.log(`Review report: tools/hangman-import-report.md`)

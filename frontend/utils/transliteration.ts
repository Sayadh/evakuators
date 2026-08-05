/**
 * Script-agnostic search keys for Armenian place names.
 *
 * ## The problem
 *
 * The same town is typed three ways by three people: «Երևան», `yerevan`,
 * «Ереван». Matching on the literal string finds one of them. Adding Russian
 * aliases by hand to 358 locations would be 358 chances to make a typo, would
 * need redoing for every new settlement, and would still miss the spellings
 * nobody thought of.
 *
 * So instead of storing more strings, every string — indexed term and typed
 * query alike — is reduced to one comparison key. Whatever script it arrived
 * in, «Երևան», `yerevan` and «Ереван» all become `erevan`.
 *
 * ## How
 *
 * 1. Transliterate Armenian and Cyrillic letters to Latin.
 * 2. Fold the spellings that Armenian romanisation genuinely varies between,
 *    so `Tsaghkadzor`, `Цахкадзор` and «Ծաղկաձոր» meet at `caxkazor`.
 *
 * The fold is deliberately conservative. Merging more sounds would match more
 * typos and also more wrong towns; every rule below is a real, observed
 * variation in how Armenian names are written, not a general fuzzy-match
 * heuristic. This is not a phonetic algorithm and does not try to be one.
 *
 * ## What it does not fix
 *
 * Names that differ by more than spelling. «Эчмиадзин» is not a transliteration
 * of «Վաղարշապատ», it is a different name for the same town — no letter rule
 * reaches that, and it is what the hand-written aliases in the data are for.
 * The division of labour is deliberate: the transliterator handles the rule,
 * the alias handles the exception.
 */

/** Digraphs first — order matters, `ու` must be consumed before `ո` */
const ARMENIAN: [string, string][] = [
  ['ու', 'u'],
  ['և', 'ev'],
  ['ա', 'a'], ['բ', 'b'], ['գ', 'g'], ['դ', 'd'], ['ե', 'e'], ['զ', 'z'],
  ['է', 'e'], ['ը', 'y'], ['թ', 't'], ['ժ', 'zh'], ['ի', 'i'], ['լ', 'l'],
  ['խ', 'kh'], ['ծ', 'ts'], ['կ', 'k'], ['հ', 'h'], ['ձ', 'dz'], ['ղ', 'gh'],
  ['ճ', 'ch'], ['մ', 'm'], ['յ', 'y'], ['ն', 'n'], ['շ', 'sh'], ['ո', 'o'],
  ['չ', 'ch'], ['պ', 'p'], ['ջ', 'j'], ['ռ', 'r'], ['ս', 's'], ['վ', 'v'],
  ['տ', 't'], ['ր', 'r'], ['ց', 'ts'], ['փ', 'p'], ['ք', 'k'], ['օ', 'o'],
  ['ֆ', 'f'],
]

const CYRILLIC: [string, string][] = [
  ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['д', 'd'], ['е', 'e'],
  ['ё', 'e'], ['ж', 'zh'], ['з', 'z'], ['и', 'i'], ['й', 'y'], ['к', 'k'],
  ['л', 'l'], ['м', 'm'], ['н', 'n'], ['о', 'o'], ['п', 'p'], ['р', 'r'],
  ['с', 's'], ['т', 't'], ['у', 'u'], ['ф', 'f'], ['х', 'kh'], ['ц', 'ts'],
  ['ч', 'ch'], ['ш', 'sh'], ['щ', 'sh'], ['ъ', ''], ['ы', 'y'], ['ь', ''],
  ['э', 'e'], ['ю', 'yu'], ['я', 'ya'],
]

/**
 * Ordered: digraphs are folded before the single letters they contain, so `ts`
 * becomes `c` before the `t` and `s` are looked at separately.
 */
const FOLD: [RegExp, string][] = [
  // Initial «Ե» is written `ye` or `e` — Yerevan / Erevan / Ереван
  [/^ye/, 'e'],
  [/ye/g, 'e'],
  // Cyrillic я/ю/ё carry a y the Latin spellings often drop: Абовян / Abovyan
  [/ya/g, 'a'],
  [/yu/g, 'u'],
  // խ and ղ are written kh, gh or x in Latin — and Russian is not consistent
  // with itself: «Цахкадзор» spells ղ as `х` while «Мегри» spells it `г`. So
  // գ folds in with them. It costs the Գ/Ղ distinction, which no two Armenian
  // place names rely on, and it buys Мегри/Meghri, Птгни/Ptghni and
  // Вагаршапат/Vagharshapat all landing on the same key.
  [/kh/g, 'x'],
  [/gh/g, 'x'],
  [/g/g, 'x'],
  // ծ and ց: ts or c. Ծաղկաձոր / Tsaghkadzor / Цахкадзор
  [/ts/g, 'c'],
  // ձ: dz or z
  [/dz/g, 'z'],
  // ժ: zh or j
  [/zh/g, 'j'],
  // Russian drops the initial Հ entirely: «Раздан» for Հրազդան, «Ахпат» for
  // Հաղպատ, «Алидзор» for Հալիձոր. Only word-initial — an `h` inside a word is
  // either a real sound or part of a digraph already folded above.
  [/^h/, ''],
  // Doubled letters are a common transliteration artefact
  [/(.)\1+/g, '$1'],
]

const ARMENIAN_MAP = new Map(ARMENIAN)
const CYRILLIC_MAP = new Map(CYRILLIC)
/** Longest first, so `ու` wins over `ո` */
const ARMENIAN_DIGRAPHS = ARMENIAN.filter(([source]) => source.length > 1).map(([source]) => source)

function transliterate(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2)
    if (ARMENIAN_DIGRAPHS.includes(pair)) {
      result += ARMENIAN_MAP.get(pair)
      index += 1
      continue
    }
    const char = value[index]!
    result += ARMENIAN_MAP.get(char) ?? CYRILLIC_MAP.get(char) ?? char
  }
  return result
}

/**
 * The comparison key for one term. Must be applied to both sides — an indexed
 * name and a typed query — or they will never meet.
 *
 * Expects an already-normalized string (lowercased, trimmed, single spaces):
 * see `normalizeLocationQuery`, which is the only caller in practice.
 */
export function toSearchKey(normalized: string): string {
  let key = transliterate(normalized)
  for (const [pattern, replacement] of FOLD) key = key.replace(pattern, replacement)
  // Everything that is not a letter, a digit or a space carries no meaning here
  // — «Գառնի–Գեղարդ», "Garni-Geghard" and "garni geghard" are one term.
  return key.replace(/[^a-z0-9]+/g, '')
}

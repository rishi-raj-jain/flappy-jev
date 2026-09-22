// A friendly, editable default name so a fresh result is never anonymous.
const ADJECTIVES = ['swift', 'brave', 'sleepy', 'cheeky', 'nimble', 'plucky', 'sneaky', 'mighty', 'lucky', 'zippy', 'fluffy', 'grumpy', 'dizzy', 'sunny', 'chirpy', 'bouncy', 'wobbly', 'jolly', 'feisty', 'breezy']
const NOUNS = ['sparrow', 'falcon', 'robin', 'finch', 'magpie', 'swift', 'heron', 'pigeon', 'wren', 'starling', 'kestrel', 'puffin', 'raven', 'swallow', 'canary', 'parrot', 'hawk', 'owl', 'crane', 'lark']

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** e.g. "swift-falcon-482", unique enough to tell rows apart, easy to rename. */
export function randomUsername(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(Math.random() * 900) + 100}`
}

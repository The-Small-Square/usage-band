export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = { tokens?: number; window: number; percent?: number; costUsd?: number; limits: Limit[] }
/** One prompt's turn: what it cost and where the context stood after it. */
export type TurnStat = {
  at: number
  /** The prompt as typed, whitespace folded: matched against the transcript's prompt rows. */
  key: string
  prompt: string
  before: number
  context: number
  delta: number
  input: number
  output: number
  /** null for a prompt rebuilt from the transcript, which records no cost. */
  costUsd: number | null
  durationMs: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null; turns: Shaped<TurnStat[]> }
  }
}

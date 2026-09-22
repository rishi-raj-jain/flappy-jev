import { bigint, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const results = pgTable('results', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  youScore: integer('you_score').notNull(),
  jevScore: integer('jev_score').notNull(),
  winner: text('winner').notNull(), // 'you' | 'jev' | 'tie'
  seed: bigint('seed', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ResultRow = typeof results.$inferSelect
export type Winner = 'you' | 'jev' | 'tie'

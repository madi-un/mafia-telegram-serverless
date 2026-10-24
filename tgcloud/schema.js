import { table, integer, json } from 'sdk/db';

export const games = table('mafia_games', {
  chatId: integer('chat_id').primaryKey(),
  state: json('state').notNull(),
});

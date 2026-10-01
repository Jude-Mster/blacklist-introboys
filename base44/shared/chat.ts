// Chat helpers shared by chatSend and the poker table.

export const GUILD_CHANNEL = 'guild';
export const tableChannel = (tableId: string) => `table:${tableId}`;

export async function postSystem(b, channel: string, text: string) {
  try {
    await b.asServiceRole.entities.ChatMessage.create({
      channel,
      member_id: '',
      discord_id: '',
      name: 'Guild hall',
      avatar: '',
      role: 'system',
      text: text.slice(0, 300),
      kind: 'system',
      deleted: false
    });
  } catch (e) {
    console.error('system chat failed', e);
  }
}
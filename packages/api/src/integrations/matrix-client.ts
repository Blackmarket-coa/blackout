export const matrixClient = {
  async sendMessage(channelId: string, content: string) {
    return { channelId, content, status: 'queued' as const };
  },
};

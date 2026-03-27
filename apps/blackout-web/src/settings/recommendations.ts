export interface RecommendationSignals {
  channelsVisited30d: number;
  replyGraphAffinity: number;
  mentionFrequency30d: number;
}

export interface RecommendationResult {
  meaningfulInteractionProbability: number;
}

export function scoreMeaningfulInteraction(signal: RecommendationSignals): RecommendationResult {
  const channelScore = Math.min(1, signal.channelsVisited30d / 30);
  const replyGraphScore = Math.min(1, Math.max(0, signal.replyGraphAffinity));
  const mentionScore = Math.min(1, signal.mentionFrequency30d / 25);

  const probability = (channelScore * 0.35) + (replyGraphScore * 0.45) + (mentionScore * 0.2);

  return {
    meaningfulInteractionProbability: Number(probability.toFixed(4)),
  };
}

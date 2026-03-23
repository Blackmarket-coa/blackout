export function createCheckoutSession(userId: string, tier: string) {
  return {
    userId,
    tier,
    url: 'https://checkout.stripe.com/pay/stub',
  };
}

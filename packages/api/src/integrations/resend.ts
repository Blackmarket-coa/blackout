export function sendVerificationEmail(email: string) {
  return { email, status: 'queued' as const };
}

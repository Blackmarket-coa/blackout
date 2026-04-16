interface AuthViewProps {
  mode: "login" | "register";
  busy: boolean;
  homeserverUrl: string;
}

export function renderAuthView({ mode, busy, homeserverUrl }: AuthViewProps): string {
  const isLogin = mode === "login";
  return `
    <section class="auth-shell">
      <form id="auth-form" class="stack auth-card">
        <h2>${isLogin ? "Welcome back" : "Create your account"}</h2>
        <label>Root URL <input required name="homeserverUrl" type="url" value="${homeserverUrl}" autocomplete="url" /></label>
        <label>Username <input required name="username" autocomplete="username" /></label>
        <label>Password <input required name="password" type="password" autocomplete="current-password" /></label>
        <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Working\u2026" : isLogin ? "Sign in" : "Register"}</button>
      </form>
      <button type="button" class="link-btn" data-action="toggle-auth-mode">
        ${isLogin ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
    </section>
  `;
}

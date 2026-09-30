import { useState } from "react";
import type { FormEvent } from "react";
import { useJournal } from "../store";

const INPUT =
  "w-full h-[34px] px-3 rounded-sm border border-line-strong bg-bg text-[13px] text-ink placeholder:text-dim/60 hover:border-accent-line focus-visible:border-accent transition-colors";

/**
 * Shown in place of every page while signed out. Once the session arrives, `App` swaps in the
 * app at whatever URL was asked for, so there is nothing to navigate to here.
 */
export default function SignInScreen() {
  const { signIn } = useJournal();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const message = await signIn(email.trim(), password);
    setBusy(false);
    setError(message);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg text-ink px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-[320px] border border-line rounded-md bg-surface px-8 py-8 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="w-[22px] h-[22px] rounded-sm border border-accent flex items-center justify-center text-accent text-[13px]">
            <i className="ph ph-notebook" />
          </span>
          <span className="text-[14px] font-medium tracking-[-0.015em]">The Journal</span>
        </div>

        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="Email"
          aria-label="Email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className={INPUT}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          className={INPUT}
        />

        {error && <div className="text-[12px] text-loss">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="h-[34px] rounded-sm border-0 bg-accent-deep text-white text-[13px] cursor-pointer hover:bg-accent-ink disabled:opacity-60 disabled:cursor-default transition-colors"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

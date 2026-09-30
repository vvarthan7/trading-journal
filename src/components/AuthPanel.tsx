import { useJournal } from "../store";

/** Sidebar account block. The sidebar only renders signed in, since the whole site is private. */
export default function AuthPanel() {
  const { session, signOut } = useJournal();
  if (!session) return null;

  return (
    <div className="px-3 flex flex-col gap-2">
      <div className="text-[11px] tracking-[0.08em] uppercase text-dim">Signed in</div>
      <div className="text-[12.5px] text-ink-2 truncate" title={session.user.email}>
        {session.user.email}
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="self-start p-0 border-0 bg-transparent cursor-pointer text-[12.5px] text-accent-deep hover:text-ink transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

// Must pass: the punctuation design D14 allows as literal text — · — ＋ * ▲ ▼.
export function Marks({ a, b }: { a: string; b: string }) {
  return (
    <p>
      {a} · {b} — ＋ * ▲ ▼ <span title="·">{'—'}</span>
    </p>
  );
}

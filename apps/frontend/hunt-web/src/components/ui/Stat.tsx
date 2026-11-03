/** One big number with a label, like a game score counter (points, rank, stalls). */
export function Stat({
  label,
  value,
  highlight = false,
}: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3 ${
        highlight ? 'btn-sun' : 'glass'
      }`}
    >
      <span
        className={`text-[12px] font-extrabold tracking-[0.12em] uppercase ${highlight ? 'text-[#7a4f00]' : 'text-lilac'}`}
      >
        {label}
      </span>
      <span
        className={`font-display text-[28px] leading-none font-bold tabular-nums ${highlight ? '' : 'text-white'}`}
      >
        {value}
      </span>
    </div>
  );
}

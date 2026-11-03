/** Chunky circular loading indicator that follows the text colour. */
export function Spinner({ className = 'size-6' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`}
    />
  );
}

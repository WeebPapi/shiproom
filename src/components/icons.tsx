// 16px stroke icons; decorative, so hidden from assistive tech.
const paths = {
  home: "M2.5 7 8 2.5 13.5 7v6a.5.5 0 0 1-.5.5h-3v-4H6v4H3a.5.5 0 0 1-.5-.5V7Z",
  inbox: "M2.5 9h3l1 2h3l1-2h3M3.5 3.5h9l1 5.5v3.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V9l1-5.5Z",
  plug: "M6 2.5v3M10 2.5v3M4.5 5.5h7v2a3.5 3.5 0 0 1-7 0v-2ZM8 11v2.5",
  users: "M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5M10.5 3.2a2.25 2.25 0 0 1 0 4.1M12 9.8c1 .5 1.8 1.6 2 3.2",
  plus: "M8 3v10M3 8h10",
  chevron: "m5 6.5 3 3 3-3",
  check: "m3.5 8.5 3 3 6-7",
  logout: "M9.5 3H12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9.5M6.5 5 3.5 8l3 3M3.5 8h7",
  pr: "M4.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 0v6m0 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 0V6A1.5 1.5 0 0 0 10 4.5H7.5M9 3 7.5 4.5 9 6",
  external: "M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5V4.5a.5.5 0 0 1 .5-.5h3.5",
  github:
    "M8 1.5a6.5 6.5 0 0 0-2.06 12.67c.33.06.44-.14.44-.31v-1.1c-1.8.39-2.18-.87-2.18-.87-.3-.75-.72-.95-.72-.95-.59-.4.04-.4.04-.4.65.05 1 .67 1 .67.58 1 1.52.71 1.89.54.06-.42.23-.7.41-.87-1.44-.16-2.95-.72-2.95-3.2 0-.71.25-1.29.67-1.74-.07-.17-.29-.83.06-1.72 0 0 .55-.18 1.79.66a6.2 6.2 0 0 1 3.26 0c1.24-.84 1.79-.66 1.79-.66.35.9.13 1.55.06 1.72.42.45.67 1.03.67 1.74 0 2.49-1.52 3.04-2.96 3.2.23.2.44.6.44 1.2v1.78c0 .17.11.38.45.31A6.5 6.5 0 0 0 8 1.5Z",
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={paths[name]} fill={name === "github" ? "currentColor" : undefined} stroke={name === "github" ? "none" : undefined} />
    </svg>
  );
}

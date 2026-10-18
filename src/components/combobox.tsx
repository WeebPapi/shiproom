"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "./styles";

/** Free-text input with a compact, filterable suggestion list (a styleable replacement for `<datalist>`). */
export function Combobox({ options, ...inputProps }: Omit<React.ComponentProps<"input">, "list" | "value" | "onChange"> & { options: string[] }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));
  const expanded = open && matches.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  // Uncontrolled so React's post-action form reset still clears it; state only mirrors it for filtering.
  const sync = (value: string) => {
    setQuery(value);
    setActive(-1);
    setOpen(true);
  };
  const choose = (option: string) => {
    if (inputRef.current) inputRef.current.value = option;
    setQuery(option);
    setOpen(false);
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && matches.length) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((i) => (i < 0 ? (step > 0 ? 0 : matches.length - 1) : (i + step + matches.length) % matches.length));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full">
      <input
        {...inputProps}
        ref={inputRef}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        className={inputClass}
        onFocus={(e) => sync(e.currentTarget.value)}
        onChange={(e) => sync(e.currentTarget.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
      >
        {matches.map((option, i) => (
          <li
            key={option}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className="cursor-pointer truncate rounded px-2 py-1.5 font-mono text-xs aria-selected:bg-subtle"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(option)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}

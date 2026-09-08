import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export type SelectOption = { value: string; label: string };
type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
};

export default function CustomSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: CustomSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const [height, setHeight] = useState(240);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function show() {
    if (!options.length) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - 16;
      const useAbove = below < 180 && rect.top > below;
      setAbove(useAbove);
      setHeight(Math.max(80, Math.min(240, useAbove ? rect.top - 16 : below)));
    }
    setActive(selected);
    search.current.text = "";
    setOpen(true);
  }

  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, id]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) show();
      if (event.key === "Home") setActive(0);
      else if (event.key === "End") setActive(options.length - 1);
      else if (open)
        setActive((index) =>
          Math.min(
            options.length - 1,
            Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
          ),
        );
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (!open) show();
      const now = Date.now();
      search.current.text =
        (now - search.current.time < 700 ? search.current.text : "") +
        event.key.toLowerCase();
      search.current.time = now;
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(search.current.text),
      );
      if (index !== -1) setActive(index);
    }
  }

  return (
    <div
      ref={root}
      className={`select-field custom-select ${open ? "is-open" : ""}`}
    >
      <label htmlFor={id}>
        {ariaLabel.replace(" filter", "").replace("New incident ", "")}
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        className="select-trigger"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node))
            setOpen(false);
        }}
      >
        <span>{options[selected]?.label ?? "Choose an option"}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className={`select-menu ${above ? "above" : ""}`}
          style={{ maxHeight: height }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`select-option ${active === index ? "highlighted" : ""}`}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

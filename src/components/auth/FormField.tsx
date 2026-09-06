import type { ReactNode, Ref } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "w-full rounded-lg bg-card border px-3 py-2 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
  multiline?: boolean;
  rows?: number;
  inputRef?: Ref<HTMLInputElement>;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
  multiline = false,
  rows = 4,
  inputRef,
}: FormFieldProps) {
  const fieldClassName = cn(inputBase, error ? "border-red-400 focus:ring-red-400" : "border-input focus:ring-primary");
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;

  return (
    <div>
      <label htmlFor={id} className="text-foreground mb-1 block text-sm">
        {label}
      </label>
      <div className="relative">
        <span
          className={cn(
            "text-muted-foreground absolute left-3 size-4",
            multiline ? "top-3" : "top-1/2 -translate-y-1/2",
          )}
        >
          {icon}
        </span>
        {multiline ? (
          <textarea
            id={id}
            name={name ?? id}
            value={value}
            rows={rows}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className={fieldClassName}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
        ) : (
          <input
            ref={inputRef}
            id={id}
            name={name ?? id}
            type={type}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className={fieldClassName}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
        )}
        {endContent}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 flex items-center gap-1 text-xs text-red-700">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}

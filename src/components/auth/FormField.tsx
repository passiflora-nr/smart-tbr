import type { ReactNode, Ref } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

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
  const fieldClassName = cn(
    inputBase,
    error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
  );

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <div className="relative">
        <span className={cn("absolute left-3 size-4 text-white/40", multiline ? "top-3" : "top-1/2 -translate-y-1/2")}>
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
          />
        )}
        {endContent}
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}

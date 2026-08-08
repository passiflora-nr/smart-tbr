import { CircleAlert, Tag, X } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { tropeListSchema } from "@/lib/book-schema";

const inputBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

interface TropeInputProps {
  id: string;
  label: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  pendingText: string;
  onPendingTextChange: (text: string) => void;
  error?: string;
  onErrorChange?: (error: string | undefined) => void;
}

function getFirstZodError(error: z.ZodError): string {
  return error.issues[0].message;
}

function tryCommitTag(
  tags: string[],
  textToCommit: string,
  onTagsChange: (tags: string[]) => void,
  onPendingTextChange: (text: string) => void,
  onErrorChange?: (error: string | undefined) => void,
): void {
  const trimmed = textToCommit.trim();
  if (!trimmed) {
    onPendingTextChange("");
    onErrorChange?.(undefined);
    return;
  }

  if (tags.includes(trimmed)) {
    onPendingTextChange("");
    onErrorChange?.(undefined);
    return;
  }

  const candidate = [...tags, trimmed];
  const result = tropeListSchema.safeParse(candidate);
  if (!result.success) {
    onErrorChange?.(getFirstZodError(result.error));
    return;
  }

  onTagsChange(result.data);
  onPendingTextChange("");
  onErrorChange?.(undefined);
}

export function TropeInput({
  id,
  label,
  tags,
  onTagsChange,
  pendingText,
  onPendingTextChange,
  error,
  onErrorChange,
}: TropeInputProps) {
  function commitPendingText() {
    tryCommitTag(tags, pendingText, onTagsChange, onPendingTextChange, onErrorChange);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitPendingText();
      return;
    }

    if (e.key === "Backspace" && pendingText === "" && tags.length > 0) {
      onTagsChange(tags.slice(0, -1));
      onErrorChange?.(undefined);
    }
  }

  function handleRemoveTag(index: number) {
    onTagsChange(tags.filter((_, i) => i !== index));
    onErrorChange?.(undefined);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <div className="relative">
        <span className="absolute top-3 left-3 size-4 text-white/40">
          <Tag className="size-4" />
        </span>
        <div
          className={cn(
            inputBase,
            "flex min-h-[42px] flex-wrap items-center gap-1.5 pl-10",
            error
              ? "border-red-400/60 focus-within:ring-2 focus-within:ring-red-400"
              : "border-white/20 focus-within:ring-2 focus-within:ring-purple-400",
          )}
        >
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${String(index)}`}
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-sm text-white"
            >
              {tag}
              <button
                type="button"
                onClick={() => {
                  handleRemoveTag(index);
                }}
                aria-label={`Remove ${tag}`}
                className="rounded text-white/60 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-400"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            type="text"
            value={pendingText}
            onChange={(e) => {
              onPendingTextChange(e.target.value);
              if (error) onErrorChange?.(undefined);
            }}
            onKeyDown={handleKeyDown}
            onBlur={commitPendingText}
            placeholder={tags.length === 0 ? "Type a trope and press Enter" : "Add another trope"}
            className="min-w-[120px] flex-1 bg-transparent py-0.5 text-white placeholder-white/40 focus:outline-none"
          />
        </div>
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

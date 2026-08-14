import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { BookOpen, FileText, PenLine, User } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { TropeInput } from "@/components/books/TropeInput";
import {
  bookSchema,
  isBookMutationError,
  isBookMutationSuccess,
  tropeListSchema,
  type BookPayload,
} from "@/lib/book-schema";

interface FieldErrors {
  title?: string;
  author?: string;
  tropes?: string;
  description?: string;
}

interface EditBookFormProps {
  id: string;
  title: string;
  author: string;
  tropes: string[];
  description: string | null;
}

const UNSAVED_LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

// Mirrors TropeInput's commit rules so pressing Save accepts exactly what
// pressing Enter would have accepted.
function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function mergePendingTrope(tags: string[], pendingText: string): { tropes: string[]; error?: string } {
  const trimmed = pendingText.trim();
  if (!trimmed) return { tropes: tags };
  const candidate = tags.includes(trimmed) ? tags : [...tags, trimmed];
  const result = tropeListSchema.safeParse(candidate);
  if (!result.success) {
    return { tropes: tags, error: result.error.issues[0].message };
  }
  return { tropes: result.data };
}

function mapFieldErrors(fieldErrors: Record<string, string[] | undefined>): FieldErrors {
  return {
    title: fieldErrors.title?.[0],
    author: fieldErrors.author?.[0],
    tropes: fieldErrors.tropes?.[0],
    description: fieldErrors.description?.[0],
  };
}

export default function EditBookForm({
  id,
  title: initialTitle,
  author: initialAuthor,
  tropes: initialTropes,
  description: initialDescription,
}: EditBookFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [tags, setTags] = useState<string[]>(initialTropes);
  const [pendingTropeText, setPendingTropeText] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const allowLeaveRef = useRef(false);

  const isDirty = useMemo(() => {
    if (title !== initialTitle) return true;
    if (author !== initialAuthor) return true;
    if (description !== (initialDescription ?? "")) return true;
    if (!arraysEqual(tags, initialTropes)) return true;
    if (pendingTropeText.trim().length > 0) return true;
    return false;
  }, [
    title,
    author,
    description,
    tags,
    pendingTropeText,
    initialTitle,
    initialAuthor,
    initialDescription,
    initialTropes,
  ]);

  useEffect(() => {
    if (notFound) {
      allowLeaveRef.current = true;
      return;
    }

    if (!isDirty) {
      allowLeaveRef.current = false;
      return;
    }

    const handleGuardedClick = (event: MouseEvent) => {
      if (allowLeaveRef.current) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest("a[data-unsaved-guard]");
      if (!(link instanceof HTMLAnchorElement)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!window.confirm(UNSAVED_LEAVE_MESSAGE)) return;

      allowLeaveRef.current = true;
      window.location.assign(link.href);
    };

    const handleGuardedSubmit = (event: Event) => {
      if (allowLeaveRef.current) return;
      if (!(event.target instanceof HTMLFormElement)) return;
      if (!event.target.hasAttribute("data-unsaved-guard")) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!window.confirm(UNSAVED_LEAVE_MESSAGE)) return;

      allowLeaveRef.current = true;
      event.target.submit();
    };

    document.addEventListener("click", handleGuardedClick, true);
    document.addEventListener("submit", handleGuardedSubmit, true);

    return () => {
      document.removeEventListener("click", handleGuardedClick, true);
      document.removeEventListener("submit", handleGuardedSubmit, true);
    };
  }, [isDirty, notFound]);

  useEffect(() => {
    if (!notFound) return;
    document.querySelectorAll("[data-edit-delete-controls]").forEach((element) => {
      element.setAttribute("hidden", "");
    });
  }, [notFound]);

  function clearFieldError(field: keyof FieldErrors) {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSave() {
    setServerError(null);
    setSessionExpired(false);

    const merged = mergePendingTrope(tags, pendingTropeText);
    if (merged.error !== undefined) {
      const tropeError = merged.error;
      setErrors((prev) => ({ ...prev, tropes: tropeError }));
      return;
    }

    const mergedTropes = merged.tropes;
    setTags(mergedTropes);
    if (pendingTropeText.trim()) {
      setPendingTropeText("");
    }

    const result = bookSchema.safeParse({
      title,
      author,
      tropes: mergedTropes,
      description,
    });

    if (!result.success) {
      setErrors(mapFieldErrors(z.flattenError(result.error).fieldErrors));
      return;
    }

    setErrors({});

    const payload: BookPayload = result.data;

    let response: Response;
    try {
      response = await fetch(`/api/books/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      setServerError("Could not reach the server. Check your connection and try again.");
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      setServerError("Unexpected server response. Please try again.");
      return;
    }

    if (response.status === 200) {
      if (!isBookMutationSuccess(body)) {
        setServerError("Unexpected server response. Please try again.");
        return;
      }

      allowLeaveRef.current = true;

      if (body.duplicate) {
        window.location.href = `/books?notice=duplicate&highlight=${id}#book-${id}`;
      } else {
        window.location.href = `/books#book-${id}`;
      }
      return;
    }

    if (response.status === 400) {
      if (!isBookMutationError(body)) {
        setServerError("Unexpected server response. Please try again.");
        return;
      }
      if (body.fieldErrors) {
        setErrors(mapFieldErrors(body.fieldErrors));
      } else {
        setServerError(body.error);
      }
      return;
    }

    if (response.status === 401) {
      setSessionExpired(true);
      return;
    }

    if (response.status === 404) {
      setNotFound(true);
      return;
    }

    if (isBookMutationError(body)) {
      setServerError(body.error);
      return;
    }

    setServerError("Something went wrong. Please try again.");
  }

  if (notFound) {
    return (
      <p className="w-full rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-center text-sm text-red-300">
        This book is no longer in your TBR.
      </p>
    );
  }

  return (
    <form action={handleSave} className="space-y-4" noValidate>
      <FormField
        id="title"
        label="Title"
        value={title}
        onChange={(value) => {
          setTitle(value);
          clearFieldError("title");
        }}
        placeholder="Book title"
        error={errors.title}
        icon={<BookOpen className="size-4" />}
      />

      <FormField
        id="author"
        label="Author"
        value={author}
        onChange={(value) => {
          setAuthor(value);
          clearFieldError("author");
        }}
        placeholder="Author name"
        error={errors.author}
        icon={<User className="size-4" />}
      />

      <TropeInput
        id="tropes"
        label="Tropes"
        tags={tags}
        onTagsChange={(nextTags) => {
          setTags(nextTags);
          clearFieldError("tropes");
        }}
        pendingText={pendingTropeText}
        onPendingTextChange={(value) => {
          setPendingTropeText(value);
          clearFieldError("tropes");
        }}
        error={errors.tropes}
        onErrorChange={(value) => {
          setErrors((prev) => ({ ...prev, tropes: value }));
        }}
      />

      <FormField
        id="description"
        label="Description (optional)"
        value={description}
        onChange={(value) => {
          setDescription(value);
          clearFieldError("description");
        }}
        placeholder="Notes about this book"
        error={errors.description}
        icon={<FileText className="size-4" />}
        multiline
        rows={3}
      />

      {sessionExpired ? (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          Your session has ended.{" "}
          <a href="/auth/signin" className="text-purple-300 underline hover:text-purple-200">
            Sign in
          </a>{" "}
          to continue.
        </p>
      ) : (
        <ServerError message={serverError} />
      )}

      <div className="flex gap-3">
        <a
          href={`/books#book-${id}`}
          data-unsaved-guard
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
        >
          Cancel
        </a>
        <div className="min-w-0 flex-1">
          <SubmitButton pendingText="Saving..." icon={<PenLine className="size-4" />}>
            Save changes
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

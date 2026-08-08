import { useRef, useState } from "react";
import { z } from "zod";
import { BookOpen, FileText, PenLine, User } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { TropeInput } from "@/components/books/TropeInput";
import { SavedBooksList } from "@/components/books/SavedBooksList";
import {
  bookSchema,
  isCreateBookError,
  isCreateBookSuccess,
  tropeListSchema,
  type BookPayload,
} from "@/lib/book-schema";
import type { Tables } from "@/lib/database.types";

interface FieldErrors {
  title?: string;
  author?: string;
  tropes?: string;
  description?: string;
}

// Mirrors TropeInput's commit rules so pressing Save accepts exactly what
// pressing Enter would have accepted.
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

export default function AddBookForm() {
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pendingTropeText, setPendingTropeText] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [savedBooks, setSavedBooks] = useState<Tables<"books">[]>([]);

  function clearFieldError(field: keyof FieldErrors) {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSave() {
    setDuplicateNotice(null);
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
      response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Without this a hung request leaves useFormStatus pending forever,
        // and the only way out is a refresh that clears the session list.
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

    if (response.status === 201) {
      if (!isCreateBookSuccess(body)) {
        setServerError("Unexpected server response. Please try again.");
        return;
      }

      setTitle("");
      setAuthor("");
      setDescription("");
      setTags([]);
      setPendingTropeText("");
      setErrors({});
      setSavedBooks((prev) => [body.book, ...prev]);
      titleRef.current?.focus();

      if (body.duplicate) {
        setDuplicateNotice(`"${body.book.title}" by ${body.book.author} was already in your TBR — saved again.`);
      }
      return;
    }

    if (response.status === 400) {
      if (!isCreateBookError(body)) {
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

    if (isCreateBookError(body)) {
      setServerError(body.error);
      return;
    }

    setServerError("Something went wrong. Please try again.");
  }

  return (
    <>
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
          inputRef={titleRef}
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

        {duplicateNotice ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            {duplicateNotice}
          </p>
        ) : null}

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

        <SubmitButton pendingText="Saving..." icon={<PenLine className="size-4" />}>
          Add to TBR
        </SubmitButton>
      </form>

      <SavedBooksList books={savedBooks} />
    </>
  );
}

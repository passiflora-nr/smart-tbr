import { z } from "zod";

export const ACCOUNT_DELETE_CONFIRMATION_WORD = "DELETE";
export const ACCOUNT_DELETE_CONFIRMATION_FIELD = "confirmation";

export const accountDeleteConfirmationSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z.literal(ACCOUNT_DELETE_CONFIRMATION_WORD, {
      error: `Type ${ACCOUNT_DELETE_CONFIRMATION_WORD} to confirm`,
    }),
  );

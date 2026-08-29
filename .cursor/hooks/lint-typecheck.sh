#!/usr/bin/env bash
# postToolUse: run lint + typecheck, then return additional_context to the agent.
cat >/dev/null

cd "${CURSOR_PROJECT_DIR:-.}" || {
  printf '%s\n' '{}'
  exit 0
}

lint_out="$(npx eslint --fix . --quiet 2>&1)" || lint_ec=$?
: "${lint_ec:=0}"

type_out="$(npx tsc --noEmit --pretty false 2>&1)" || type_ec=$?
: "${type_ec:=0}"

if [[ "$lint_ec" -eq 0 && "$type_ec" -eq 0 ]]; then
  printf '%s\n' '{}'
  exit 0
fi

LINT_EC="$lint_ec" LINT_OUT="$lint_out" TSC_EC="$type_ec" TSC_OUT="$type_out" node -e '
  const parts = [];
  if (process.env.LINT_EC !== "0") {
    parts.push("eslint failed:\n" + (process.env.LINT_OUT ?? ""));
  }
  if (process.env.TSC_EC !== "0") {
    parts.push("tsc --noEmit failed:\n" + (process.env.TSC_OUT ?? ""));
  }
  process.stdout.write(JSON.stringify({ additional_context: parts.join("\n\n").slice(0, 10000) }) + "\n");
'
exit 0

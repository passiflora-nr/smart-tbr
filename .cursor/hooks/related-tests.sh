#!/usr/bin/env bash
# postToolUse: run unit tests related to the edited file, then tell the agent if they fail.
input="$(cat)"

cd "${CURSOR_PROJECT_DIR:-.}" || {
  printf '%s\n' '{}'
  exit 0
}

file_path="$(
  printf '%s' "$input" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      try {
        const payload = JSON.parse(raw);
        const fromTool = payload.tool_input ?? {};
        const file =
          (typeof payload.file_path === "string" && payload.file_path) ||
          (typeof fromTool.file_path === "string" && fromTool.file_path) ||
          (typeof fromTool.path === "string" && fromTool.path) ||
          "";
        process.stdout.write(file);
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  printf '%s\n' '{}'
  exit 0
fi

test_out="$(AI_AGENT=1 npx vitest related "$file_path" --run --project unit 2>&1)" || test_ec=$?
: "${test_ec:=0}"

if [[ "$test_ec" -eq 0 ]]; then
  printf '%s\n' '{}'
  exit 0
fi

TEST_OUT="$test_out" node -e '
  process.stdout.write(
    JSON.stringify({
      additional_context: ("related unit tests failed:\n" + (process.env.TEST_OUT ?? "")).slice(0, 10000),
    }) + "\n",
  );
'
exit 0

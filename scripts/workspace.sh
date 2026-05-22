#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
MANIFEST_PATH="$WORKSPACE_DIR/repos.env"
COMMAND="${1:-help}"

print_help() {
  print_header "Medikong workspace commands"
  echo "사용법: ./scripts/workspace.sh <command>"
  echo
  echo "commands:"
  echo "  help       사용 가능한 명령을 보여줍니다."
  echo "  list       repos.env 기준 repo 목록과 대상 경로를 보여줍니다."
  echo "  doctor     Git, Bash, manifest, workspace 경로 설정을 검사합니다."
  echo "  bootstrap  없는 repo만 workspace 형제 폴더로 clone합니다."
  echo "  status     repo 존재 여부, branch, dirty 상태, remote 불일치를 보여줍니다."
}

load_manifest() {
  [[ -f "$MANIFEST_PATH" ]] || fail "manifest를 찾을 수 없습니다: $MANIFEST_PATH"

  # shellcheck source=/dev/null
  source "$MANIFEST_PATH"

  [[ "${WORKSPACE_VERSION:-}" == "1" ]] || fail "repos.env의 WORKSPACE_VERSION은 1이어야 합니다."
  [[ -n "${WORKSPACE_NAME:-}" ]] || fail "repos.env에 WORKSPACE_NAME이 필요합니다."
  [[ -n "${WORKSPACE_ROOT:-}" ]] || fail "repos.env에 WORKSPACE_ROOT가 필요합니다."
  [[ -n "${REPOS:-}" ]] || fail "repos.env에 REPOS가 필요합니다."

  WORKSPACE_ROOT_PATH="$(absolute_path "$WORKSPACE_DIR/$WORKSPACE_ROOT")"
}

list_repos() {
  print_header "Medikong workspace repos"
  echo "workspace: $WORKSPACE_NAME"
  echo "root: $WORKSPACE_ROOT_PATH"
  echo

  for repo in $REPOS; do
    echo "$repo"
    echo "  path: $(repo_path "$repo")"
    echo "  remote: $(repo_value "$repo" REMOTE)"
    echo "  branch: $(repo_value_default "$repo" BRANCH "(clone 기본값)")"
    echo "  required: $(repo_value_default "$repo" REQUIRED true)"
  done
}

doctor() {
  CHECK_FAILED=0

  print_header "doctor"
  check_command git "Git 실행 가능"
  check_command bash "Bash 실행 가능"
  check "[[ -f \"$MANIFEST_PATH\" ]]" "repos.env 존재" "$MANIFEST_PATH"
  check "[[ -d \"$WORKSPACE_ROOT_PATH\" ]]" "workspace root 존재" "$WORKSPACE_ROOT_PATH"
  check_not_inside "$WORKSPACE_DIR" "$WORKSPACE_ROOT_PATH" "workspace root가 workspace 내부가 아님"

  local seen_paths=""
  for repo in $REPOS; do
    validate_repo "$repo"

    local path
    path="$(repo_path "$repo")"
    check_not_inside "$WORKSPACE_DIR" "$path" "$repo 경로가 workspace 내부가 아님"

    if [[ " $seen_paths " == *" $path "* ]]; then
      check "false" "$repo 경로 중복 없음" "$path"
    else
      check "true" "$repo 경로 중복 없음" "$path"
      seen_paths="$seen_paths $path"
    fi

    if [[ -e "$path" ]]; then
      check "[[ -d \"$path\" ]]" "$repo 경로가 디렉터리임" "$path"
    fi
  done

  [[ "$CHECK_FAILED" -eq 0 ]]
}

bootstrap() {
  command -v git >/dev/null 2>&1 || fail "Git이 필요합니다."

  print_header "bootstrap"
  echo "target root: $WORKSPACE_ROOT_PATH"
  echo

  for repo in $REPOS; do
    validate_repo "$repo"

    local path remote branch
    path="$(repo_path "$repo")"
    remote="$(repo_value "$repo" REMOTE)"
    branch="$(repo_value "$repo" BRANCH)"

    if [[ -e "$path" ]]; then
      [[ -d "$path" ]] || fail "$repo 대상 경로가 디렉터리가 아닙니다: $path"
      echo "skip $repo: 이미 존재합니다 ($path)"
      continue
    fi

    echo "clone $repo: $remote -> $path"
    if [[ -n "$branch" ]]; then
      git clone --branch "$branch" "$remote" "$path"
    else
      git clone "$remote" "$path"
    fi
  done
}

status_repos() {
  print_header "status"
  echo "target root: $WORKSPACE_ROOT_PATH"
  echo

  for repo in $REPOS; do
    validate_repo "$repo"

    local path
    path="$(repo_path "$repo")"

    if [[ ! -e "$path" ]]; then
      echo "$repo: missing ($path)"
      continue
    fi

    if ! git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "$repo: present, but not a git repo ($path)"
      continue
    fi

    local branch dirty remote expected_remote remote_state
    branch="$(git -C "$path" branch --show-current 2>/dev/null || true)"
    [[ -n "$branch" ]] || branch="(detached)"

    if [[ -n "$(git -C "$path" status --porcelain)" ]]; then
      dirty="dirty"
    else
      dirty="clean"
    fi

    remote="$(git -C "$path" remote get-url origin 2>/dev/null || true)"
    expected_remote="$(repo_value "$repo" REMOTE)"
    if [[ "$remote" == "$expected_remote" ]]; then
      remote_state="remote ok"
    else
      remote_state="remote mismatch (${remote:-origin 없음})"
    fi

    echo "$repo: present | branch $branch | $dirty | $remote_state"
  done
}

validate_repo() {
  local repo="$1"

  [[ -n "$(repo_value "$repo" REMOTE)" ]] || fail "$repo remote 설정이 필요합니다."
}

repo_path() {
  local repo="$1"
  local configured_path
  configured_path="$(repo_value "$repo" PATH)"

  if [[ -z "$configured_path" ]]; then
    configured_path="$repo"
  fi

  absolute_path "$WORKSPACE_ROOT_PATH/$configured_path"
}

repo_value() {
  local repo="$1"
  local field="$2"
  local key

  key="$(repo_key "$repo")_$field"
  printf "%s" "${!key-}"
}

repo_value_default() {
  local repo="$1"
  local field="$2"
  local fallback="$3"
  local value

  value="$(repo_value "$repo" "$field")"
  printf "%s" "${value:-$fallback}"
}

repo_key() {
  local repo="$1"
  echo "$repo" | tr '[:lower:]-' '[:upper:]_'
}

absolute_path() {
  local input="$1"
  local dir base

  dir="$(dirname "$input")"
  base="$(basename "$input")"

  if [[ -d "$input" ]]; then
    (cd "$input" && pwd -P)
  elif [[ -d "$dir" ]]; then
    printf "%s/%s" "$(cd "$dir" && pwd -P)" "$base"
  else
    printf "%s" "$input"
  fi
}

check_command() {
  local command="$1"
  local label="$2"

  if command -v "$command" >/dev/null 2>&1; then
    check "true" "$label" "$($command --version 2>&1 | head -n 1)"
  else
    check "false" "$label" "$command"
  fi
}

check_not_inside() {
  local parent="$1"
  local child="$2"
  local label="$3"

  if [[ "$child" != "$parent" && "$child" != "$parent/"* ]]; then
    check "true" "$label" "$child"
  else
    check "false" "$label" "$child"
  fi
}

check() {
  local expression="$1"
  local label="$2"
  local detail="${3:-}"

  if eval "$expression"; then
    echo "OK $label${detail:+: $detail}"
  else
    echo "FAIL $label${detail:+: $detail}"
    CHECK_FAILED=1
  fi
}

print_header() {
  echo "# $1"
}

fail() {
  echo "$1" >&2
  exit 1
}

main() {
  case "$COMMAND" in
    help|list|doctor|bootstrap|status) ;;
    *)
      echo "알 수 없는 명령입니다: $COMMAND" >&2
      echo "사용 가능: help, list, doctor, bootstrap, status" >&2
      exit 1
      ;;
  esac

  if [[ "$COMMAND" == "help" ]]; then
    print_help
    exit 0
  fi

  load_manifest

  case "$COMMAND" in
    list) list_repos ;;
    doctor) doctor ;;
    bootstrap) bootstrap ;;
    status) status_repos ;;
  esac
}

main

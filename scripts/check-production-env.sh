#!/usr/bin/env sh
set -eu

env_file="${1:-.env}"

fail() {
    printf '%s\n' "ERROR: $*" >&2
    exit 1
}

get_env_value() {
    key="$1"
    value=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$env_file" | tail -n 1 | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${key}=//") || true
    value=$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^['"'"']//; s/['"'"']$//')
    printf '%s' "$value"
}

check_required() {
    key="$1"
    default="$2"
    value=$(get_env_value "$key")

    if [ -z "$value" ]; then
        fail "$key is required in $env_file for production deploys"
    fi

    if [ "$value" = "$default" ]; then
        fail "$key is still set to the unsafe default in $env_file"
    fi
}

[ -f "$env_file" ] || fail "Production env file not found: $env_file"

check_required DB_PASSWORD password
check_required SECRET_KEY change-me-in-production
check_required ADMIN_PASSWORD change-me-in-production

printf '%s\n' "Production environment check passed: $env_file"

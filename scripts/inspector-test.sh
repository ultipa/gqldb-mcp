#!/usr/bin/env bash
# Functional smoke test of the READ-ONLY Ultipa MCP tools, via the MCP Inspector CLI.
#
# Your credentials stay in your shell env — they are never printed.
# This script NEVER calls a destructive tool (create/delete/write/restore/etc.).
#
# Usage:
#   npm run build                                  # compile dist/ first
#   ULTIPA_CLOUD_API_KEY=uc_... bash scripts/inspector-test.sh
#   # optional — also exercise instance + data-plane reads:
#   ULTIPA_CLOUD_API_KEY=uc_... TEST_INSTANCE_ID=<id> TEST_GRAPH=<graph> bash scripts/inspector-test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
: "${ULTIPA_CLOUD_API_KEY:?Set ULTIPA_CLOUD_API_KEY in your env first}"

INSP=(npx --yes @modelcontextprotocol/inspector --cli node dist/index.js)
pass=0; fail=0; failed=()

call() {  # call <tool_name> [--tool-arg k=v ...]
  local name="$1"; shift
  if "${INSP[@]}" --method tools/call --tool-name "$name" "$@" >/tmp/it-out.json 2>/tmp/it-err.txt \
     && ! grep -q '"isError": *true' /tmp/it-out.json; then
    echo "  ✓ $name"; pass=$((pass+1))
  else
    echo "  ✗ $name"; fail=$((fail+1)); failed+=("$name")
  fi
}

echo "== Account / control-plane reads =="
for t in get_account list_instances list_deleted_instances list_regions list_instance_sizes \
         get_latest_version get_trial_status get_enterprise_status get_operations_lock \
         get_balance list_transactions get_usage get_payment_method get_auto_reload \
         list_alerts get_my_ip; do
  call "$t"
done

if [ -n "${TEST_INSTANCE_ID:-}" ]; then
  echo "== Instance-scoped reads (id=$TEST_INSTANCE_ID) =="
  for t in get_instance get_instance_credentials get_live_metrics get_metrics_history \
           get_instance_logs list_instance_alerts list_firewall_rules list_backups; do
    call "$t" --tool-arg "id=$TEST_INSTANCE_ID"
  done
  echo "== Data-plane reads =="
  for t in test_connection get_db_version get_db_license list_graphs; do
    call "$t" --tool-arg "id=$TEST_INSTANCE_ID"
  done
  if [ -n "${TEST_GRAPH:-}" ]; then
    call describe_schema --tool-arg "id=$TEST_INSTANCE_ID" --tool-arg "graph=$TEST_GRAPH"
    call run_gql_query  --tool-arg "id=$TEST_INSTANCE_ID" --tool-arg "graph=$TEST_GRAPH" --tool-arg "query=MATCH (n) RETURN n LIMIT 1"
    call explain_query  --tool-arg "id=$TEST_INSTANCE_ID" --tool-arg "graph=$TEST_GRAPH" --tool-arg "query=MATCH (n) RETURN n LIMIT 1"
  fi
else
  echo "(set TEST_INSTANCE_ID and TEST_GRAPH to also test instance + data-plane reads)"
fi

echo ""
echo "READ-ONLY RESULT: $pass passed, $fail failed${failed:+  → ${failed[*]}}"
echo ""
echo "Test these DESTRUCTIVE tools by hand against a THROWAWAY instance/graph (the Inspector UI is easiest):"
echo "  graph lifecycle : create_graph → write_data → run_gql_query(read) → reload_db_stats → delete_graph"
echo "  import          : import_data (small CSV into the test graph)"
echo "  procedures      : write_procedure (then CALL it via run_gql_query)"
echo "  algorithms      : run_algo (read-only, but needs a valid CALL algo.* and the algo installed)"
echo "  instance ops    : rename/pause/resume/restart_instance, set_log_level, add/remove_firewall_rule,"
echo "                    create/delete/set/clear backup — on a disposable instance"
echo "  high-risk       : create_instance, delete_instance, restore_backup, reset_admin_password, upgrade_version"

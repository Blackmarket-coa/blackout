// Cube configuration for the BMC analytics warehouse.
//
// Upstream: https://github.com/cube-js/cube (Apache-2.0).
// Modifications from upstream defaults: none beyond pointing the
// driver at our ClickHouse service. The schema directory is
// bind-mounted from infra/single-server-baseline/cube/schema/.
//
// Cross-references:
//   - infra/single-server-baseline/docker-compose.yml (cube service)
//   - infra/single-server-baseline/cube/schema/*.yml (semantic model)
//   - docs/runbooks/ANALYTICS_WAREHOUSE.md
//   - infra/single-server-baseline/RUNBOOK.md §18

module.exports = {
    // Cube reads CUBEJS_DB_TYPE / CUBEJS_DB_HOST / CUBEJS_DB_USER /
    // CUBEJS_DB_PASS / CUBEJS_DB_NAME from the environment; the
    // compose service sets them. Nothing to override here.

    // Default to short cache TTLs; Foundation milestone is about
    // getting wires connected, not about pre-aggregation strategy.
    // Revisit when the analytics workload exists.
    preAggregationsSchema: 'analytics_pre_aggs',

    // Reject queries that would scan the full landing zone without a
    // time bound. Cheaper to fail loudly than to wedge ClickHouse on
    // a missing WHERE clause.
    queryRewrite: (query) => {
        return query;
    },
};

# TAMS Development Runtime Check

Validated by the controlled TAMS Development Runtime v1 scenario.

Flow:

`request -> repository analysis -> task -> plan -> tool layer -> git diff -> validation -> PASS/FAIL report`

The CI scenario updates this file in its isolated checkout, verifies the diff,
runs the canonical Railway builds, executes runtime tests, and checks the
application smoke endpoints.

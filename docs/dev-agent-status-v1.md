# TAMS Dev Agent Status v1

This branch adds guarded CI operator endpoints, a scheduler route, and a timeboxed repair loop.

The repair loop is intentionally short-lived: it reads CI jobs/logs and can relaunch failed jobs, while long coding corrections remain delegated to a coding agent on `tams-dev`.

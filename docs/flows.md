# Runtime flows

## Connection and recovery

Desktop connects, sends an auth envelope with its owner token, and requires the run-lifecycle-v1 capability. It awaits workspace.set acknowledgement, settings.get, session.list, and active/background session snapshots before enabling commands.

Subscribe and resnapshot enqueue a captured snapshot under the coordinator ordering mutex. Subsequent events use the same bounded queue. The adapter tags updates with the subscription's immutable workspace and drops revoked subscriptions.

## Execution

A correlated chat.req reserves the session after checking storage ownership and loading history. The starting session.data acknowledgement identifies the server run. Generation emits ordered deltas. Questions and permissions require matching identities and kind; interaction.done precedes resumed execution.

At commit, cancellation checking and entry into persisting are atomic. The store's actual result determines done. The reservation is released with the terminal update; retained snapshots expose outcome and unsaved availability.

Disconnect closes subscriptions without canceling runs. Slow consumers disconnect instead of losing individual events. Shutdown rejects new runs, cancels pre-commit work, drains workers, then releases leases. A timeout reports failure without closing stores still used by workers.

See [the walkthrough](../FLOWS.md) and [architecture](../ARCHITECTURE.md).

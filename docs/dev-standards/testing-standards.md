# Testing standards

Pre-requisite reading: [`base-standards.md`](./base-standards.md).

A test earns its place only if it **would fail when the behaviour it names breaks**. A test that passes whatever the code does is not a weak test, it is a cost: it slows every change, it reads as coverage in review, and it hides that nothing guards the behaviour. This document is the rule set the review skills (`/koalarnes:review-pr`, `/koalarnes:adversarial-review`) and the [mandatory task steps](../../.claude/rules/koalarnes-mandatory-steps.md) hold every test to.

## Pick the level first

Write the test at the cheapest level that runs the behaviour **for real**. When the level you are in cannot run it for real, move the test; do not mock around the gap.

| What the behaviour depends on | Level |
|---|---|
| Pure logic: parsing, mapping, pricing, validation, hashing, state machines | Unit test with **no mock of the logic**, next to the code |
| A SQL query, a filter, an access rule, a transaction, a lock, a race, a migration, a unique index | **Integration test against a real database server**, in a database of its own |
| A cache, a distributed lock, a script running inside a data store | Integration test against the real store (a container started by the test) |
| A media or document tool, a CLI, a generated file (archive, XML, image, video) | Run the real tool on a small input and inspect the output |
| A UI component's behaviour: what the user sees, what a click does, what request it sends | Component test that renders the **real children**, with HTTP answered by a network-level mock |
| A flow a user walks through, across pages, or anything that depends on the whole stack | End-to-end test against the full stack |

Before writing a new test, look for the behaviour at the other levels. A unit test that repeats what an end-to-end or integration test already proves with real collaborators adds nothing.

## What to mock

Mock only **true boundaries**:

- network calls to third parties and their SDKs;
- the call that enqueues a job or publishes a message (assert the payload when the payload is the contract);
- object storage, and the cache or the database **only when the test is about the logic around them**, not about what they return;
- the clock, randomness, and the filesystem when a temporary directory would not do.

Do **not** mock:

- the unit's own collaborators when they are cheap or pure (a helper, a mapper, a formatter, the translation function with the real catalogue available);
- the ORM's query builder to assert a `WHERE` clause: the mock returns whatever rows you hand it, so the test passes even if the clause is deleted. Write a database integration test;
- child components, form libraries or data hooks in a UI test: render the real tree and answer HTTP at the network level;
- the function under test itself, or a copy of it. A test that re-implements the code it tests can never fail.

## Assert outcomes, not calls

Assert what the user or the next system gets: the return value, the persisted row, the HTTP status and body, the rendered text or role, the produced file, the cache state, the request the network mock received.

A call assertion (`toHaveBeenCalledWith`, `assert_called_with`, `verify(...)`) is right only for a **boundary** call whose arguments are the contract (a provider request, a job payload, a command line). Pinning one is a deliberate choice: say so in the test's name or a comment (`pins the provider request body`). Asserting that the unit called its own mocked collaborator with what you passed in restates the implementation.

## What not to write

Each of these is refused in review.

- **Copies of the code under test.** The test file re-implements the function (or a module factory) and asserts on the copy.
- **Mock echoes.** Every collaborator is a mock, and the test asserts that mock A was called and that the result is mock B's return value.
- **Query-builder echoes.** A mocked query returns the rows the test then counts; a substring match on the generated SQL.
- **Constants and literals restated.** A test that the enum has these values, the map has this entry, the template string reads like this. The typecheck and the code that uses them are the test.
- **Tautologies.** A pure function called twice with the same input to "prove" it is deterministic; `expect(true)`; a typed constant asserted to be true; asserting a value is defined right after constructing it.
- **Assertions that cannot run.** An assertion inside a condition that is false; a selector that matches nothing and a count of zero; a test with no assertion.
- **Framework surface.** Module metadata, method names on a prototype, that a decorator or annotation is present. Wiring is proven by booting the app.
- **Private internals.** Reaching private members through casts or reflection.
- **Matrices repeated per wrapper.** The same input matrix copied into every component that wraps a shared hook or helper: test the shared piece once, and keep one or two wiring tests per wrapper.
- **Fragile timing.** Absolute duration budgets (`< 500 ms`). Compare ratios or count operations.
- **Dead code tests.** A function with no caller is deleted with its tests.

## Tests that touch the environment

- **HTTP tests run against a listening server.** Start the app on a loopback port the test picked and close it afterwards, rather than letting the test client bind a new wildcard port per request: the kernel can hand out a port another local process already holds, and the request reaches that process instead, failing the suite at random.
- **Tests that run git strip git's repository-local variables.** A test that builds a throwaway repository and runs `git` in it removes from the child's environment every variable `git rev-parse --local-env-vars` prints. Passing a working directory is not enough: a `GIT_DIR` inherited from a git hook (a pre-push running the tests from a worktree) wins over it, and the test then commits into the real repository.

- **Tests that start tmux use a server of their own.** Unset `TMUX` and `TMUX_PANE`, point `TMUX_TMPDIR` at a temporary directory and pass `-L`/`-S` to every `tmux` call: a bare `tmux` reaches the developer's real server, and a fake `HOME` does not isolate it. A hub started for a test also needs its own `TMUX_TMPDIR`, because a `local: true` machine is the hub's own tmux.

## Deliberate pins

Some tests look like call assertions and are exactly what they should be. Keep them, and keep their intent visible:

- golden tests that fix a contract (a command line, a prompt or request body, a content hash, a serialised format);
- tests that check which implementation the configuration binds (a fake in test mode, the real service otherwise);
- static guards (every external process call has a timeout; a module stays free of a heavy import).

## See it fail

A new or rewritten test is not done until it has failed for the right reason: break the code it guards (revert the fix, flip the condition, delete the clause) and watch the test fail with a message that names the behaviour. Then restore the code. A test you never saw fail may be one of the patterns above.

## Review checklist

When reviewing a test, ask:

1. If I delete or invert the line this test is about, does it fail?
2. Is every mock a true boundary, or is the logic itself mocked away?
3. Does it assert an outcome, or the arguments of a call to its own collaborator?
4. Is this the cheapest level that runs the behaviour for real, and is the behaviour not already proven at another level?
5. Was it seen failing?

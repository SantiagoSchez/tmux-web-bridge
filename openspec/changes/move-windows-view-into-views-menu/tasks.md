# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/70-llevar-la-vista-de-ventanas-al-menu-mas-vistas` from `origin/master` in its own worktree with `/ka:git-worktree create`; verify `git branch --show-current` prints that name.

## 2. Review the existing tests

- [x] 2.1 Confirm the `web` layer has no automated tests for `Header`, `router` or the `menu` dialog (`find web -name '*.test.*'`), and record one line per inspected module ("no tests in the layer; checked by hand in task 3.4") in this task.
  - `find web -name '*.test.*'` finds no file outside `node_modules`.
  - `web/src/components/Header.tsx`: no tests in the layer; checked by hand in task 3.4.
  - `web/src/router.ts` (`toggleGrid`, unchanged): no tests in the layer; checked by hand in task 3.4.
  - `web/src/state.ts` (`menu` dialog, unchanged): no tests in the layer; checked by hand in task 3.4.

## 3. Move the windows view into the «Más vistas» menu

- [x] 3.1 In `web/src/components/Header.tsx`, remove the windows view's button from the top bar and the `.views-group` wrapper, and give the «Más vistas» chevron the `on` class and `aria-pressed` while `route.value.name === 'grid'` (design D2), keeping its `aria-label`, `title` and `aria-haspopup="menu"`; verify by reading the rendered bar in task 3.4.
- [x] 3.2 In `viewsMenu()`, add the first item before «Actividad»: «Vista de ventanas», or «Cerrar la vista de ventanas» while the grid is open, with `IconGrid`, running `toggleGrid` (design D1); update the docstrings of `Header` and `viewsMenu` to say the views live in the menu; verify in task 3.4.
- [x] 3.3 In `web/src/styles.css`, remove `.views-group` and the chevron's negative `margin-left`, which only served the button beside it, keeping its width (22 px, 18 px on narrow screens); verify `grep -n 'views-group' web/src` finds nothing.
- [x] 3.4 Check by hand against an isolated hub (its own `TMUX_TMPDIR`, `-L` socket and `-f /dev/null`, never the real tmux server), at 390×844 and at 1280×900, every scenario of `specs/top-bar-views/spec.md`: the bar shows the chevron and no grid button next to the bell, Trello, the connections and the settings; the menu lists «Vista de ventanas» then «Actividad»; choosing each opens its view; with the windows view open on a computer the chevron is highlighted (`aria-pressed="true"`) and the menu reads «Cerrar la vista de ventanas», which brings back the list with the chevron no longer highlighted. Record what was seen in this task.
  - Isolated hub (own `TMUX_TMPDIR` and data directory) with two made-up machines on unroutable addresses and no local machine, so no tmux server is reached; panel driven with agent-browser.
  - 390×844: the bar shows «Más vistas», the bell, the connections and the settings (Trello is not set up in the test hub); the menu lists «Vista de ventanas» then «Actividad»; «Vista de ventanas» opens `#/grid` full screen with its own «Volver a la lista», so the bar is not visible there; «Actividad» opens.
  - 1280×900: the same bar plus «Ocultar la lista»; «Vista de ventanas» opens `#/grid` beside the list and the chevron gets `on` and `aria-pressed="true"`; its menu then lists «Cerrar la vista de ventanas» and «Actividad»; choosing the first brings back `#/` with `aria-pressed="false"`, and the menu reads «Vista de ventanas» again; «Actividad» opens.
  - The phone finding (the bar is hidden while the windows view is open) went into the spec and design D2.

## 4. Run tests, typecheck and lint

- [x] 4.1 Run `pnpm --filter web typecheck`; it passes with no errors.
- [x] 4.2 Run `ka scope`, then `ka features-check` and `ka docs-check` when they apply; each passes or is recorded as not applicable.
  - `ka scope`: both checks apply; no E2E suite.
  - `ka features-check`: exit 0, with the two `top-bar-views` requirements pending for step 6.
  - `ka docs-check`: no dead reference.

## 5. Documentation and changelog

- [x] 5.1 Run `/ka:update-docs`: update any standards document that describes the top bar's views, or record that none does.
  - No standards document describes the top bar, and the change adds no convention (`docImpacts` is empty).
  - `README.md`: «Actividad» and «Vista de ventanas» now say they are in the «Más vistas» menu; the old line placed «Actividad» beside the windows view's button.
- [x] 5.2 Add a changelog entry in es-ES with `/ka:changelog` (`-t changed -s web --issue 70`), since a flow the user sees changes; verify the file under `changelogs/unreleased/`.
  - `changelogs/unreleased/20261120T181850556-feature-70-llevar-la-vista-de-ventanas-al-menu-mas-vistas.json`.
- [x] 5.3 Run `/opsx:verify`, commit with `/ka:commit --pr`, and go through the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`) until the gate passes; bring `master` in with a merge of `origin/master`, never a rebase with a forced push.
  - `/opsx:verify`: both requirements implemented, design followed; only the workflow tasks after it were open.
  - Pull request 71 opened; round 1 (full review of `47bfbb2`): no blocker, three suggestions; `ka review-rounds gate` passed.
  - `ka-evaluator` scores: R1-01 4, R1-02 5, R1-03 3; none reaches 8, R1-02 goes into the final review comment.
  - `master` had no new commits since the branch started, so no merge was needed.

## 6. Feature catalogue

- [x] 6.1 Run `/ka:update-features move-windows-view-into-views-menu` to add the `top-bar-views` area to `docs/FEATURES.md`, then `ka features-check --strict` (exit 0), and commit with `/ka:commit`.
  - New area «Vistas de la barra», with its index line and one section per requirement; `ka features-check --strict`: exit 0, 101 sections verified.

## 7. E2E pipeline

- [x] 7.1 Record that the project has no E2E suite, so this step does not apply.
  - `ka scope`: the project has no E2E suite.

## 8. Human review

- [ ] 8.1 Ask the owner, with `AskUserQuestion`, who reviews the pull request, and record the answer here; never merge without the owner's yes.

## 9. features-check before the archive

- [ ] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; exit code 0.

## Workflow follow-up

- `/opsx:archive move-windows-view-into-views-menu`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `--squash --match-head-commit` only after the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- On the owner's go-ahead: comment on Issue #70 with the pull request link and close it; remove the worktree with `/ka:git-worktree remove`.

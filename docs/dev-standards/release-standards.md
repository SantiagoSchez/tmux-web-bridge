# Release standards

How the hub is deployed and how a release is cut. The principles in [base-standards.md](base-standards.md) apply first.

## Deployment

Every push to `master`, the merge of a pull request included, deploys the hub automatically: `.github/workflows/deploy.yml` runs `deploy/docker/deploy.sh` on a self-hosted runner labelled `twb`. It takes under a minute; follow it with `gh run watch`.

A push that only touches the paths under `paths-ignore` in that workflow deploys nothing. The host kit and the Trello extension never deploy with the hub: see the Shipping recipe of the [host-kit standards](host-kit-standards.md) and of the [trello-extension standards](trello-extension-standards.md).

## Versions

The version is SemVer and lives in `VERSION`. The hub reads it, and so does the kit's `tmux.conf`, which publishes it in `@twb_kit_version`. The panel warns when the latest GitHub release is newer than the hub or than the kit of some machine.

Loose bug fixes and touch-ups do not call for a release of their own; they go into the next one.

## Cutting a release

A release is cut with `/koalarnes:release` from the main checkout, on `master`. It makes the commit `chore(release): X.Y.Z` and its tag `vX.Y.Z`, and pushes both: `git push origin master vX.Y.Z`.

The tag starts `.github/workflows/release.yml` (a GitHub runner), which publishes the GitHub release; follow it with `gh run watch`. It builds the Trello extension, creates the release as a draft with the version's section of `CHANGELOG.md` as its notes, attaches `twb-trello-extension-vX.Y.Z.zip` and only then publishes it: machines with the extension turned on (Ajustes › Trello) download it when they update the kit. Meanwhile `master` deploys the hub, which looks for the release of its version every 2 minutes and then warns about the kits to update.

If the workflow fails, the release stays a draft or does not exist: fix the cause and start it again with `gh workflow run release -f tag=vX.Y.Z`. It reuses a release that already exists.

The sections of `CHANGELOG.md` up to 1.21.0 were copied from the notes of the GitHub releases.

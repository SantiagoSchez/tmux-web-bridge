# Release standards

How the hub is deployed and how a release is cut. The principles in [base-standards.md](base-standards.md) apply first.

## Deployment

Every push to `master`, the merge of a pull request included, deploys the hub automatically: `.github/workflows/deploy.yml` runs `deploy/docker/deploy.sh` on a self-hosted runner labelled `twb`. It takes under a minute; follow it with `gh run watch`.

A push that only touches the paths under `paths-ignore` in that workflow deploys nothing. The host kit and the Trello extension never deploy with the hub: see the Shipping recipe of the [host-kit standards](host-kit-standards.md) and of the [trello-extension standards](trello-extension-standards.md).

## Versions

The version is SemVer and lives in `VERSION`. The hub reads it, and so does the kit's `tmux.conf`, which publishes it in `@twb_kit_version`. The panel warns when the latest GitHub release is newer than the hub or than the kit of some machine.

Loose bug fixes and touch-ups do not call for a release of their own; they go into the next one.

## Cutting a release

A release is cut with `/koalarnes:release` from the main checkout, on `master`. It compiles the entries of `changelogs/unreleased/` into `CHANGELOG.md`, rewrites the section for whoever uses the panel, writes `VERSION`, and makes the commit `chore(release): X.Y.Z` and its tag `vX.Y.Z`. The version comes from the entries: `added` raises the minor, a breaking change the major, anything else the patch.

Its step 7 (publishing) changes here, because the Trello extension has to be in the release before the hub announces it:

1. Push only the tag: `git push origin vX.Y.Z`, not `master` yet.
2. `gh release create vX.Y.Z --draft --title vX.Y.Z --notes-file <file>` with the new section of `CHANGELOG.md`, without its `## X.Y.Z - date` heading. As a draft: the panel does not announce it yet.
3. The tag starts the `trello-extension` workflow (a GitHub runner), which attaches the built extension, `twb-trello-extension-vX.Y.Z.zip`, to the draft. Follow it with `gh run watch`; if it fails, start it again with `gh workflow run trello-extension -f tag=vX.Y.Z`.
4. With the `.zip` in the release, publish it: `gh release edit vX.Y.Z --draft=false`. Not before: machines with the extension turned on (Ajustes › Trello) download it when they update the kit.
5. Now `git push origin master`: it deploys the hub, which on start sees the release already published and warns about the kits to update. Pushed earlier, the hub looks again every 2 minutes until the release of its version is out.

The sections of `CHANGELOG.md` up to 1.21.0 were copied from the notes of the GitHub releases.

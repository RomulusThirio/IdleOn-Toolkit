# IdleOn Travel Menu

## Download just one file

**[Download Install.bat](https://github.com/RomulusThirio/IdleOn-Travel/raw/refs/heads/main/Install.bat)**

1. Install [Git for Windows](https://git-scm.com/download/win) once if it is not already installed. Node.js is not required.
2. Close IdleOn and double-click `Install.bat`. You do not need to download the repository, `install.ps1`, or `menu.js`.
3. The launcher downloads everything automatically, finds your Steam installation, backs up the game, and installs the travel menu.
4. Start IdleOn normally and press **F8**.

Keep the same `Install.bat` and run it again for future updates. It clones `RomulusThirio/IdleOn-Travel` on first use and runs `git pull --ff-only origin main` afterward. The repository URL is already configured.

**This repository is private.** Recipients need repository access and GitHub authentication in Git (normally handled by Git Credential Manager included with Git for Windows). A downloaded launcher does not grant repository access. If Git reports “Repository not found,” check the signed-in account and repository permissions.

## Where files go

The launcher can live anywhere. Downloaded files are cached at `%LOCALAPPDATA%\IdleOnTravel`. Steam libraries are detected automatically; if detection fails, the installer asks for the game folder. You may also drag the game installation folder onto `Install.bat`.

Only the original launcher needs to be downloaded manually. Git fetches the PowerShell installer, menu, and restore tool.

## Restore

Run `Restore-IdleOn.bat` inside `%LOCALAPPDATA%\IdleOnTravel`. Backups are kept in `rom-travel-backups` in the game folder.

Restore refuses to apply an old backup if the game archive has changed since installation. Steam's **Verify integrity of game files** restores current official files if needed.

## Maintainer

Commit changes to `menu.js` or `install.ps1` on `main`; recipients get them when they next run their existing `Install.bat`. Existing menu injections are replaced, not stacked. The launcher stops on Git errors, an unexpected origin/branch, incompatible game code, or a running game. It never resets local edits or force-closes the game.

`Update-IdleOn.bat` remains available as an equivalent standalone launcher for compatibility. `Install.bat` is the file to share. Launcher changes themselves require redistributing the launcher; menu and PowerShell installer updates are fetched automatically.

## Current menu limitations

- Menu 0.1.2 is included. The reported colosseum/enemy labeling correction is still pending.
- Enemy labels use AFK map targets; special areas can display a surrounding area's enemy. Check the map name beneath each label.
- World/location numbers are menu numbers, not official map IDs.
- Skill entries travel to maps but do not walk to resources or start gathering.
- Progression unlocks are not checked.
- A game update may require adapting the internal game references.

The repository contains custom tools only, not game files or account data.

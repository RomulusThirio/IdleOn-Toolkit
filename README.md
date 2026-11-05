# Testing build

Teleporting works; the new character assignments still need in-game testing. Please wait for a release if you want a stable build. Suggestions are welcome.

# IdleOn Toolkit

## Download just one file

**[Download Install.bat](https://github.com/RomulusThirio/IdleOn-Toolkit/raw/refs/heads/main/Install.bat)**

1. Install [Git for Windows](https://git-scm.com/download/win) once if it is not already installed. Node.js is not required.
2. Close IdleOn and double-click `Install.bat`. You do not need to download the repository, `install.ps1`, or `menu.js`.
3. The launcher downloads everything automatically, finds your Steam installation, backs up the game, and installs IdleOn Toolkit.
4. Start IdleOn normally and press **F8**.

Keep the same `Install.bat` and run it again for future updates. It clones `RomulusThirio/IdleOn-Toolkit` on first use and runs `git pull --ff-only origin main` afterward. The repository URL is already configured.

## Assign an activity

Select **Assign activity and return**, choose a character, and click a mining, fishing, chopping, or catching destination. Choose the resource and click **Start assignment**.

The menu switches characters, checks that native AFK processing has finished, claims gains using the cache action, and collects remaining drops before traveling. Once the map is ready, it selects the nearest matching resource and checks that gathering has started and waits for the first drop before saving and switching back. Fresh gathering drops may be left on the ground; they do not block the return. Returning AFK gains are handled too. After an AFK menu closes, the menu waits 2 seconds for drops to land before checking loot. Other steps advance on game state. Cache deposits follow the game's unlock and storage rules.

One assignment runs at a time. Collect drops on your starting character first. An assignment stops with an error after 10 seconds without progress. Moving toward a resource or collecting loot resets that timer. Full bags, missing resources, and interrupted gathering also stop the assignment on the current character. **Cancel** stops further actions; a switch or transition already in progress will finish. Check the character and its loot before retrying.

Only unlocked destinations are shown. Travel uses the active character's progress; assignments use the selected character's saved progress and check access again before traveling. Destination codes stay fixed when locked maps are hidden.

Assignment checks, loot handling, map access, nearest-resource selection, and UI controls are covered by automated tests.

## Repeat gathering

Start gathering in-game, open **IdleOn Toolkit**, and click **Start repeat gathering**. It checks the current skill's XP every 50 ms and interacts with the same resource after each XP gain. Mining, chopping, fishing, and catching are supported, including level-ups.

Click **Stop repeat gathering** to stop. Moving away, changing characters or maps, opening a game dialog, or starting travel or an assignment also stops it. This runs only on the active character and starts off each time you launch the game. Whether it improves gathering speed still needs in-game testing.

### Chopping minigame helper (isolated test feature)

Start the chopping minigame normally, open **IdleOn Toolkit**, and click **Start chopping helper**. The helper reads the live rendered chopping bar state, waits until the arrow is inside the visible scoring target, and calls the game's native tap action. Once the smaller perfect target appears, it waits for that target instead of using the broader scoring area.

The helper never starts a minigame or spends a play. It starts disabled on every launch, runs only for the active chopping screen, and stops if the screen closes, changes, reports a miss, or exposes incomplete state. Travel and assignment controls are disabled while it is running. This has deterministic simulated-bar tests but still needs an in-game confirmation against the current game build.

**This repository is private.** Recipients need repository access and GitHub authentication in Git (normally handled by Git Credential Manager included with Git for Windows). A downloaded launcher does not grant repository access. If Git reports “Repository not found,” check the signed-in account and repository permissions.

After the repository rename, download the latest `Install.bat` once using the link above. It uses the new repository URL and cache folder. Older `%LOCALAPPDATA%\IdleOnTravel` folders can be kept as-is; they are not moved or deleted.

## Where files go

The launcher can live anywhere. Downloaded files are cached at `%LOCALAPPDATA%\IdleOnToolkit`. Steam libraries are detected automatically; if detection fails, the installer asks for the game folder. You may also drag the game installation folder onto `Install.bat`.

Only the original launcher needs to be downloaded manually. Git fetches the PowerShell installer, menu, and restore tool.

## Restore

Run `Restore-IdleOn.bat` inside `%LOCALAPPDATA%\IdleOnToolkit`. New backups are kept in `idleon-toolkit-backups` in the game folder. Existing installations keep using `rom-travel-backups` so their restore history stays available.

Restore refuses to apply an old backup if the game archive has changed since installation. Steam's **Verify integrity of game files** restores current official files if needed.

## Maintainer

Commit changes to `menu.js` or `install.ps1` on `main`; recipients get them when they next run their existing `Install.bat`. Existing menu injections are replaced, not stacked. The launcher stops on Git errors, an unexpected origin/branch, incompatible game code, or a running game. It never resets local edits or force-closes the game.

`Update-IdleOn.bat` remains available as an equivalent standalone launcher for compatibility. `Install.bat` is the file to share. Launcher changes themselves require redistributing the launcher; menu and PowerShell installer updates are fetched automatically.

Run the tests with `node --test tests/*.test.cjs`.

## Current menu limitations

- Toolkit 0.3.0 is included. The return switch waits for a gathering drop and can leave it behind. The reported colosseum/enemy labeling correction is still pending.
- Enemy labels use AFK map targets; special areas can display a surrounding area's enemy. Check the map name beneath each label.
- World/location numbers are menu numbers, not official map IDs.
- Travel mode only changes maps. Assignment mode starts gathering for mining, fishing, chopping, and catching; other skills remain travel-only.
- Chopping minigame timing uses the game's live UI model rather than fixed delays or screenshot coordinates. Window size and resolution should not affect detection, but a future game update can change the internal UI fields.
- Inactive characters in Compass or Tesseract challenge runs are hidden until their live unlock rules can be checked while active.
- A game update may require adapting the internal game references.

The repository contains custom tools only, not game files or account data.

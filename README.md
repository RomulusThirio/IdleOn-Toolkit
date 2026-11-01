# IdleOn Travel Menu

Windows Steam travel menu, with searchable towns, enemy maps, and skilling areas. Press **F8** in game. This repository contains only the custom menu and installer, not the game or account data.

## Repository owner: one-time setup

1. Create a public GitHub repository and upload these files at its root.
2. Edit `REPO_URL` near the top of `Update-IdleOn.bat` to that repository's HTTPS clone URL, such as `https://github.com/your-name/idleon-travel.git`.
3. Upload that edited launcher too. Send people **just `Update-IdleOn.bat`**.

A public repository is easiest for recipients. Private repositories require each recipient to have GitHub access and Git authentication configured.

## Recipient

1. Install [Git for Windows](https://git-scm.com/download/win) if needed. Node.js is not required.
2. Close IdleOn. Double-click `Update-IdleOn.bat`.
3. The launcher clones the repository on first run and uses `git pull --ff-only` on subsequent runs. The installer finds Steam libraries or asks for the game folder.
4. Start IdleOn normally. Press F8.

Run the same launcher again whenever the repository receives a menu update or Steam replaces the patched game files. The launcher follows the repository's default branch. It stops on Git errors, conflicting edits, incompatible game code, or a running game; it does not reset local edits or force-close the game.

You can also drag the IdleOn installation folder onto the launcher to select it explicitly. The downloaded source stays in `%LOCALAPPDATA%\IdleOnTravel`. The launcher itself can live anywhere.

## Updates and restore

Edit and upload `menu.js` to distribute menu changes. The installer replaces this menu's previous injection rather than stacking copies. Backups are kept under `rom-travel-backups` in the game folder, with separate backups for changed game versions. Existing desktop patches can be upgraded: the recognized menu is removed before creating an unpatched backup.

Run `Restore-IdleOn.bat` from the downloaded repository to uninstall. Restore refuses to apply an old backup if Steam or another tool changed the archive after installation. Steam's **Verify integrity of game files** can restore the current official version in that case.

The update launcher executes installer code from the repository. Share only your configured launcher, and use a repository whose owner you trust.

## Current menu limitations

- This packages menu 0.1.2 as currently installed; it does not fix the reported colosseum/enemy labeling issue yet.
- Enemy labels come from AFK map targets, so special maps can show a surrounding area's enemy. Check the map name beneath the label.
- World/location numbers are menu numbers, not official map IDs.
- Skill entries travel to a map but do not walk to resources or start gathering.
- Progression unlocks are not checked.
- A future game update may require adapting the menu's internal game references even if the travel function still exists.

## Local installation without Git

Download/extract the repository, then run `install.ps1` with Windows PowerShell, supplying `-GamePath` if desired. Git is only needed for the update launcher.

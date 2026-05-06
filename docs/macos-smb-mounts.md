# macOS SMB Mounts — tank NAS

**Purpose:** Document the working SMB-mount setup for `tank.nerdsbythehour.com` on this Mac, the two coexisting mount paths, and how to recover when a fresh login can't reach tank.

**Status:** Working as of 2026-05-06.

## Network context

`tank.nerdsbythehour.com` (MAC `8c:30:66:c4:8e:9d`) is intentionally multi-homed:

- `192.168.1.30` — 1GbE Ethernet
- `192.168.68.41` — SFP+ aggregate / 10GbE

This Mac is on `192.168.68.0/24`. Only the `.68.41` SFP+ IP is reachable. `tank.nerdsbythehour.com` resolves to the SFP+ IP (single answer); `tank.local` mDNS may resolve to either and can silently pick the unreachable `.1.30` first because `smbfs` is mounted with `soft`, which swallows the failure.

**Rule:** prefer `tank.nerdsbythehour.com` over `tank.local` for any pinned config.

## Two mount paths, both live

The current setup has the same shares mounted twice via two independent mechanisms. Both work; pick whichever path your tool expects.

### 1. autofs — `/mnt/tank/<share>`

Configured in `/etc/auto_master` and `/etc/auto_tank`:

```
# /etc/auto_master
/mnt/tank   auto_tank   -nosuid
```

```
# /etc/auto_tank
family   -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/family
jims     -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/jims
mjs      -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/mjs
molly    -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/molly
public   -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/public
shared   -fstype=smbfs,soft   ://timemachine@tank.nerdsbythehour.com/shared
```

- Mount triggers on first access (`ls /mnt/tank/shared`, etc.).
- Real path is `/System/Volumes/Data/mnt/tank/<share>` — `/mnt/tank` is a firmlink.
- Shares mount as user `timemachine`; the password must be in the user keychain or the silent-fail trap kicks in.
- `nobrowse` — these don't appear in Finder's sidebar.
- Pinned to `tank.nerdsbythehour.com` (not `tank.local`) — avoids the `.1.30` routing trap.

### 2. Login Items — `/Volumes/<share>`

Configured via System Settings → General → Login Items & Extensions → **Open at Login** (set up 2026-05-06).

- Mounts: `family`, `mjs`, `molly`, `public`, `shared`, plus `Personal-Drive` (not in autofs map).
- Path: `/Volumes/<share>`.
- Connects via `tank.local` on first login, using cached keychain creds.
- Visible in Finder sidebar; reconnects automatically on login.

## Setup recipe (full)

If the Mac is rebuilt or Login Items are lost, do this once:

1. **Prime the keychain** — Finder → Go → Connect to Server (Cmd+K) → `smb://tank.nerdsbythehour.com` → enter `timemachine` credentials → check **Remember this password in my keychain** → mount any share (e.g. `shared`).
2. **Add to Login Items** — System Settings → General → Login Items & Extensions → Open at Login → `+` → from the dialog, expand the tank server in the sidebar and pick each share to auto-mount → Add. Repeat for each share.
3. **Verify autofs** — confirm `/etc/auto_master` has the `/mnt/tank   auto_tank   -nosuid` line and `/etc/auto_tank` exists with the share entries above. If missing, write them as root and run `sudo automount -cv`.
4. **Smoke test** — log out, log back in, then in a fresh terminal:

   ```
   ls /Volumes/shared          # Login Items path
   ls /mnt/tank/shared         # autofs path
   ```

   Both should list contents with no password prompt.

## Symptoms and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `ls /mnt/tank/<share>` returns empty or hangs | autofs SMB auth failed silently (the `soft` option) — keychain entry missing or wrong password | Cmd+K to `smb://tank.nerdsbythehour.com`, re-check *Remember in keychain*; then `sudo automount -cv` |
| Finder reports the alias is missing on login | Login Items entry was lost (often after a macOS update or keychain reset) | Re-mount via Cmd+K and re-add to Login Items per recipe step 2 |
| Mount works from Finder but shell sees nothing at `/mnt/tank/<share>` | autofs hasn't been triggered yet — it mounts on access, not at login | Just `ls /mnt/tank/<share>`; the access itself triggers the mount |
| Connection slow / falls back to 1GbE speed | DNS resolved `tank.local` to `192.168.1.30` instead of `.68.41` | Use `tank.nerdsbythehour.com` (single-IP DNS answer) in any config, not `tank.local` |
| Wrong subnet — can't reach tank at all | This Mac is on `.68.0/24`, the `.1.30` IP is on a separate VLAN this host can't route to | Confirm with `ping tank.nerdsbythehour.com` — must show `.68.41` |

## Why both mechanisms?

- **Login Items** gives Finder integration and visible volumes for GUI workflows.
- **autofs** gives a stable, scriptable path (`/mnt/tank/...`) for tools and shell scripts that don't tolerate `/Volumes/<share>` disappearing across reboots or different macOS user sessions.

Keeping both is intentional. If you remove one, update this doc and the related memory note.

## Related

- NFS exports on tank live under `/var/nfs/shared/<share>` if NFS becomes preferable to SMB (not currently used from this host).
- All shares mount as the `timemachine` SMB user — a single shared identity, not per-user creds.

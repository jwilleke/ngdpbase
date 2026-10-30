# Files

One file layer: every file the site keeps, pages included, owned by one manager, coming in and going out through one doorway, and seen in one browser. Epic [#1851](https://github.com/jwilleke/ngdpbase/issues/1851) (its [decision log](https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946) holds the earlier review); upload work [#2135](https://github.com/jwilleke/ngdpbase/issues/2135); import and export [ICE, #1979](https://github.com/jwilleke/ngdpbase/issues/1979) ([ice-planing.md](ice-planing.md)). Terms follow [docs/GLOSSARY.md](../GLOSSARY.md).

Status: design decided (operator, 2026-10-30, brainstorm). Not built. Today FileManager only reads (`list`, `get`, `findByName`); every write goes through `AttachmentManager.uploadAttachment`, which picks the destination from the page being edited ([storage-developer-guide.md](../guides/storage-developer-guide.md#files-one-record-one-door)).

## Decisions (operator, 2026-10-30)

- __One owner: FileManager.__ It owns where each file lives (public, a vault, a shared folder, the media library), its record, sealing, owner, who can read it, moves, delete and backup. AttachmentManager becomes storage underneath it.
- __MediaManager is a handler, not a second owner.__ It handles photos and video: the read-only library scan, EXIF/XMP, thumbnails, and per-file metadata edits on request. FileManager calls it for a media file. Library maintenance (reindex, rebuild, explain a path) stays an admin tool.
- __A page is a file__, of type page. A place holds pages and files together, side by side in the place's own storage; there is no separate attachments store per place.
- __No file belongs to a page.__ A page only links to a file. The page-to-upload tie (#1398) goes.
- __Uploads are imports, downloads are exports: both go through ICE.__ FileManager's __Upload file__ dialog hands the file to ICE; ICE vets it and returns control to FileManager, which stores it in the place the user chose. One code path for every upload: the editor, the file picker, a folder page and `/import` all use it.
- __The dialog shows the places this user may upload to, and nothing else:__ the public pool when they hold `asset-upload`, each of their own vaults, each shared folder where they hold `shared-folder-file`. They pick one; the default is where they are working, never inferred from whether a page exists. "Private" and "Attach to this page" go.
- __Vetting is an ICE stage every file passes before it is stored:__ the type is read from the bytes, not the name (#1624); `ngdpbase.attachment.allowedtypes` stays site-wide for now; each format's shim cleans its own kind (HTML in CSV cells, spreadsheet formulas, scripts and handlers in SVG). A file that needs cleaning is __cleaned and the cleaned copy kept__, and the user is told what was removed, as NCM conversion already does.
- __One file browser at `/files`__, for every signed-in user: the places they can open, filtered by place, type and name, showing a place's pages and files in one list. __Upload file__ sits at the top. It replaces the Browse Assets picker and `/admin/media`'s browsing; the editor's insert-a-file opens it as a picker. `/shared/<name>` and a vault's page list become views of the same place.
- __Navigation:__ a __Files__ entry in the main menu leads to `/files`, which lists the shared folders a user can read; `/executive` links to `/shared/executive`.
- "Upload Attachment" becomes __Upload file__ and leaves the Edit menu; user-facing words say "file", never "attachment".

## Build order

Approved (operator, 2026-10-30) and filed under #1851: step 1 [#2148](https://github.com/jwilleke/ngdpbase/issues/2148), step 2 [#2149](https://github.com/jwilleke/ngdpbase/issues/2149), step 3 [#2150](https://github.com/jwilleke/ngdpbase/issues/2150).

- 1 FileManager writes: upload to a chosen place (permission per place, sealing, audit), with AttachmentManager as its storage; the places-you-may-write list.
- 2 ICE in front of it: the Upload file dialog as an ICE import with a keep-as-file receiver; vetting and cleaning in the format shims, with the user told what was removed.
- 3 `/files`: the browser and picker; Files in the menu; Browse Assets and `/admin/media` browsing retired.
- 4 Pages and files side by side in a place's storage (the storage-layout change), with the existing #1851 sub-issues (#1853–#1859).

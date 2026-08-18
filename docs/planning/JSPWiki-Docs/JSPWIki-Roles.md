# Roles

The Roles system works like this:

1. The spefic User roles (like admin, reader, editor) that are assigned to a user are stored in users/users.json
2. Policies define what actions those roles can perform, stored in config/app-default-config.json under ngdpbase.access.policies form src/managers/ConfigurationManager.js
3. PolicyEvaluator evaluates whether a role has permission to perform an action

| Constant Name | Value | Meaning/Role in JSPWiki |
| ---------------------- | ------- | ------------------------------------------------------------------------------ |
| __READ__ | 0 | Normal internal page link. Points to a wiki page for viewing (`<a class="wikipage">`). |
| __EDIT__ | 1 | Link to create or edit a page if it does not exist (`<a class="createpage">`). |
| __EMPTY__ | 2 | Indicates an empty link, renders as underlined text (`<u>`), not clickable. |
| __LOCAL__ | 3 | Local anchor/footnote within the same page (`<a class="footnote">`). |
| __LOCALREF__ | 4 | Reference to a footnote or section within the same page (`<a class="footnoteref">`). |
| __IMAGE__ | 5 | Image link: an embedded image (`<img>`). |
| __EXTERNAL__ | 6 | External link (URL outside wiki); may append outlink icon (`<a class="external">`). |
| __INTERWIKI__ | 7 | Link to another wiki system (“InterWiki”) (`<a class="interwiki">`). |
| __IMAGELINK__ | 8 | Clickable image that acts as a link (`<a><img></a>`). |
| __IMAGEWIKILINK__ | 9 | Wiki page link with a thumbnail image; links image to a wiki page. |
| __ATTACHMENT__ | 10 | Link to an attachment/file uploaded to the wiki (`<a class="attachment">`). |

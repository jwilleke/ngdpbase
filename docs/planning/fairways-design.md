# The Fairways: site design planning

Status: brainstorm and requirements. Nothing here is agreed for building yet.

Issue: [#2391](https://github.com/jwilleke/ngdpbase/issues/2391)

Started: 2026-11-13, from Jim's notes in Slack.

## Problem

The Fairways site is "boring". Most residents of the association are older, many live alone, and it needs younger owners. The site does little to build a sense of community.

The current `fairways` theme (v2.0.0, from [#2310](https://github.com/jwilleke/ngdpbase/pull/2310)) was built to be calm and readable:

- **Colours:** paper background, fairway-green actions, and brick red only on the Members Only link.
- **Text:** the Atkinson Hyperlegible font, in a reading column about 70 characters wide.
- **Pictures:** the wordmark logo only, with no photos.

## Who the Home page is for

Jim, 2026-11-13: Home has two jobs.

1. **Signed out:** make people who don't live here want to. That means prospective owners only, not renters.
2. **Signed in:** give current occupants quick information on what they want to see.

## What occupants want first

In Jim's order:

1. What's on this week, at The Fairways and in Mount Vernon.
2. Notices from the board: meetings, work being done, water shut-offs.
3. The latest posts on the occupants' discussion list (Google Group).

## Sources we already have

- **Clubhouse calendar:** reservations go into a Google Calendar through [jwilleke/fairways-clubhouse-calendar](https://github.com/jwilleke/fairways-clubhouse-calendar), an Apps Script with a Google Form.
- **Event calendar:** on the current site, www.fairwayscondos.org. How it is published isn't checked yet.
- **Discussion list:** the occupants' Google Group. Whether the site can read recent topics, or can only link to the group, is still open.
- Related planning: [Forms-to-Calendar](../Forms-to-Calendar.md), [Condo-Management](Condo-Management.md).

## Mount Vernon events: the feed idea

Jim likes pulling events from local sources. The candidates, none checked yet for a feed (iCal or RSS):

- Visit Knox County, the visitors' bureau: festivals, concerts, First Fridays.
- The public library: talks, classes, book clubs.
- City of Mount Vernon: council meetings, road work, parades.
- MVNU and Kenyon College: concerts, lectures, sports. These suit the younger-people goal.

The idea is to read each feed once a day and show only the next 7 days, a few items from each source, each linking back to it. A source with no feed becomes a volunteer's weekly wiki page, or is dropped.

## Community ideas (brainstorm, not agreed)

- **New neighbours:** an opt-in welcome for each new owner, with a photo, where they came from and one interest.
- **Interest circles:** walking, cards, golf, rides to appointments. People join a circle, not a list of names.
- **A standing weekly event**, such as coffee at the clubhouse, always on Home. One regular thing is easier to join than a calendar.
- **Check-in buddy:** people living alone can opt in to a daily or weekly "I'm OK" with a buddy.
- **Resident story:** once a month, on the signed-out Home page, a resident, a photo and why they like living here.

## Rules that hold whatever we build

- The signed-out view shows community life without personal details: no names, unit numbers or who lives alone.
- Nobody is listed or shown without opting in, and that includes photos with faces.
- Readability for older eyes stays: type size, contrast and plain wording.
- Volunteers keep content fresh as wiki pages they already know how to edit.
- Demographic figures about residents don't go in this public repository.

## Open questions for Jim

- Who keeps events, notices and photos up to date, and how often?
- Is there a younger-people goal beyond the site, such as an open house or a welcome committee, that the site should support?
- Which of the community ideas above are worth pursuing?
- One Home page whose sections change with sign-in, or two pages? This is a design question, to settle in the wireframe.

## Next steps

1. Jim answers the open questions.
2. Requirements are agreed on [#2391](https://github.com/jwilleke/ngdpbase/issues/2391).
3. A low-fidelity wireframe of Home, signed out and signed in.
4. Then the theme and page work, as separate issues.

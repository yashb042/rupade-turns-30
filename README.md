# You, me & thirty. ♡

A birthday scrapbook for Rupade, from Yash. A static website with no build step or runtime dependencies. All paths work on a GitHub Pages project site.

## Run locally

Requires Node.js 20 or later. Run `npm start`, then open http://localhost:3030. Set `PORT` to use another port. The server binds only to this computer.

Run `npm test` for content validation, quiz scoring, reason randomization, imported-image validation, and bundled-image checks.

## What’s inside

- Ten editable romantic quiz questions. Wrong answers reveal a funny, optional challenge; scoring, progress, and replay are included.
- Thirty bundled internet placeholder photos with categories, a folding scrapbook, and a keyboard-accessible lightbox. Use arrow keys for next/previous and Escape to close.
- Two hundred original love notes, shuffled without repeats until the entire set is exhausted. Save favorites on the current browser or copy a reason.
- Original SVG cats, a birthday letter, and confetti that respects reduced-motion preferences.
- A gift editor with browser previews, photo resizing, JSON import, and export.

The default questions are playful romantic starters, not invented facts about your relationship. Replace them with your personal memories and answers when ready.

## Personalize the gift

1. Open **Personalize this gift** in the footer.
2. Change the names and birthday letter under **The details**.
3. Under **30 photos**, choose up to 30 JPG, PNG, or WebP photos, or replace individual photos. Update captions and categories. Images are resized to a maximum dimension of 1400 px and exported as JPEG, removing embedded camera metadata.
4. Under **The quiz**, change each question, its four choices, the correct choice, and its challenge.
5. **Save browser preview** stores the changes in IndexedDB on the current browser. This does not publish them. Favorites also stay on the current browser. Clearing site data removes these previews and favorites.
6. **Export content.json** downloads a single file containing your content and uploaded photos. Replace the repository’s `content.json` with that file and commit/push it. GitHub Pages then publishes the changes. Keep this export as your backup.

You can also edit `content.json` directly and place images in `assets/`. Image paths should use `./assets/name.jpg`, an HTTPS URL, or an editor-generated image data URL. Set `placeholder` to `false` for each real photo; the placeholder notice disappears after all 30 are replaced. The first two gallery photos also appear in the hero.

Edit `reasons.json` to change the love notes. Keep exactly 200 distinct, nonempty entries. The site checks the content before loading.

The editor is a local customization tool, not a remote admin account. Visitors cannot change the published site through it; publishing requires repository access. This is a public GitHub Pages site, and all content placed in the repository is publicly readable. The quiz is a party game, so the answer key is included in its static content.

## Publish on GitHub Pages

Publish the repository to `yashb042/rupade-turns-30`. Under **Settings → Pages**, use **Deploy from a branch**, select **main**, and choose **/(root)**. The `.nojekyll` file keeps the site static. No secrets, backend, or API keys are needed.

The site URL is https://yashb042.github.io/rupade-turns-30/ once GitHub finishes deployment. Changes pushed to `main` are published automatically.

## Image and font credits

Temporary photos are from [Lorem Picsum](https://picsum.photos/) and [Unsplash](https://unsplash.com/), downloaded into `assets/` so the gallery does not depend on live image services. Each photo’s original download URL is retained in `content.json` as `sourceUrl`. These are placeholders, not personal photos or memories. Replace them before the final birthday reveal.

Fonts: DM Sans, DM Serif Display, and Kalam, served by Google Fonts, with system fallbacks. Cat illustrations are original SVG artwork created for this site.

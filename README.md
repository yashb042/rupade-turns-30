# You, me & always. ♡

A birthday scrapbook for Rupade, from Yash. The public website is static, with no build step or runtime dependencies. All paths work on a GitHub Pages project site.

## Run locally

Requires Node.js 20 or later. Run `npm start`, then open [the website](http://localhost:3030/) or [the scrapbook editor](http://localhost:3030/upload.html). The server binds only to this computer. Use `PORT` for an alternative local port.

Run `npm test` for quiz scoring, content migration, photo/year validation, upload APIs, publishing retries, access checks, reason randomization, and bundled images. API tests use temporary folders and a simulated publisher; they never alter the real scrapbook or push test content.

## Upload photos and years

1. Keep `npm start` running in this repository. GitHub CLI (`gh`) must be installed and signed in as an account with write access to `yashb042/rupade-turns-30`.
2. Open **Upload photos** from the gallery or footer. Choose one or more photos, choose a folder, or drop images onto the page.
3. Add a year for each photo. Optionally apply one year to the entire batch, add captions, or select specific gallery positions. Sample photos are selected for replacement first; existing personal photos require choosing their positions.
4. Press **Upload to the website**. Images are resized, saved into `assets/`, committed with the updated gallery, and pushed to GitHub. Pages publishes the update automatically, usually within a minute.

The uploader accepts JPG, PNG, or WebP, up to 25 MB per input image and 30 photos per batch. Images are resized to a maximum dimension of 1400 px and saved as JPEG, removing embedded camera metadata. Each photo requires a year between 1900 and the current year. The gallery displays years and offers a year filter. Its first two photos also appear in the hero.

The [public editor](https://yashb042.github.io/rupade-turns-30/upload.html) connects to the local server at port 3030. If the browser requests local network access, allow it for that page, or use the local editor directly. The server and GitHub login stay on your computer; Pages itself cannot save uploads. Other visitors cannot publish without their own local server and repository access.

If publication fails, the page offers **Finish publishing** to retry the saved changes. Repeated requests do not create duplicate photos or commits. A changed gallery in another window causes a reload message instead of overwriting edits. Pending uploads are tracked in ignored `.local/upload-state.json`.

## Add your questions and answers

The editor’s **Questions & answers** section accepts up to ten personal questions, their accepted answers, and optional wrong-answer challenges. Put alternate accepted answers on separate lines. Capitalization, extra spaces, curly apostrophes, and trailing sentence punctuation are ignored when checking answers.

**Save questions to the website** replaces the whole quiz with your list and publishes it. There are no starter questions. Until questions are added, the quiz displays an invitation to write them. Remove all questions and save to clear the quiz. A wrong answer shows the correct answer; if you supplied a challenge, players may complete or skip it before continuing.

## Other personal touches

- Two hundred original love notes shuffle without repeating until every note has appeared. Favorites stay in the current browser.
- Two original SVG cats: black and white, and mostly white with light brown. Each has a patch on one side of its face.
- The gallery includes categories, a folding scrapbook, and a keyboard-accessible lightbox. Arrow keys move through photos; Escape closes the view.
- Birthday confetti respects reduced-motion preferences.

**Personalize this gift** in the footer edits names and the birthday letter. Its **Save browser preview** affects only the current browser. To publish those details, export `content.json`, replace the repository file, and commit/push it. The upload page publishes photos and questions directly. Clearing browser site data removes previews and favorite notes.

You can also edit `content.json` directly. Keep 30 gallery entries and use local `./assets/name.jpg` paths, HTTPS image URLs, or editor-generated image data URLs. Set `placeholder` to `false` for personal photos. Edit `reasons.json` to change the notes, keeping exactly 200 distinct, nonempty entries. Older browser previews migrate away from the original starter questions and age-specific text.

The GitHub Pages site and its repository are public. Uploaded photos, years, and quiz answers are included in the published content.

## GitHub Pages

Repository: `yashb042/rupade-turns-30`. Pages is configured to **Deploy from a branch**, **main**, **/(root)**. The `.nojekyll` file keeps the site static. Changes pushed to `main` publish automatically to [Rupade’s birthday website](https://yashb042.github.io/rupade-turns-30/). The existing URL is retained so shared links continue working.

## Credits

Temporary photos are from [Lorem Picsum](https://picsum.photos/) and [Unsplash](https://unsplash.com/), bundled in `assets/`. Each original download URL is retained as `sourceUrl` in `content.json`. These are sample photos to replace with your own memories.

Fonts: DM Sans, DM Serif Display, and Kalam via Google Fonts, with system fallbacks. Cat illustrations are original SVG artwork.

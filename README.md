A- Persistent local settings (language, username, last room code).
- English/Spanish interface switch.
- Responsive layout for desktop and mobile.

## Project structure

- `index.html` landing + join + room wizard.
- `editor.html` standalone script IDE.
- `styles/main.css` warm styles for landing and wizard.
- `styles/editor.css` IDE layout and command panel styles.
- `js/app.js` landing/wizard logic and metadata edit mode.
- `js/editor-page.js` standalone IDE behavior and realtime editing.
- `js/firebase.js` Firebase room, script, and presence operations.
- `js/firebase-config.js` Firebase project configuration.
- `js/i18n.js` bilingual UI dictionary and translation helpers.
- `js/storage.js` localStorage persistence.
- `docs/editor-guide.md` concise editor usage guide.

## Run locally

Because this app uses ES modules, run it with a local static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Room access is done with query params (for example: `editor.html?room=1000`), which is compatible with GitHub Pages.

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In GitHub, open **Settings → Pages**.
3. Set **Build and deployment** to:
   - Source: `Deploy from a branch`
   - Branch: `main` (or your default branch), folder `/ (root)`
4. Save and wait for deployment.
5. Open the generated GitHub Pages URL.

## Firebase Realtime Database notes (Spark plan)

Use secure database rules before production. Example starter rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

For real projects, restrict write/read access by authentication and room-level permissions.

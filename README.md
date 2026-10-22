# CT Viewer

Viewer web simplu pentru exporturi CT sub formă de imagini (`.jpg`/`.png`), organizate pe subfoldere (serii).
Rulează 100% în browser — **imaginile nu se încarcă nicăieri**.

## Utilizare (versiunea web)

1. Deschide pagina (GitHub Pages).
2. Trage folderul exportului CT în pagină sau apasă **Alege folder…**.
3. Navighezi: rotiță mouse / săgeți (← → ↑ ↓), PageUp/PageDown (±10), Home/End, `[` și `]` pentru serie anterioară/următoare.

Ajustări de afișare: luminozitate, contrast, invert.

## Pentru LLM / automatizare

După încărcarea unui folder, pagina expune în consolă `window.CTViewer`:

```js
CTViewer.listSeries()          // [{id, folder, label, orientation, kind, count}, ...]
CTViewer.goTo("s03", 45)       // sare la seria s03, secțiunea 45 (1-based)
CTViewer.step(1)               // secțiunea următoare
CTViewer.getState()            // {series, folder, slice, count, file}
```

URL-ul se actualizează la fiecare secțiune (`?series=s03&slice=45`).

## Mod server local (opțional)

Dacă pui `index.html`, `viewer.js`, `viewer.css` în folderul exportului și generezi un index:

```bash
python tools/generate_manifest.py .
python -m http.server 8848
```

pagina încarcă automat `manifest.json` (fără pasul de alegere a folderului), iar un LLM poate citi direct
`manifest.json` și accesa fiecare imagine prin cale relativă.

## Confidențialitate

`.gitignore` exclude imaginile și `manifest.json`. Nu comite date de pacient în acest repo.

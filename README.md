# New York

A small static guide for our New York visit. Plain HTML/CSS/JS, no build step. Hosts on GitHub Pages.

## Structure

- `index.html` — shell
- `styles.css` — typography + layout (grey / dark grey / off-white)
- `app.js` — hash-routed views + detail modal
- `data.js` — categories and items (edit this to add content)
- `images/` — item photos

## Categories

Photography · Dinner · Brunch · Landmarks · Parks · Museums · Museums for Kids

Each category holds up to 30 items.

## Adding an item

Open `data.js` and push into the right category's `items` array. Shape:

```js
{
  id: "moma",
  name: "Museum of Modern Art",
  subtitle: "Midtown",
  image: "./images/moma.jpg",
  address: "11 W 53rd St, New York, NY",
  hours: "Sun–Fri 10:30–17:30, Sat 10:30–19:00",
  price: "$30 adults",
  website: "https://www.moma.org",
  description: "Long-form text. Use \\n for paragraph breaks. Plane-reading length is fine."
}
```

Place the image in `images/` and reference it as `./images/your-file.jpg`.

## Run locally

Any static server works. For example:

```
cd ~/Desktop/MyProjects/new-york
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings → Pages → Source: `main` branch, `/` root.
3. Open the Pages URL.

# Onsay IO

Onsay as a chat widget for your website, app or kiosk. Drop it in, point it at your lingo client, and it sends what
people type and shows the answers. Open source and made to be changed: build your own support widget, help desk or
automation panel on top of it.

## Put him on a page

Design him at [onsay.dev/io](https://onsay.dev/io) and copy the script tag it gives you. Paste it before `</body>` on
your site, once, in your layout:

```html
<script src="https://cdn.jsdelivr.net/gh/brandozer1/onsay-io@latest/dist/onsay-io.js"
  data-settings='{"address": "laptop.yourhandle/onsay", "character": {"color": "#5865f2"}}'></script>
```

It loads straight from this repository, so it is always the latest version. `data-settings` holds the settings, as
JSON; every one is below, and any you leave out keeps its default. For a page that is all chat, say which element to
fill: `data-into="#chat"`. Rather host the file yourself? Take `onsay-io.js` from the
[releases page](https://github.com/brandozer1/onsay-io/releases) and point the tag's `src` at your copy.

The address is your lingo client's `/onsay` route, by your computer's Onsay name, like `laptop.yourhandle/onsay`; the
designer offers yours. Any web address works too, like `https://help.example.com/onsay` for your own service in front
of it.

## Settings

`use` is what the widget is for. It sets the defaults for the panel and the chat, and anything you write in the
settings wins over them.

| Use | What it is |
|-----|------------|
| `support` | help on a website: a bubble in the corner, closed until clicked, the chat kept for the visit |
| `team` | a tool a team keeps open: a drawer down the side of the page, open from the start, kept on the browser |
| `me` | your own page: the chat fills the page, kept on the browser |

| Setting | What it is |
|---------|------------|
| `address` | where messages go: your lingo client's `/onsay` route, or your own service in front of it. An Onsay name or a web address (*Addresses*) |
| `key` | a prompt key, sent as a bearer token. Leave it out on a public page: anyone who opens the page can read it |
| `character.color`, `face` | his colour, and the colour of his face |
| `character.material` | his surface, one of the materials `src/character.js` has: `flat`, `matte`, `soft`, `glossy`, `liquid`, `glass`, `frosted`, `pearl`, `chrome`, `gold`, `copper` or `anodised` |
| `character.mood` | what he does when nobody is talking to him: `calm`, `happy`, `alert`, `sleepy` or `still` |
| `character.size` | his size in pixels, when he sits in the corner |
| `panel.title`, `greeting`, `placeholder` | the panel's title, what he says first, and the hint in the message box |
| `panel.side` | `right` or `left` |
| `panel.theme` | `auto` (the page's `data-theme`, or what the device prefers), `light` or `dark` |
| `panel.shape`, `open` | `bubble`, `drawer` or `page`, and whether it starts open. Set by `use`, and yours to change |
| `session.remember` | where the chat is kept: `none`, `visit` or `browser`. Set by `use`, and yours to change |

## Addresses

The address is an Onsay name or a web address, told apart by the one rule every Onsay program keeps: a host is on the
web when it is an IP, `localhost`, or a name with a dot ending in one of the web's top level domains (`src/tlds.txt`,
IANA's list), like `example.com`. Any other, like `laptop.yourhandle`, is an Onsay name, and the widget asks Onsay
once a page where it goes, at `https://api.onsay.dev/resolve/laptop.yourhandle`, then sends to the web address it
gives, the rest of the address after it: today the free proxy, `https://api.onsay.dev/proxy/laptop.yourhandle/onsay`.
`http://` or `https://` may be left off.

## What it sends

One POST to the address for each message, as JSON, with the prompt key as `Authorization: Bearer` when there is one:

```json
{ "prompt": "What you typed", "session": "an id for this chat" }
```

which is what a lingo client's `/onsay` takes, the session keeping the chat on that computer. The answer is shown as it
comes back: JSON with `text`, or the `questions` Onsay asks back, a line each, or `answer` or `value` in it, or plain
text. When the address refuses, its `error` is shown.

## Layout

| Folder or file | What it is |
|----------------|------------|
| `src/onsay-io.js` | the widget: settings, memory, sending a message, and the panel |
| `src/tlds.txt` | the web's top level domains, the same list Onsay keeps, for telling an Onsay name from a web address |
| `src/character.js` | Onsay the character, a copy of the website's (`website/src/lib/character.js` in the onsay repo) |
| `index.html` | a page to try him on, its settings in its script tag |
| `dist/` | the built widget, one file, made by `npm run build` and committed: websites load it from here through jsDelivr |

## Build

```
npm install
npm start       builds and serves index.html at http://localhost:8000, rebuilding as you edit
npm run build   dist/onsay-io.js
```

To release: run `npm run build`, commit `dist/onsay-io.js` with the change, then push a tag like `v0.1.0` (or open
Actions on GitHub, pick release and press Run workflow). Every site using the script tag gets it within about 12 hours,
as jsDelivr picks up the newest version tag. [`.github/workflows/release.yml`](.github/workflows/release.yml) refuses
a release whose `dist/` isn't the build of `src/`. The version is in `package.json`.

## License

Apache License 2.0. See [LICENSE](LICENSE). Made by Brandon Gamez and the Onsay project. See also the
[lingo client](https://github.com/brandozer1/lingo-client).

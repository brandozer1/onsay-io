# Onsay IO

The agent's face: a UI shell and customer facing widget for support and automation. It has no lingo client of its own.
It only sends prompts to a lingo client somewhere else, at its `/onsay` route, and shows the answers. Drop it into a
website, an app or a kiosk, point it at a lingo client, and shape it to fit.

This repository is being scaffolded; the code lands as the work begins.

## What it is

- A thin face over a lingo client that runs elsewhere. All the thinking happens there and on Onsay's servers; IO just
  sends prompts and renders replies.
- Open source and made to be customized: the look, the copy, the session behaviour, and the settings are all yours to
  change. Build your own support widget, help bot or automation panel on top of it.

## How it reaches a lingo client

- It is given a prompt key and an address, and sends prompts to that lingo client's `/onsay` route with the key.
- Where it lives somewhere public, like a website, it holds no key. A key on a public page could be read, so instead it
  talks to a server that holds the key and handles auth and anti-spam, and the page never sees the key.
- Its settings are hard coded like a widget: signing in to Onsay, the session, and the UI options needed to fit any
  situation.

## Versions

It can be written in C, but it has to run on websites and other interfaces, so there will be a few builds for
versatility (a native build, and web and widget bundles).

## License

Apache License 2.0. See [LICENSE](LICENSE). Part of Onsay: see the lingo client (https://github.com/brandozer1/lingo-client)
and Onsay Desktop (https://github.com/brandozer1/onsay-desktop).

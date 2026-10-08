# Contributing to NoBurnout

NoBurnout is a small collection of short, satisfying browser games for software engineers who need a break. Contributions are welcome, whether that is a bug report, a fix, a new mode or a whole new game.

## Report a bug or suggest something

- **Found a bug?** [Open a bug report](https://github.com/devground-labs/noburnout/issues/new?template=bug_report.yml). The in-game **Report issue** button prefills the game name for you.
- **Have an idea?** [Suggest a game or feature](https://github.com/devground-labs/noburnout/issues/new?template=game_idea.yml).
- Please search existing issues first to avoid duplicates.

## Run it locally

```bash
git clone https://github.com/devground-labs/noburnout.git
cd noburnout
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Make a change

1. Fork the repo and create a branch from `main`.
2. Make your change and play-test it in the browser (desktop and, if relevant, a narrow/mobile viewport).
3. Run `npm run build` to make sure it compiles.
4. Open a pull request and fill in the template. Small, focused PRs are easiest to review.

For anything big, such as a new game, please open an issue first so we can agree on the idea before you invest time.

## Adding a new game

Each game is a class that extends `BaseGame` and lives in `src/games/<your-game>/`. See "Adding a New Game to the Framework" in the [README](README.md) for the full steps. In short:

1. Create `src/games/my-game/MyGame.js` extending `BaseGame` (`init`, `start`, `update`, `destroy`, `getHUDHtml`, `getControlsGuide`).
2. Register it in `src/main.js` with `engine.registry.register(MyGame)`.
3. Optionally add an accent colour and icon for its landing card in `GAME_THEMES` in `src/framework/UIManager.js`.

Games that own their own scene, camera and HUD (like Overdrive and Cyber-Runner) are a good pattern to copy: set `this.hasCustomRender = true` and render with your own camera.

### What makes a good NoBurnout game

- Easy to learn, fun within the first minute, and a round lasts a few minutes.
- No daily streaks, timers that punish you for leaving, or pressure to come back.
- Works with keyboard, and ideally touch.
- Plays offline once loaded.

## Guidelines

- **No new third-party requests.** The site ships a strict Content-Security-Policy (`vercel.json`) that only allows its own origin. Bundle fonts, models and sounds with the app. Sounds are synthesized with Web Audio, so there are no audio files to add.
- **No tracking or personal data.** Do not add cookies, extra analytics or anything that collects user data.
- **Keep it accessible and responsive.** Check the HUD at phone width and keep text readable.
- **Match the look.** Use the shared design tokens and the existing navbar and modal styles in `src/style.css`.
- **No secrets.** Never commit keys, tokens or credentials.

## License

NoBurnout is released under the [MIT License](LICENSE). By submitting a contribution you agree that it may be distributed under the same license.

## Be kind

Be respectful and constructive in issues and reviews. We are all here to have a little fun.

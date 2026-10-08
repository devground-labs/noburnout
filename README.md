# NoBurnout

Short, satisfying browser games for software engineers in the age of AI. Take a few minutes between prompts, builds and code reviews, then come back sharper. No installs, no accounts, no streaks.

Under the hood it is a 3D web game framework:

A high-performance, modular **3D Web Game Framework** built on **Three.js**, **Cannon-es physics**, and **Web Audio API**. Designed for building and cataloging multi-game arcade suites.

---

## 🚀 Key Framework Features

- **Modular Game Architecture**: Pure object-oriented `BaseGame` lifecycle contract (`init`, `start`, `update`, `render`, `destroy`, `getHUDHtml`, `getControlsGuide`).
- **Dynamic Multi-Game Registry**: Easily register new games into the catalog with metadata, custom game modes, player counts, and genre tags.
- **Physics Engine**: Integrated with `cannon-es` rigid body dynamics (collisions, forces, materials).
- **Procedural Audio Synthesizer**: Low-latency procedural Web Audio engine generating laser blasts, missile launches, explosions, chimes, and brass fanfare with **0 external asset network dependencies**.
- **Universal Input Manager**: Unified handling for Keyboard (P1 and P2 separate key mappings), Mouse, and mobile touch.
- **Cyberpunk Arcade Shell**: Integrated header bar, real-time FPS counter, game switcher modal, sound mute, fullscreen support, and toast alerts.

---

## 🕹️ Games

1. **Cyber Tanks 3D** (`cyber-tanks`): tactical tank duels with destructible cover. Modes: 1P vs AI, 2P local duel, Practice target range. A match is 3 rounds.
2. **Neon Astro-Blaster 3D** (`astro-blaster`): dodge and blast asteroid fields with twin plasma blasters and combo multipliers. Modes: Arcade Survival, Practice Drift.
3. **Neon Overdrive** (`neon-overdrive`): an endless synthwave highway. Dodge traffic and barricades as the speed climbs.
4. **Cyber-Runner** (`cyber-runner`): jump and double jump over obstacles and grab gems. 1 Player is endless with rising difficulty, 2 Players is a head-to-head race.

---

## 🤝 Contributing

Contributions are very welcome, from bug reports to whole new games.

- **Found a bug?** [Report an issue](https://github.com/devground-labs/noburnout/issues/new?template=bug_report.yml)
- **Have a game or feature idea?** [Suggest it](https://github.com/devground-labs/noburnout/issues/new?template=game_idea.yml)
- **Want to build something?** Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, how to add a game and the guidelines.

Licensed under the [MIT License](LICENSE).

---

## 📁 Project Structure

```
game-arcade/
├── index.html                   # Arcade shell & canvas mount
├── vite.config.js               # Portable build config (base: './')
├── package.json                 # Project scripts & dependencies
├── README.md                    # Framework documentation & guides
├── public/
│   └── favicon.svg              # Arcade vector favicon
└── src/
    ├── main.js                  # Engine & game registration bootstrap
    ├── style.css                # Futuristic arcade shell styling
    ├── framework/
    │   ├── Engine.js            # Three.js loop, camera, renderer, lifecycle
    │   ├── BaseGame.js          # Abstract base class for all games
    │   ├── GameRegistry.js      # Game catalog & metadata registry
    │   ├── PhysicsWorld.js      # Cannon-es physics manager
    │   ├── AudioManager.js      # Procedural sound synthesizer
    │   ├── InputManager.js      # Universal P1/P2/touch controller
    │   └── UIManager.js         # Shell HUD, modals & toast system
    └── games/
        ├── cyber-tanks/         # Cyber Tanks 3D game module
        └── astro-blaster/       # Neon Astro-Blaster 3D game module
```

---

## 🛠️ Adding a New Game to the Framework

Adding a new game requires just 3 simple steps:

### 1. Create your Game Class extending `BaseGame`
```javascript
// src/games/my-game/MyGame.js
import { BaseGame } from '../../framework/BaseGame.js';
import * as THREE from 'three';

export class MyGame extends BaseGame {
  constructor() {
    super({
      id: 'my-game',
      name: 'Super Speed Racer',
      subtitle: 'High Speed 3D Racing',
      description: 'Race through neon cyber tracks against the clock.',
      icon: '🏎️',
      badge: '3D Physics',
      genre: 'Racing',
      players: '1 Player',
      modes: ['Time Trial', 'Freestyle']
    });
  }

  async init(engine) {
    await super.init(engine);
    // Add Three.js meshes, lights, or Cannon-es physics bodies here
  }

  update(dt, input) {
    // Process input (input.getP1()) and step game simulation
  }

  getHUDHtml() {
    return `<div class="my-custom-hud">SPEED: <span id="speed">0</span> KM/H</div>`;
  }
}
```

### 2. Register it in `src/main.js`
```javascript
import { MyGame } from './games/my-game/MyGame.js';

engine.registry.register(MyGame);
```

### 3. Launch!
Your game automatically appears in the Arcade Game Selector modal with full game modes, controls help guide, and HUD integration!

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
```

---

## 📊 Visitor counter

The landing page shows a live visitor count, served by a small Go function ([`api/visitors.go`](api/visitors.go), logic in [`internal/counter`](internal/counter)) backed by Redis.

- Each visitor is counted **once per day**. The server stores only a keyed hash of the IP address for 24 hours to avoid double counting. Raw IPs are never stored.
- Requests are limited to 20 per minute per IP (in memory, before Redis is touched), and POSTs from other origins are rejected. For stronger protection, add a rate-limit rule for `/api/visitors` in the Vercel Firewall.
- If the API or Redis is unavailable, the page quietly shows its default tile instead.

**Configuration** (environment variables, see [`.env.example`](.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `REDIS_URL` | yes | `redis://` or `rediss://` connection string |
| `VISITOR_SALT` | no | secret for hashing IPs (defaults to a hash of `REDIS_URL`) |
| `ALLOWED_HOSTS` | no | extra hostnames allowed to count visitors |

**Run it locally** (needs Go and a Redis instance):

```bash
REDIS_URL=redis://localhost:6379 go run ./cmd/dev   # API on :8787
npm run dev                                          # Vite proxies /api to it
go test ./...                                        # backend tests
```

Without it the site still works; the counter tile just stays on its default.

---

## 🏗️ Production Build

```bash
# Check that everything compiles (outputs to dist/)
npm run build
```

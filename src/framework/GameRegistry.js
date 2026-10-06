/**
 * GameRegistry - Catalog of all playable arcade titles.
 */
export class GameRegistry {
  constructor() {
    this.games = new Map();
  }

  register(GameClass) {
    const tempInstance = new GameClass();
    this.games.set(tempInstance.id, {
      id: tempInstance.id,
      name: tempInstance.name,
      subtitle: tempInstance.subtitle,
      description: tempInstance.description,
      icon: tempInstance.icon,
      badge: tempInstance.badge,
      genre: tempInstance.genre,
      players: tempInstance.players,
      modes: tempInstance.modes,
      GameClass
    });
  }

  get(id) {
    return this.games.get(id);
  }

  getAll() {
    return Array.from(this.games.values());
  }
}

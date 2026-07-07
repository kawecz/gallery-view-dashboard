import { App, Modal, Setting } from "obsidian";
import { fetchSteamGame, type GameMetadata } from "../importers/games";

export class SteamGameModal extends Modal {
	private onConfirm: (game: GameMetadata) => void;

	constructor(app: App, onConfirm: (game: GameMetadata) => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "🎮 Import Game from Steam",
			attr: { style: "margin-top: 0;" },
		});

		contentEl.createEl("p", {
			text: "Enter a Steam App ID or store URL.",
			attr: {
				style: "color: var(--text-muted); font-size: 0.85em; margin-bottom: 12px;",
			},
		});

		let inputValue = "";
		const resultContainer = contentEl.createDiv({
			cls: "gallery-steam-result",
		});

		new Setting(contentEl)
			.setName("Steam App ID or URL")
			.addText((text) =>
				text
					.setPlaceholder("e.g., 730 or https://store.steampowered.com/app/730/")
					.onChange((value) => {
						inputValue = value;
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Fetch")
					.setCta()
					.onClick(() => {
						void (async () => {
							if (!inputValue.trim()) return;
							resultContainer.empty();
							resultContainer.createDiv({
								text: "Fetching game data...",
								attr: {
									style: "text-align: center; padding: 20px; color: var(--text-muted);",
								},
							});

							try {
								const game = await fetchSteamGame(inputValue.trim());
								resultContainer.empty();

								if (!game) {
									resultContainer.createDiv({
										text: "Game not found. Check the App ID or URL.",
										attr: {
											style: "text-align: center; padding: 20px; color: var(--text-error);",
										},
									});
									return;
								}

								const preview = resultContainer.createDiv({
									cls: "gallery-game-preview",
								});
								preview.setCssProps({
									display: "flex",
									gap: "12px",
									padding: "10px",
									border: "1px solid var(--background-modifier-border)",
									borderRadius: "8px",
									background: "var(--background-secondary)",
								});

								if (game.coverUrl) {
									const imgWrap = preview.createDiv({
										attr: {
											style: "width: 150px; flex-shrink: 0; border-radius: 4px; overflow: hidden;",
										},
									});
									imgWrap.createEl("img", {
										attr: {
											src: game.coverUrl,
											style: "width: 100%; display: block;",
										},
									});
								}

								const info = preview.createDiv({ attr: { style: "flex: 1;" } });
								info.createEl("strong", {
									text: game.title,
									attr: { style: "display: block; margin-bottom: 6px; font-size: 1.1em;" },
								});
								if (game.developer) {
									info.createEl("div", {
										text: `Developer: ${game.developer}`,
										attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
									});
								}
								if (game.genres) {
									info.createEl("div", {
										text: `Genres: ${game.genres}`,
										attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
									});
								}
								if (game.rating) {
									info.createEl("div", {
										text: `Metacritic: ${game.rating}`,
										attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
									});
								}

								const importBtn = resultContainer.createEl("button", {
									text: "Import This Game",
									cls: "mod-cta",
									attr: { style: "margin-top: 12px; width: 100%;" },
								});
								importBtn.addEventListener("click", () => {
									this.onConfirm(game);
									this.close();
								});
							} catch {
								resultContainer.empty();
								resultContainer.createDiv({
									text: "Failed to fetch game data.",
									attr: {
										style: "text-align: center; padding: 20px; color: var(--text-error);",
									},
								});
							}
						})();
					}),
			);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
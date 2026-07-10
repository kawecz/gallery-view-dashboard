import { Plugin, WorkspaceLeaf, TFile } from "obsidian";
import { GalleryDashboardView, VIEW_TYPE_GALLERY } from "./view";
import { GalleryViewSettings, DEFAULT_SETTINGS } from "./types";
import { GalleryViewSettingTab } from "./settings";
import { GoogleBookModal } from "./modals/google-book";
import { SteamGameModal } from "./modals/steam-game";
import { MovieModal } from "./modals/movie";
import { getYouTubeDuration } from "./importers/youtube";

export default class GalleryViewPlugin extends Plugin {
	settings!: GalleryViewSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GalleryViewSettingTab(this.app, this));

		this.registerView(
			VIEW_TYPE_GALLERY,
			(leaf: WorkspaceLeaf) => new GalleryDashboardView(leaf, this),
		);

		this.addRibbonIcon("library", "Open Library Gallery", () => {
			void this.activateGalleryView();
		});

		this.addCommand({
			id: "open-gallery-dashboard",
			name: "Open Gallery Dashboard Layout",
			callback: () => void this.activateGalleryView(),
		});

		// YouTube import command
		this.addCommand({
			id: "import-youtube",
			name: "Import from YouTube",
			callback: () => {
				// Will be handled by view.ts modal
			},
		});

		// Book import command
		this.addCommand({
			id: "import-book",
			name: "Import Book from Google Books",
			callback: () => {
				const apiKey = this.settings.googleBooksApiKey;
				if (!apiKey) return;
				new GoogleBookModal(this.app, apiKey, (book) => {
					void this.createBookNote(
						book,
						this.settings.rootSearchPath || "",
					);
				}).open();
			},
		});

		// Game import command
		this.addCommand({
			id: "import-game",
			name: "Import Game from Steam",
			callback: () => {
				new SteamGameModal(this.app, (game) => {
					void this.createGameNote(
						game,
						this.settings.rootSearchPath || "",
					);
				}).open();
			},
		});

		// Movie import command
		this.addCommand({
			id: "import-movie",
			name: "Import Movie from TMDB",
			callback: () => {
				const apiKey = this.settings.tmdbApiKey;
				if (!apiKey) return;
				new MovieModal(this.app, apiKey, (movie) => {
					void this.createMovieNote(
						movie,
						this.settings.rootSearchPath || "",
					);
				}).open();
			},
		});

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void (async () => {
					let layoutChanged = false;

					if (this.settings.folderOverrides[oldPath]) {
						const dataConfig =
							this.settings.folderOverrides[oldPath];
						dataConfig.folderPath = file.path;
						this.settings.folderOverrides[file.path] = dataConfig;
						delete this.settings.folderOverrides[oldPath];
						layoutChanged = true;
					}

					if (this.settings.folderSortMethods[oldPath]) {
						this.settings.folderSortMethods[file.path] =
							this.settings.folderSortMethods[oldPath];
						delete this.settings.folderSortMethods[oldPath];
						layoutChanged = true;
					}

					if (this.settings.folderManualOrders[oldPath]) {
						this.settings.folderManualOrders[file.path] =
							this.settings.folderManualOrders[oldPath];
						delete this.settings.folderManualOrders[oldPath];
						layoutChanged = true;
					}

					if (
						this.settings.folderCardSizes &&
						this.settings.folderCardSizes[oldPath]
					) {
						this.settings.folderCardSizes[file.path] =
							this.settings.folderCardSizes[oldPath];
						delete this.settings.folderCardSizes[oldPath];
						layoutChanged = true;
					}

					const oldParentPath =
						oldPath.substring(0, oldPath.lastIndexOf("/")) || "";
					const oldName = oldPath.substring(
						oldPath.lastIndexOf("/") + 1,
					);

					if (this.settings.folderManualOrders[oldParentPath]) {
						this.settings.folderManualOrders[oldParentPath] =
							this.settings.folderManualOrders[oldParentPath].map(
								(itemName: string) =>
									itemName === oldName ? file.name : itemName,
							);
						layoutChanged = true;
					}

					if (layoutChanged) {
						await this.saveSettings();
					}
				})();
			}),
		);

		this.app.workspace.onLayoutReady(async () => {
			const leaves =
				this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
			for (const leaf of leaves) {
				if (leaf.view instanceof GalleryDashboardView) {
					if (!leaf.view.currentPath) {
						leaf.view.currentPath =
							this.settings.lastOpenPath ||
							this.settings.rootSearchPath ||
							"";
						await leaf.view.renderCanvas();
					}
				}
			}
		});
	}

	onunload(): void {}

	async activateGalleryView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		const existingLeaf: WorkspaceLeaf | undefined = leaves[0];

		if (existingLeaf) {
			workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			const leaf = workspace.getLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_GALLERY, active: true });
			workspace.setActiveLeaf(leaf, { focus: true });
		}
	}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			loadedData as Partial<GalleryViewSettings>,
		);
		if (!this.settings.folderCardSizes) {
			this.settings.folderCardSizes = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		for (const leaf of leaves) {
			if (leaf.view instanceof GalleryDashboardView) {
				const existingPath = leaf.view.currentPath;
				leaf.view.currentPath =
					existingPath || this.settings.rootSearchPath || "";
				void leaf.view.renderCanvas();
			}
		}
	}

	/**
	 * Detects what properties Folder Auto Properties would add.
	 */
	async detectFolderProperties(
		targetFolder: string,
	): Promise<{ key: string; value: string }[]> {
		const properties: { key: string; value: string }[] = [];

		try {
			const dataFile = this.app.vault.getAbstractFileByPath(
				`${this.app.vault.configDir}/plugins/folder-auto-properties/data.json`,
			);
			if (!(dataFile instanceof TFile)) return properties;

			const content = await this.app.vault.read(dataFile);
			const settings = JSON.parse(content) as {
				rules?: {
					folder: string;
					properties: Record<string, unknown>;
				}[];
			};

			if (settings.rules && Array.isArray(settings.rules)) {
				for (const rule of settings.rules) {
					if (
						targetFolder === rule.folder ||
						targetFolder.startsWith(rule.folder + "/")
					) {
						if (rule.properties) {
							for (const [key, value] of Object.entries(
								rule.properties,
							)) {
								properties.push({ key, value: String(value) });
							}
						}
					}
				}
			}
		} catch {
			// Plugin not installed
		}

		return properties;
	}
	async createYouTubeNote(
		url: string,
		videoId: string,
		title: string,
		thumbnailUrl: string,
		targetPath: string,
	) {
		let notePath = targetPath ? `${targetPath}/${title}.md` : `${title}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(notePath)) {
			notePath = targetPath
				? `${targetPath}/${title} ${counter}.md`
				: `${title} ${counter}.md`;
			counter++;
		}

		// STEP 1: Create the file with minimal content so Folder Auto Properties can intercept
		await this.app.vault.create(notePath, "");

		// STEP 2: Wait for Folder Auto Properties to process the file
		await new Promise((resolve) => window.setTimeout(resolve, 200));

		// STEP 3: Read the file to see what Folder Auto Properties added
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return;

		const existingContent = await this.app.vault.read(file);

		// Parse existing frontmatter
		let existingFm: Record<string, unknown> = {};
		const fmMatch = existingContent.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch && fmMatch[1]) {
			const lines = fmMatch[1].split("\n");
			for (const line of lines) {
				const colonIndex = line.indexOf(":");
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					const value = line
						.substring(colonIndex + 1)
						.trim()
						.replace(/^["']|["']$/g, "");
					existingFm[key] = value;
				}
			}
		}

		// STEP 4: Add our YouTube-specific properties (existing ones take priority)
		const duration = await getYouTubeDuration(
			url,
			this.settings.youtubeApiKey || "",
		);

		existingFm.banner = thumbnailUrl;
		existingFm.type = "youtube";
		if (duration) existingFm.duration = duration;
		if (this.settings.addPropertiesOnCreate && !existingFm.created) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr) existingFm.created = dateStr;
		}

		// STEP 5: Rebuild the file
		const fmLines = Object.entries(existingFm).map(
			([key, value]) => `${key}: "${String(value).replace(/"/g, '\\"')}"`,
		);

		const iframeEmbed = `<iframe title="${title.replace(/"/g, "&quot;")}" src="https://www.youtube.com/embed/${videoId}?feature=oembed" height="113" width="200" allowfullscreen="" allow="fullscreen" style="aspect-ratio: 1.76991 / 1; width: 100%; height: 100%;"></iframe>`;
		const fileContents = `---\n${fmLines.join("\n")}\n---\n\n${iframeEmbed}\n`;

		await this.app.vault.modify(file, fileContents);
	}

	async createBookNote(
		book: {
			title: string;
			author: string;
			coverUrl: string;
			isbn: string;
			description: string;
			subjects: string;
			year: string;
			publisher: string;
		},
		targetPath: string,
	) {
		const safeTitle = book.title.replace(/[\\/:?*"<>|]/g, " ");
		let notePath = targetPath
			? `${targetPath}/${safeTitle}.md`
			: `${safeTitle}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(notePath)) {
			notePath = targetPath
				? `${targetPath}/${safeTitle} ${counter}.md`
				: `${safeTitle} ${counter}.md`;
			counter++;
		}

		// Create empty file first
		await this.app.vault.create(notePath, "");
		await new Promise((resolve) => window.setTimeout(resolve, 200));

		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return;

		const existingContent = await this.app.vault.read(file);

		// Parse existing frontmatter (from Folder Auto Properties)
		let existingFm: Record<string, unknown> = {};
		const fmMatch = existingContent.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch && fmMatch[1]) {
			const lines = fmMatch[1].split("\n");
			for (const line of lines) {
				const colonIndex = line.indexOf(":");
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					const value = line
						.substring(colonIndex + 1)
						.trim()
						.replace(/^["']|["']$/g, "");
					existingFm[key] = value;
				}
			}
		}

		// Add our book properties
		existingFm.type = "book";
		if (book.coverUrl && !existingFm.banner)
			existingFm.banner = book.coverUrl;
		if (book.title && !existingFm.title) existingFm.title = book.title;
		if (book.author && !existingFm.author) existingFm.author = book.author;
		if (book.isbn && !existingFm.isbn) existingFm.isbn = book.isbn;
		if (book.year && !existingFm.year) existingFm.year = book.year;
		if (book.publisher && !existingFm.publisher)
			existingFm.publisher = book.publisher;
		if (book.subjects && !existingFm.genres)
			existingFm.genres = book.subjects;
		if (book.description && !existingFm.about)
			existingFm.about = book.description;
		if (this.settings.addPropertiesOnCreate && !existingFm.created) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr) existingFm.created = dateStr;
		}

		const fmLines = Object.entries(existingFm).map(
			([key, value]) => `${key}: "${String(value).replace(/"/g, '\\"')}"`,
		);

		// Empty body
		const fileContents = `---\n${fmLines.join("\n")}\n---\n`;
		await this.app.vault.modify(file, fileContents);
	}

	async createGameNote(
		game: {
			title: string;
			developer: string;
			publisher: string;
			genres: string;
			coverUrl: string;
			description: string;
			releaseDate: string;
			rating: string;
			steamAppId: string;
		},
		targetPath: string,
	) {
		const safeTitle = game.title.replace(/[\\/:?*"<>|]/g, " ");
		let notePath = targetPath
			? `${targetPath}/${safeTitle}.md`
			: `${safeTitle}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(notePath)) {
			notePath = targetPath
				? `${targetPath}/${safeTitle} ${counter}.md`
				: `${safeTitle} ${counter}.md`;
			counter++;
		}

		// Create empty file first
		await this.app.vault.create(notePath, "");
		await new Promise((resolve) => window.setTimeout(resolve, 200));

		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return;

		const existingContent = await this.app.vault.read(file);

		let existingFm: Record<string, unknown> = {};
		const fmMatch = existingContent.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch && fmMatch[1]) {
			const lines = fmMatch[1].split("\n");
			for (const line of lines) {
				const colonIndex = line.indexOf(":");
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					const value = line
						.substring(colonIndex + 1)
						.trim()
						.replace(/^["']|["']$/g, "");
					existingFm[key] = value;
				}
			}
		}

		existingFm.type = "game";
		if (game.coverUrl && !existingFm.banner)
			existingFm.banner = game.coverUrl;
		if (game.title && !existingFm.title) existingFm.title = game.title;
		if (game.developer && !existingFm.developer)
			existingFm.developer = game.developer;
		if (game.publisher && !existingFm.publisher)
			existingFm.publisher = game.publisher;
		if (game.genres && !existingFm.genres) existingFm.genres = game.genres;
		if (game.releaseDate && !existingFm.release_date)
			existingFm.release_date = game.releaseDate;
		if (game.rating && !existingFm.rating) existingFm.rating = game.rating;
		if (game.steamAppId && !existingFm.steam_app_id)
			existingFm.steam_app_id = game.steamAppId;
		if (game.description && !existingFm.about)
			existingFm.about = game.description;
		if (this.settings.addPropertiesOnCreate && !existingFm.created) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr) existingFm.created = dateStr;
		}

		const fmLines = Object.entries(existingFm).map(
			([key, value]) => `${key}: "${String(value).replace(/"/g, '\\"')}"`,
		);

		// Empty body
		const fileContents = `---\n${fmLines.join("\n")}\n---\n`;
		await this.app.vault.modify(file, fileContents);
	}

	async createMovieNote(
		movie: {
			title: string;
			director: string;
			year: string;
			genres: string;
			coverUrl: string;
			description: string;
			rating: string;
			tmdbId: string;
		},
		targetPath: string,
	) {
		const safeTitle = movie.title.replace(/[\\/:?*"<>|]/g, " ");
		let notePath = targetPath
			? `${targetPath}/${safeTitle}.md`
			: `${safeTitle}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(notePath)) {
			notePath = targetPath
				? `${targetPath}/${safeTitle} ${counter}.md`
				: `${safeTitle} ${counter}.md`;
			counter++;
		}

		// Create empty file first
		await this.app.vault.create(notePath, "");
		await new Promise((resolve) => window.setTimeout(resolve, 200));

		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return;

		const existingContent = await this.app.vault.read(file);

		let existingFm: Record<string, unknown> = {};
		const fmMatch = existingContent.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch && fmMatch[1]) {
			const lines = fmMatch[1].split("\n");
			for (const line of lines) {
				const colonIndex = line.indexOf(":");
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					const value = line
						.substring(colonIndex + 1)
						.trim()
						.replace(/^["']|["']$/g, "");
					existingFm[key] = value;
				}
			}
		}

		existingFm.type = "movie";
		if (movie.coverUrl && !existingFm.banner)
			existingFm.banner = movie.coverUrl;
		if (movie.title && !existingFm.title) existingFm.title = movie.title;
		if (movie.director && !existingFm.director)
			existingFm.director = movie.director;
		if (movie.year && !existingFm.year) existingFm.year = movie.year;
		if (movie.genres && !existingFm.genres)
			existingFm.genres = movie.genres;
		if (movie.rating && !existingFm.rating)
			existingFm.rating = movie.rating;
		if (movie.tmdbId && !existingFm.tmdb_id)
			existingFm.tmdb_id = movie.tmdbId;
		if (movie.description && !existingFm.about)
			existingFm.about = movie.description;
		if (this.settings.addPropertiesOnCreate && !existingFm.created) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr) existingFm.created = dateStr;
		}

		const fmLines = Object.entries(existingFm).map(
			([key, value]) => `${key}: "${String(value).replace(/"/g, '\\"')}"`,
		);

		// Empty body
		const fileContents = `---\n${fmLines.join("\n")}\n---\n`;
		await this.app.vault.modify(file, fileContents);
	}
}

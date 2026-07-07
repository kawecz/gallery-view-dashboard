import {
	App,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	TAbstractFile,
} from "obsidian";
import type GalleryViewPlugin from "./main";
import { GalleryDashboardView, VIEW_TYPE_GALLERY } from "./view";

class FolderSuggest {
	private app: App;
	private inputEl: HTMLInputElement;
	private suggestionEl: HTMLDivElement | null = null;

	constructor(app: App, inputEl: HTMLInputElement) {
		this.app = app;
		this.inputEl = inputEl;
		this.init();
	}

	private init() {
		this.inputEl.addEventListener("focus", () => this.showSuggestions());
		this.inputEl.addEventListener("input", () => this.showSuggestions());

		window.activeDocument.addEventListener("click", (e) => {
			if (
				e.target !== this.inputEl &&
				this.suggestionEl &&
				!this.suggestionEl.contains(e.target as Node)
			) {
				this.close();
			}
		});
	}

	private close() {
		if (this.suggestionEl) {
			this.suggestionEl.remove();
			this.suggestionEl = null;
		}
	}

	private showSuggestions() {
		const value = this.inputEl.value.toLowerCase();
		const folders: string[] = [];

		const visit = (file: TAbstractFile) => {
			if (file instanceof TFolder) {
				if (file.path !== "/") {
					folders.push(file.path);
				}
				file.children.forEach(visit);
			}
		};
		visit(this.app.vault.getRoot());

		const filtered = folders
			.filter((f) => f.toLowerCase().includes(value))
			.slice(0, 8);

		if (filtered.length === 0) {
			this.close();
			return;
		}

		if (!this.suggestionEl) {
			this.suggestionEl = window.activeDocument.body.createDiv({
				cls: "suggestion-container gallery-suggestion-container",
			});
			const rect = this.inputEl.getBoundingClientRect();
			this.suggestionEl.setCssProps({
				top: `${rect.bottom + window.scrollY}px`,
				left: `${rect.left + window.scrollX}px`,
				width: `${rect.width}px`,
			});
		}

		const listWrap = this.suggestionEl.createDiv({ cls: "suggestion" });

		filtered.forEach((folderPath) => {
			const item = listWrap.createDiv({
				cls: "suggestion-item",
				text: folderPath,
			});
			item.addClass("suggestion-item");

			item.addEventListener("mouseenter", () => {
				item.addClass("gallery-suggestion-item-hover");
			});
			item.addEventListener("mouseleave", () => {
				item.removeClass("gallery-suggestion-item-hover");
			});

			item.addEventListener("click", () => {
				this.inputEl.value = folderPath;
				this.inputEl.dispatchEvent(new Event("input"));
				this.close();
			});
		});
	}
}

export class GalleryViewSettingTab extends PluginSettingTab {
	plugin: GalleryViewPlugin;
	private debounceTimeout: number | null = null;

	constructor(app: App, plugin: GalleryViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private broadcastPathChange(newPath: string) {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof GalleryDashboardView) {
				void leaf.view.updateRootPath(newPath);
			}
		});
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Gallery View Configurations")
			.setHeading();

		const rootSetting = new Setting(containerEl)
			.setName("Library Root Target Path")
			.setDesc(
				"Specify the folder path that acts as your library dashboard.",
			);

		rootSetting.addText((text) => {
			text.setPlaceholder("e.g., conteudo/cursos").setValue(
				this.plugin.settings.rootSearchPath,
			);

			text.inputEl.addEventListener("input", (e) => {
				const targetValue = (e.target as HTMLInputElement).value;

				if (this.debounceTimeout !== null) {
					window.clearTimeout(this.debounceTimeout);
				}

				this.debounceTimeout = window.setTimeout(() => {
					void (async () => {
						const trimmedValue = targetValue.trim();
						this.plugin.settings.rootSearchPath = trimmedValue;
						await this.plugin.saveSettings();
						this.broadcastPathChange(trimmedValue);

						const treeRoot = containerEl.querySelector(
							".gallery-view-subfolder-tree-root",
						) as HTMLElement;
						if (treeRoot) {
							treeRoot.empty();
							this.renderTreeContainer(treeRoot);
						}
					})();
				}, 300);
			});

			new FolderSuggest(this.app, text.inputEl);
		});

		new Setting(containerEl).setName("Global Display").setHeading();

		new Setting(containerEl)
			.setName("Visible Metadata Keys")
			.addText((text) =>
				text
					.setPlaceholder("tags, status, todo")
					.setValue(this.plugin.settings.visibleProperties.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.visibleProperties = value
							.split(",")
							.map((p) => p.trim())
							.filter((p) => p.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show Action Checkboxes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCheckboxes)
					.onChange(async (value) => {
						this.plugin.settings.showCheckboxes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show Folder Progress Bars")
			.setDesc(
				"Recursively scan notes inside directories and print visual completion bars if a frontmatter 'checkbox' exists.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFolderProgress)
					.onChange(async (value) => {
						this.plugin.settings.showFolderProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Add Core Properties on Note Creation")
			.setDesc(
				"Automatically inject frontmatter attributes (e.g., created date properties) to newly generated vault items.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addPropertiesOnCreate)
					.onChange(async (value) => {
						this.plugin.settings.addPropertiesOnCreate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Import Options").setHeading();
		new Setting(containerEl).setDesc(
			"Choose which import options appear in the Add+ menu and right-click context menu.",
		);

		new Setting(containerEl)
			.setName("🎬 YouTube Import")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showYouTubeImport)
					.onChange(async (value) => {
						this.plugin.settings.showYouTubeImport = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("📚 Book Import (Google Books)")
			.setDesc("Requires Google Books API key to function.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showBookImport)
					.onChange(async (value) => {
						this.plugin.settings.showBookImport = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("🎮 Game Import (Steam)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGameImport)
					.onChange(async (value) => {
						this.plugin.settings.showGameImport = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("🎬 Movie Import (TMDB)")
			.setDesc("Requires TMDB API key to function.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showMovieImport)
					.onChange(async (value) => {
						this.plugin.settings.showMovieImport = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Asset Fallbacks").setHeading();

		new Setting(containerEl)
			.setName("Default Folder Banner")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultFolderBanner)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolderBanner = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default Note File Banner")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultFileBanner)
					.onChange(async (value) => {
						this.plugin.settings.defaultFileBanner = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default PDF File Banner")
			.setDesc(
				"Fallback banner utilized explicitly for document and PDF asset card layers.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultPdfBanner)
					.onChange(async (value) => {
						this.plugin.settings.defaultPdfBanner = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("API Keys").setHeading();

		// In settings.ts, find the API Keys section and update:

		new Setting(containerEl)
			.setName("YouTube Data API Key (optional)")
			.setDesc(
				"Enables fetching video duration when importing from YouTube. Get a free key from Google Cloud Console.",
			)
			.addText((text) => {
				text.setPlaceholder("AIza...")
					.setValue(this.plugin.settings.youtubeApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.youtubeApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				// Mask the input
				text.inputEl.type = "password";
				// Add toggle visibility button
				const toggleBtn = text.inputEl.parentElement?.createEl(
					"button",
					{
						text: "👁",
						attr: {
							style: "position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 0.8em;",
							"aria-label": "Toggle visibility",
						},
					},
				);
				if (toggleBtn) {
					toggleBtn.addEventListener("click", () => {
						text.inputEl.type =
							text.inputEl.type === "password"
								? "text"
								: "password";
						toggleBtn.textContent =
							text.inputEl.type === "password" ? "👁" : "🙈";
					});
				}
			});

		new Setting(containerEl)
			.setName("TMDB API Key (optional)")
			.setDesc(
				"Required for importing movies. Get a free API key from https://www.themoviedb.org/settings/api",
			)
			.addText((text) => {
				text.setPlaceholder("tmdb key...")
					.setValue(this.plugin.settings.tmdbApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.tmdbApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
				const toggleBtn = text.inputEl.parentElement?.createEl(
					"button",
					{
						text: "👁",
						attr: {
							style: "position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 0.8em;",
							"aria-label": "Toggle visibility",
						},
					},
				);
				if (toggleBtn) {
					toggleBtn.addEventListener("click", () => {
						text.inputEl.type =
							text.inputEl.type === "password"
								? "text"
								: "password";
						toggleBtn.textContent =
							text.inputEl.type === "password" ? "👁" : "🙈";
					});
				}
			});

		new Setting(containerEl)
			.setName("Google Books API Key (optional)")
			.setDesc(
				"Required for importing books. Get a free key from https://console.cloud.google.com/apis/library/books.googleapis.com",
			)
			.addText((text) => {
				text.setPlaceholder("Google Books API key...")
					.setValue(this.plugin.settings.googleBooksApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.googleBooksApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
				const toggleBtn = text.inputEl.parentElement?.createEl(
					"button",
					{
						text: "👁",
						attr: {
							style: "position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 0.8em;",
							"aria-label": "Toggle visibility",
						},
					},
				);
				if (toggleBtn) {
					toggleBtn.addEventListener("click", () => {
						text.inputEl.type =
							text.inputEl.type === "password"
								? "text"
								: "password";
						toggleBtn.textContent =
							text.inputEl.type === "password" ? "👁" : "🙈";
					});
				}
			});

		new Setting(containerEl)
			.setName("Live Library Vault Tree Structure")
			.setHeading();
		const treeContainer = containerEl.createDiv({
			cls: "gallery-view-subfolder-tree-root",
		});

		this.renderTreeContainer(treeContainer);
	}

	private renderTreeContainer(containerEl: HTMLElement) {
		const targetPath = (this.plugin.settings.rootSearchPath || "").trim();
		const resolvedPath =
			targetPath === "/" || targetPath === "" ? "" : targetPath;

		const rootFolder =
			resolvedPath === ""
				? this.app.vault.getRoot()
				: this.app.vault.getAbstractFileByPath(resolvedPath);

		if (!(rootFolder instanceof TFolder)) {
			containerEl.createDiv({
				text: "Target directory path configuration is invalid or does not exist.",
				cls: "setting-item-description",
			});
			return;
		}

		const controlsRow = containerEl.createDiv({
			cls: "gallery-tree-controls-row",
		});

		const expandAllBtn = controlsRow.createEl("button", {
			text: "Expand All",
			cls: "gallery-tree-expand-btn",
		});
		const collapseAllBtn = controlsRow.createEl("button", {
			text: "Collapse All",
			cls: "gallery-tree-collapse-btn",
		});

		const treeWrapper = containerEl.createDiv({
			cls: "gallery-tree-wrapper",
		});

		const folders = rootFolder.children.filter(
			(child) => child instanceof TFolder,
		) as TFolder[];
		const pdfs = rootFolder.children.filter(
			(child) => child instanceof TFile && child.extension === "pdf",
		) as TFile[];

		if (folders.length > 0) {
			const folderSection = treeWrapper.createDiv({
				cls: "gallery-tree-section",
			});
			folderSection.createDiv({
				cls: "gallery-tree-section-header",
				text: "📁 Folders",
			});

			folders
				.sort((a, b) =>
					a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					}),
				)
				.forEach((folder) => {
					this.displayFolderTree(folderSection, folder, 0);
				});
		}

		if (folders.length === 0 && pdfs.length === 0) {
			treeWrapper.createDiv({
				text: "No folders or PDFs found in this location.",
				cls: "gallery-tree-empty-msg",
			});
		}

		expandAllBtn.addEventListener("click", () => {
			void (async () => {
				const allContainers = treeWrapper.querySelectorAll<HTMLElement>(
					".gallery-tree-nested-container",
				);
				const allToggles = treeWrapper.querySelectorAll<HTMLElement>(
					".gallery-tree-toggle-btn",
				);

				allContainers.forEach((el) => {
					el.setCssProps({ display: "block" });
				});
				allToggles.forEach((el) => {
					el.textContent = "▾";
				});

				const updateShowSubs = (folder: TFolder) => {
					if (this.plugin.settings.folderOverrides[folder.path]) {
						this.plugin.settings.folderOverrides[
							folder.path
						]!.showSubs = true;
					}
					folder.children
						.filter((child) => child instanceof TFolder)
						.forEach((child) => updateShowSubs(child));
				};
				folders.forEach((folder) => updateShowSubs(folder));

				await this.plugin.saveSettings();
			})();
		});

		collapseAllBtn.addEventListener("click", () => {
			void (async () => {
				const allContainers = treeWrapper.querySelectorAll(
					".gallery-tree-nested-container",
				) as NodeListOf<HTMLElement>;
				const allToggles = treeWrapper.querySelectorAll(
					".gallery-tree-toggle-btn",
				) as NodeListOf<HTMLElement>;

				allContainers.forEach((el) => {
					el.setCssProps({ display: "none" });
				});
				allToggles.forEach((el) => {
					el.textContent = "▸";
				});

				const updateShowSubs = (folder: TFolder) => {
					if (this.plugin.settings.folderOverrides[folder.path]) {
						this.plugin.settings.folderOverrides[
							folder.path
						]!.showSubs = false;
					}
					folder.children
						.filter((child) => child instanceof TFolder)
						.forEach((child) => updateShowSubs(child));
				};
				folders.forEach((folder) => updateShowSubs(folder));

				await this.plugin.saveSettings();
			})();
		});
	}

	private displayFolderTree(
		containerEl: HTMLElement,
		folder: TFolder,
		level: number,
	) {
		const childPath = folder.path;

		if (!this.plugin.settings.folderOverrides[childPath]) {
			this.plugin.settings.folderOverrides[childPath] = {
				folderPath: childPath,
				bannerUrl: "",
				showSubs: false,
			};
		}

		const folderData = this.plugin.settings.folderOverrides[childPath];
		const hasSubContent = folder.children.some(
			(item) =>
				item instanceof TFolder ||
				(item instanceof TFile && item.extension === "pdf"),
		);

		const rowWrapper = containerEl.createDiv({
			cls: "gallery-tree-row",
		});
		rowWrapper.setAttr("data-level", String(level));

		const flexRow = rowWrapper.createDiv({
			cls: "gallery-tree-flex-row",
		});

		if (level > 0) {
			const spacer = flexRow.createDiv({
				cls: "gallery-tree-indent-line",
			});
			for (let i = 0; i < level; i++) {
				spacer.createDiv({ cls: "gallery-tree-guide" });
			}
		}

		if (hasSubContent) {
			const isExpanded = !!folderData?.showSubs;
			const toggleBtn = flexRow.createEl("button", {
				text: isExpanded ? "▾" : "▸",
				cls: "gallery-tree-toggle-btn",
				attr: {
					"aria-label": isExpanded ? "Collapse" : "Expand",
				},
			});

			toggleBtn.addEventListener("click", () => {
				void (async () => {
					const nestedContainer =
						rowWrapper.nextElementSibling as HTMLElement;
					const nextState = !folderData?.showSubs;
					if (this.plugin.settings.folderOverrides[childPath]) {
						this.plugin.settings.folderOverrides[
							childPath
						]!.showSubs = nextState;
					}
					await this.plugin.saveSettings();

					if (
						nestedContainer &&
						nestedContainer.classList.contains(
							"gallery-tree-nested-container",
						)
					) {
						nestedContainer.style.display = nextState
							? "block"
							: "none";
					}
					toggleBtn.textContent = nextState ? "▾" : "▸";
				})();
			});
		} else {
			flexRow.createDiv({ cls: "gallery-tree-toggle-spacer" });
		}

		flexRow.createSpan({
			text: "📁",
			cls: "gallery-tree-icon",
		});

		flexRow.createSpan({
			text: folder.name,
			cls: "gallery-tree-name",
		});

		const input = flexRow.createEl("input", {
			type: "text",
			placeholder: "Custom banner URL...",
			value: folderData?.bannerUrl ?? "",
			cls: "gallery-tree-banner-input",
		});

		input.addEventListener("input", () => {
			void (async () => {
				if (this.plugin.settings.folderOverrides[childPath]) {
					this.plugin.settings.folderOverrides[childPath]!.bannerUrl =
						input.value;
					await this.plugin.saveSettings();
				}
			})();
		});

		const itemCount = folder.children.length;
		const countBadge = flexRow.createSpan({
			text: String(itemCount),
			cls: "gallery-tree-count-badge",
		});
		countBadge.setAttr(
			"title",
			`${itemCount} item${itemCount === 1 ? "" : "s"}`,
		);

		if (hasSubContent) {
			const nestedContainer = containerEl.createDiv({
				cls: "gallery-tree-nested-container",
			});
			nestedContainer.style.display = folderData?.showSubs
				? "block"
				: "none";

			const childFolders = folder.children.filter(
				(child) => child instanceof TFolder,
			) as TFolder[];
			const childPDFs = folder.children.filter(
				(child) => child instanceof TFile && child.extension === "pdf",
			) as TFile[];

			childFolders
				.sort((a, b) =>
					a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					}),
				)
				.forEach((childFolder) => {
					this.displayFolderTree(
						nestedContainer,
						childFolder,
						level + 1,
					);
				});

			childPDFs
				.sort((a, b) =>
					a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					}),
				)
				.forEach((pdf) => {
					const pdfRowWrapper = nestedContainer.createDiv({
						cls: "gallery-tree-row gallery-tree-pdf-row",
					});
					pdfRowWrapper.setAttr("data-level", String(level + 1));
					const pdfFlexRow = pdfRowWrapper.createDiv({
						cls: "gallery-tree-flex-row",
					});
					if (level + 1 > 0) {
						const spacer = pdfFlexRow.createDiv({
							cls: "gallery-tree-indent-line",
						});
						for (let i = 0; i < level + 1; i++) {
							spacer.createDiv({ cls: "gallery-tree-guide" });
						}
					}
					pdfFlexRow.createDiv({ cls: "gallery-tree-toggle-spacer" });
					pdfFlexRow.createSpan({
						text: "📄",
						cls: "gallery-tree-icon gallery-tree-pdf-icon",
					});
					pdfFlexRow.createSpan({
						text: pdf.name,
						cls: "gallery-tree-name gallery-tree-pdf-name",
					});
					pdfFlexRow.createSpan({
						text: "Uses default PDF banner",
						cls: "gallery-tree-pdf-hint",
					});
				});
		}

		// Visible properties override
		const propsInput = flexRow.createEl("input", {
			type: "text",
			placeholder: "Visible properties (comma-separated)...",
			value: folderData?.visibleProperties?.join(", ") ?? "",
			cls: "gallery-tree-banner-input",
		});
		propsInput.setCssProps({
			flex: "2",
			minWidth: "100px",
			fontSize: "0.75em",
		});

		propsInput.addEventListener("input", () => {
			void (async () => {
				if (this.plugin.settings.folderOverrides[childPath]) {
					const val = propsInput.value;
					this.plugin.settings.folderOverrides[
						childPath
					]!.visibleProperties = val
						? val
								.split(",")
								.map((p) => p.trim())
								.filter((p) => p.length > 0)
						: undefined;
					await this.plugin.saveSettings();
				}
			})();
		});
	}
}

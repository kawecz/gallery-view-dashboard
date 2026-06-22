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
	private refresh(): void {
		this.refresh();
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

		// NEW SETTING
		new Setting(containerEl)
			.setName("YouTube Data API Key (optional)")
			.setDesc(
				"Enables fetching video duration when importing from YouTube. Get a free key from Google Cloud Console.",
			)
			.addText((text) =>
				text
					.setPlaceholder("AIza...")
					.setValue(this.plugin.settings.youtubeApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.youtubeApiKey = value.trim();
						await this.plugin.saveSettings();
					}),
			);

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

		// Collapse/Expand All buttons
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

		// Tree wrapper
		const treeWrapper = containerEl.createDiv({
			cls: "gallery-tree-wrapper",
		});

		// Separate folders and PDFs
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

		// Expand/Collapse All handlers
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

				// Update all folder showSubs states
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

				// Update all folder showSubs states
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
		//_isRootLevel: boolean,
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

		// Main row
		const rowWrapper = containerEl.createDiv({
			cls: "gallery-tree-row",
		});
		rowWrapper.setAttr("data-level", String(level));

		const flexRow = rowWrapper.createDiv({
			cls: "gallery-tree-flex-row",
		});

		// Indentation spacer
		if (level > 0) {
			const spacer = flexRow.createDiv({
				cls: "gallery-tree-indent-line",
			});
			// Create visual indent guides
			for (let i = 0; i < level; i++) {
				spacer.createDiv({ cls: "gallery-tree-guide" });
			}
		}

		// Toggle button or spacer
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

		// Folder icon
		flexRow.createSpan({
			text: "📁",
			cls: "gallery-tree-icon",
		});

		// Folder name
		flexRow.createSpan({
			text: folder.name,
			cls: "gallery-tree-name",
		});

		// Banner input
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

		// Item count badge
		const itemCount = folder.children.length;
		const countBadge = flexRow.createSpan({
			text: String(itemCount),
			cls: "gallery-tree-count-badge",
		});
		countBadge.setAttr(
			"title",
			`${itemCount} item${itemCount === 1 ? "" : "s"}`,
		);

		// Nested children
		if (hasSubContent) {
			const nestedContainer = containerEl.createDiv({
				cls: "gallery-tree-nested-container",
			});
			nestedContainer.style.display = folderData?.showSubs
				? "block"
				: "none";

			// Sort and separate children
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
					const rowWrapper = nestedContainer.createDiv({
						cls: "gallery-tree-row gallery-tree-pdf-row",
					});
					rowWrapper.setAttr("data-level", String(level + 1));
					const flexRow = rowWrapper.createDiv({
						cls: "gallery-tree-flex-row",
					});
					// Indentation
					if (level + 1 > 0) {
						const spacer = flexRow.createDiv({
							cls: "gallery-tree-indent-line",
						});
						for (let i = 0; i < level + 1; i++) {
							spacer.createDiv({ cls: "gallery-tree-guide" });
						}
					}
					flexRow.createDiv({ cls: "gallery-tree-toggle-spacer" });
					flexRow.createSpan({
						text: "📄",
						cls: "gallery-tree-icon gallery-tree-pdf-icon",
					});
					flexRow.createSpan({
						text: pdf.name,
						cls: "gallery-tree-name gallery-tree-pdf-name",
					});
					flexRow.createSpan({
						text: "Uses default PDF banner",
						cls: "gallery-tree-pdf-hint",
					});
				});
		}
	}

	private displayPDFRow(containerEl: HTMLElement, pdf: TFile, level: number) {
		const pdfPath = pdf.path;

		if (!this.plugin.settings.folderOverrides[pdfPath]) {
			this.plugin.settings.folderOverrides[pdfPath] = {
				folderPath: pdfPath,
				bannerUrl: "",
				showSubs: false,
			};
		}

		const pdfData = this.plugin.settings.folderOverrides[pdfPath];

		const rowWrapper = containerEl.createDiv({
			cls: "gallery-tree-row gallery-tree-pdf-row",
		});
		rowWrapper.setAttr("data-level", String(level));

		const flexRow = rowWrapper.createDiv({
			cls: "gallery-tree-flex-row",
		});

		// Indentation spacer
		if (level > 0) {
			const spacer = flexRow.createDiv({
				cls: "gallery-tree-indent-line",
			});
			for (let i = 0; i < level; i++) {
				spacer.createDiv({ cls: "gallery-tree-guide" });
			}
		}

		// Spacer to align with folder toggle
		flexRow.createDiv({ cls: "gallery-tree-toggle-spacer" });

		// PDF icon
		flexRow.createSpan({
			text: "📄",
			cls: "gallery-tree-icon gallery-tree-pdf-icon",
		});

		// PDF name
		flexRow.createSpan({
			text: pdf.name,
			cls: "gallery-tree-name gallery-tree-pdf-name",
		});

		// Banner input
		const input = flexRow.createEl("input", {
			type: "text",
			placeholder: "Custom PDF banner URL...",
			value: pdfData?.bannerUrl ?? "",
			cls: "gallery-tree-banner-input",
		});

		input.addEventListener("input", () => {
			void (async () => {
				if (this.plugin.settings.folderOverrides[pdfPath]) {
					this.plugin.settings.folderOverrides[pdfPath]!.bannerUrl =
						input.value;
					await this.plugin.saveSettings();
				}
			})();
		});

		// PDF badge
		flexRow.createSpan({
			text: "PDF",
			cls: "gallery-tree-pdf-badge",
		});
	}
}

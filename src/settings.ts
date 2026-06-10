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

		new Setting(containerEl)
			.setName("Live Library Vault Tree Structure")
			.setHeading();
		const treeContainer = containerEl.createDiv({
			cls: "gallery-view-subfolder-tree-root",
		});

		this.renderTreeContainer(treeContainer);

		new Setting(containerEl)
			.setName("Manual Customizations Overrides")
			.setHeading();

		Object.keys(this.plugin.settings.folderOverrides).forEach(
			(folderPath) => {
				const config = this.plugin.settings.folderOverrides[folderPath];
				if (!config || !config.isManual) return;
				if (folderPath === (this.plugin.settings.rootSearchPath || "/"))
					return;

				const rowSetting = new Setting(containerEl);
				rowSetting.addText((text) => {
					text.setValue(folderPath).setPlaceholder("Folder Path");
					if (folderPath.startsWith("new-folder-path-")) {
						text.setDisabled(false);
						text.onChange(async (val) => {
							this.plugin.settings.folderOverrides[val] = {
								...config,
								folderPath: val,
							};
							delete this.plugin.settings.folderOverrides[
								folderPath
							];
							await this.plugin.saveSettings();
							this.refresh();
						});
						new FolderSuggest(this.app, text.inputEl);
					} else {
						text.setDisabled(true);
					}
				});
				rowSetting.addText((text) =>
					text
						.setValue(config.bannerUrl ?? "")
						.setPlaceholder("Banner URL...")
						.onChange(async (val) => {
							config.bannerUrl = val;
							await this.plugin.saveSettings();
						}),
				);
				rowSetting.addButton((btn) =>
					btn.setButtonText("❌").onClick(() => {
						void (async () => {
							delete this.plugin.settings.folderOverrides[
								folderPath
							];
							await this.plugin.saveSettings();
							this.refresh();
						})();
					}),
				);
			},
		);

		const btnContainer = containerEl.createDiv();
		const addBtn = btnContainer.createEl("button", {
			text: "+ Add Manual Override",
			cls: "mod-cta",
		});
		addBtn.addEventListener("click", () => {
			void (async () => {
				this.plugin.settings.folderOverrides[
					"new-folder-path-" + Date.now()
				] = {
					folderPath: "",
					bannerUrl: "",
					showSubs: false,
					isManual: true,
				};
				await this.plugin.saveSettings();
				this.refresh();
			})();
		});
	}

	private renderTreeContainer(containerEl: HTMLElement) {
		const targetPath = (this.plugin.settings.rootSearchPath || "").trim();
		const resolvedPath =
			targetPath === "/" || targetPath === "" ? "" : targetPath;

		const rootFolder =
			resolvedPath === ""
				? this.app.vault.getRoot()
				: this.app.vault.getAbstractFileByPath(resolvedPath);

		if (rootFolder instanceof TFolder) {
			this.displayFolderTree(containerEl, rootFolder, 0);
		} else {
			containerEl.createDiv({
				text: "Target directory path configuration is invalid or does not exist.",
				cls: "setting-item-description",
			});
		}
	}

	private displayFolderTree(
		containerEl: HTMLElement,
		folder: TFolder,
		level: number,
	) {
		const sortedChildren = [...folder.children].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, {
				numeric: true,
				sensitivity: "base",
			}),
		);

		sortedChildren.forEach((child) => {
			const childPath = child.path;

			if (
				child instanceof TFolder ||
				(child instanceof TFile && child.extension === "pdf")
			) {
				const isFolder = child instanceof TFolder;
				const rowWrapper = containerEl.createDiv({
					cls: "gallery-tree-row-wrapper",
				});
				rowWrapper.addClass("gallery-tree-row-indent");
				rowWrapper.setCssProps({
					"--gallery-tree-indent": `${level * 12}px`,
				});

				const flexRow = rowWrapper.createDiv({
					cls: "gallery-tree-flex-row",
				});

				flexRow.createSpan({
					text: isFolder ? "↳ 📁" : "↳ 📄",
				});
				flexRow.createSpan({
					text: `${child.name}:`,
					cls: "gallery-tree-name-span",
				});

				if (!this.plugin.settings.folderOverrides[childPath]) {
					this.plugin.settings.folderOverrides[childPath] = {
						folderPath: childPath,
						bannerUrl: "",
						showSubs: false,
					};
				}
				const folderData =
					this.plugin.settings.folderOverrides[childPath];

				const input = flexRow.createEl("input", {
					type: "text",
					placeholder: isFolder
						? "Custom Folder Banner URL..."
						: "Custom PDF Banner URL...",
					value: folderData?.bannerUrl ?? "",
					cls: "gallery-tree-banner-input",
				});

				input.addEventListener("input", () => {
					void (async () => {
						if (this.plugin.settings.folderOverrides[childPath]) {
							this.plugin.settings.folderOverrides[
								childPath
							]!.bannerUrl = input.value;
							await this.plugin.saveSettings();
						}
					})();
				});

				if (isFolder) {
					const hasSubfolders = child.children.some(
						(item) =>
							item instanceof TFolder ||
							(item instanceof TFile && item.extension === "pdf"),
					);

					if (hasSubfolders) {
						const isChildExpanded = !!folderData?.showSubs;
						const nestedChildContainer = rowWrapper.createDiv({
							cls: "gallery-tree-nested-container",
						});
						nestedChildContainer.setCssProps({
							display: isChildExpanded ? "block" : "none",
						});

						const toggleBtn = flexRow.createEl("button", {
							text: isChildExpanded ? "▲" : "▼",
							cls: "gallery-tree-toggle-btn",
						});

						toggleBtn.addEventListener("click", () => {
							void (async () => {
								if (
									this.plugin.settings.folderOverrides[
										childPath
									]
								) {
									const nextState =
										!this.plugin.settings.folderOverrides[
											childPath
										]!.showSubs;
									this.plugin.settings.folderOverrides[
										childPath
									]!.showSubs = nextState;
									await this.plugin.saveSettings();

									nestedChildContainer.setCssProps({
										display: nextState ? "block" : "none",
									});
									toggleBtn.setText(nextState ? "▲" : "▼");
								}
							})();
						});

						this.displayFolderTree(
							nestedChildContainer,
							child,
							level + 1,
						);
					}
				}
			}
		});
	}
}

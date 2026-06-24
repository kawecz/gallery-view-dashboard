import {
	ItemView,
	WorkspaceLeaf,
	TAbstractFile,
	TFolder,
	TFile,
	EventRef,
	setIcon,
	requestUrl,
	Modal,
	App,
	Setting,
	Menu,
	ViewStateResult,
	normalizePath,
} from "obsidian";
import GalleryViewPlugin from "./main";
import { SortMethod } from "./types";

export const VIEW_TYPE_GALLERY = "gallery-view-dashboard";

function extractYouTubeVideoId(url: string): string | null {
	const regex =
		/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
	const match = url.match(regex);
	return match && match[1] ? match[1] : null;
}

class CreateNoteModal extends Modal {
	private onSubmit: (title: string) => void;
	constructor(app: App, onSubmit: (title: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "Create New Note",
			attr: { style: "margin-top: 0;" },
		});
		let noteTitle = "Untitled Note";

		new Setting(contentEl).setName("Note Title").addText((text) =>
			text
				.setPlaceholder("Untitled Note")
				.setValue(noteTitle)
				.onChange((value) => {
					noteTitle = value;
				}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			this.onSubmit(noteTitle.trim());
			this.close();
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

class CreateFolderModal extends Modal {
	private onSubmit: (folderName: string) => void;
	constructor(app: App, onSubmit: (folderName: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "Create New Folder",
			attr: { style: "margin-top: 0;" },
		});
		let folderName = "New Folder";

		new Setting(contentEl).setName("Folder Name").addText((text) =>
			text
				.setPlaceholder("New Folder")
				.setValue(folderName)
				.onChange((value) => {
					folderName = value;
				}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			this.onSubmit(folderName.trim());
			this.close();
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

class RenameModal extends Modal {
	private item: TAbstractFile;
	private onConfirm: () => void;
	constructor(app: App, item: TAbstractFile, onConfirm: () => void) {
		super(app);
		this.item = item;
		this.onConfirm = onConfirm;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: `Rename: ${this.item.name}`,
			attr: { style: "margin-top: 0;" },
		});

		let currentName =
			this.item instanceof TFile ? this.item.basename : this.item.name;
		const ext = this.item instanceof TFile ? `.${this.item.extension}` : "";

		new Setting(contentEl).setName("New Name").addText((text) =>
			text.setValue(currentName).onChange((value) => {
				currentName = value.trim();
			}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Rename",
			cls: "mod-cta",
		});

		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			void (async () => {
				if (!currentName) return;
				const parentPath = this.item.parent
					? this.item.parent.path
					: "";
				const trailingSlash =
					parentPath === "/" || !parentPath ? "" : "/";
				const newPath = `${parentPath}${trailingSlash}${currentName}${ext}`;
				try {
					await this.app.fileManager.renameFile(this.item, newPath);
					this.onConfirm();
				} catch (err) {
					console.error("Failed to rename item:", err);
				}
				this.close();
			})();
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

class YouTubeUrlPromptModal extends Modal {
	private onSubmit: (url: string) => void;
	constructor(app: App, onSubmit: (url: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "Import from YouTube",
			attr: { style: "margin-top: 0;" },
		});
		let inputUrl = "";
		new Setting(contentEl).setName("YouTube Link URL").addText((text) =>
			text
				.setPlaceholder("https://www.youtube.com/watch?v=...")
				.onChange((value) => {
					inputUrl = value;
				}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Next",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			if (inputUrl.trim()) this.onSubmit(inputUrl.trim());
			this.close();
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

class YouTubeConfirmModal extends Modal {
	private videoId: string;
	private defaultTitle: string;
	private onConfirm: (finalTitle: string, thumbnailUrl: string) => void;

	constructor(
		app: App,
		videoUrl: string,
		videoId: string,
		defaultTitle: string,
		onConfirm: (finalTitle: string, thumbnailUrl: string) => void,
	) {
		super(app);
		this.videoId = videoId;
		this.defaultTitle = defaultTitle.replace(/[\\/:?*"<>|]/g, " ");
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Confirm YouTube Asset Details" });
		const titleRow = contentEl.createDiv({
			attr: {
				style: "display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;",
			},
		});
		const titleInput = titleRow.createEl("input", {
			type: "text",
			value: this.defaultTitle,
			attr: { style: "width: 100%; padding: 6px;" },
		});
		const previewContainer = contentEl.createDiv({
			attr: {
				style: "position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 6px; overflow: hidden; margin-bottom: 20px;",
			},
		});
		const thumbnailUrl = `https://img.youtube.com/vi/${this.videoId}/maxresdefault.jpg`;
		previewContainer.createEl("img", {
			attr: {
				src: thumbnailUrl,
				style: "width: 100%; height: 100%; object-fit: cover;",
			},
		});

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "OK",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			this.onConfirm(
				titleInput.value.trim() || this.defaultTitle,
				thumbnailUrl,
			);
			this.close();
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}

export class GalleryDashboardView extends ItemView {
	plugin: GalleryViewPlugin;
	public currentPath: string = "";
	private historyStack: string[] = [];
	private metadataEventRef: EventRef | null = null;

	private draggedItemPath: string | null = null;
	private indicatorEl: HTMLElement | null = null;
	private currentTargetName: string | null = null;
	private insertAfterTarget: boolean = false;

	private isDragLocked: boolean = true;
	private searchQuery: string = "";
	private isAddMenuOpen: boolean = false;
	private shouldAnimate: boolean = true;
	private pendingBanners: Map<string, string> = new Map();

	private resolveBannerSrc(
		raw: string | undefined | null,
		sourcePath = this.currentPath,
	): string {
		const value = (raw ?? "").trim();
		if (!value) return "";

		if (/^(https?:|data:|app:)/i.test(value)) return value;

		let vaultPath = value;
		const wikiMatch = value.match(/^!?(?:\[\[([^|\]]+)(?:\|[^\]]+)?\]\])$/);
		if (wikiMatch?.[1]) vaultPath = wikiMatch[1];

		vaultPath = normalizePath(vaultPath.replace(/^\/+/, "").split("#")[0] ?? "");

		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
			vaultPath,
			sourcePath,
		);
		if (linkedFile instanceof TFile) {
			return this.app.vault.adapter.getResourcePath(linkedFile.path);
		}

		const directFile = this.app.vault.getAbstractFileByPath(vaultPath);
		if (directFile instanceof TFile) {
			return this.app.vault.adapter.getResourcePath(directFile.path);
		}

		return value;
	}

	constructor(leaf: WorkspaceLeaf, plugin: GalleryViewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentPath =
			this.plugin.settings.lastOpenPath ||
			this.plugin.settings.rootSearchPath ||
			"";
		this.rebuildHistoryStack();
	}

	getViewType(): string {
		return VIEW_TYPE_GALLERY;
	}
	getDisplayText(): string {
		return "Library Gallery";
	}

	getState(): Record<string, unknown> {
		return {
			currentPath: this.currentPath,
			historyStack: this.historyStack,
		};
	}

	async setState(state: unknown, result: ViewStateResult) {
		const typedState = state as Record<string, unknown> | null;
		if (typedState && typeof typedState.currentPath === "string") {
			this.currentPath = typedState.currentPath;
			this.historyStack = Array.isArray(typedState.historyStack)
				? (typedState.historyStack as string[])
				: [];
		} else {
			this.rebuildHistoryStack();
		}
		await this.renderCanvas();
		return super.setState(state, result);
	}

	private getActiveFolderSize(): number {
		const activeKey = this.currentPath || "root";
		const settings = this.plugin.settings;
		if (!settings.folderCardSizes) {
			settings.folderCardSizes = {};
		}
		return settings.folderCardSizes[activeKey] || 200;
	}

	private updateCardCheckbox(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		const hasCheckbox =
			cache?.frontmatter && "checkbox" in cache.frontmatter;

		if (!hasCheckbox) return;

		const checkboxValue = Boolean(cache?.frontmatter?.checkbox);

		// Find the card for this file
		const cards = this.contentEl.querySelectorAll(".gallery-view-card");
		cards.forEach((card) => {
			const cardElement = card as HTMLElement & { itemName?: string };
			if (cardElement.itemName === file.name) {
				// Find the checkbox in this card
				const checkbox = cardElement.querySelector(
					'input[type="checkbox"]',
				) as HTMLInputElement;
				if (checkbox) {
					// Only update if the state is different
					if (checkbox.checked !== checkboxValue) {
						checkbox.checked = checkboxValue;

						// Add a subtle animation
						checkbox.setCssProps({ transform: "scale(1.3)" });
						window.setTimeout(() => {
							checkbox.setCssProps({ transform: "scale(1)" });
						}, 150);
					}
				}
			}
		});
	}

	private rebuildHistoryStack() {
		const rootPath: string = this.plugin.settings.rootSearchPath || "";
		this.historyStack = [];
		if (this.currentPath === rootPath || !this.currentPath) return;
		if (rootPath && !this.currentPath.startsWith(rootPath)) return;

		const segments = this.currentPath.split("/").filter(Boolean);
		const rootSegments = rootPath
			? rootPath.split("/").filter(Boolean)
			: [];
		this.historyStack.push(rootPath);

		let accumulatedPath: string = rootPath;
		for (let i = rootSegments.length; i < segments.length - 1; i++) {
			const currentSegment = segments[i];
			if (currentSegment !== undefined) {
				accumulatedPath = accumulatedPath
					? `${accumulatedPath}/${currentSegment}`
					: currentSegment;
				this.historyStack.push(accumulatedPath);
			}
		}
	}

	public async updateRootPath(newPath: string) {
		this.currentPath = newPath;
		this.historyStack = [];
		this.plugin.settings.lastOpenPath = newPath;
		await this.plugin.saveSettings();
		this.app.workspace.requestSaveLayout();
		await this.renderCanvas();
	}

	async onOpen() {
		if (!this.currentPath) {
			this.currentPath =
				this.plugin.settings.lastOpenPath ||
				this.plugin.settings.rootSearchPath ||
				"";
		}
		this.rebuildHistoryStack();
		await this.renderCanvas();

		this.metadataEventRef = this.app.metadataCache.on("changed", (file) => {
			void (async () => {
				if (
					file instanceof TFile &&
					(file.parent?.path || "") === (this.currentPath || "")
				) {
					// Full re-render without animations
					this.shouldAnimate = false;
					await this.renderCanvas();
					this.shouldAnimate = true;
				}
			})();
		});
		this.plugin.registerEvent(this.metadataEventRef);
	}

	async onClose() {
		this.cleanupDragIndicators();
		if (this.metadataEventRef) {
			this.app.metadataCache.offref(this.metadataEventRef);
			this.metadataEventRef = null;
		}
	}

	private generateUniquePath(baseName: string): string {
		const name = baseName || "Untitled Note";
		let targetPath = this.currentPath
			? `${this.currentPath}/${name}.md`
			: `${name}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(targetPath)) {
			targetPath = this.currentPath
				? `${this.currentPath}/${name} ${counter}.md`
				: `${name} ${counter}.md`;
			counter++;
		}
		return targetPath;
	}

	private generateUniqueFolderPath(baseName: string): string {
		const name = baseName || "New Folder";
		let folderPath = this.currentPath
			? `${this.currentPath}/${name}`
			: name;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(folderPath)) {
			folderPath = this.currentPath
				? `${this.currentPath}/${name} ${counter}`
				: `${name} ${counter}`;
			counter++;
		}
		return folderPath;
	}

	private cleanupDragIndicators() {
		this.draggedItemPath = null;
		this.currentTargetName = null;
		if (this.indicatorEl) {
			this.indicatorEl.remove();
			this.indicatorEl = null;
		}
		this.contentEl.querySelectorAll(".gallery-view-card").forEach((el) => {
			(el as HTMLElement).setCssProps({ opacity: "1" });
			el.removeClass("gallery-view-drop-target");
		});
	}

	private getFolderProgressMetrics(
		folder: TFolder,
	): { total: number; completed: number; percent: number } | null {
		let totalCheckboxes = 0;
		let completedCheckboxes = 0;

		const scan = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					const cache = this.app.metadataCache.getFileCache(child);
					const frontmatter = cache?.frontmatter;
					if (frontmatter) {
						const targetKey = Object.keys(frontmatter).find(
							(k) => k.toLowerCase() === "checkbox",
						);
						if (
							targetKey !== undefined &&
							frontmatter[targetKey] !== undefined
						) {
							totalCheckboxes++;
							if (
								frontmatter[targetKey] === true ||
								String(frontmatter[targetKey]).toLowerCase() ===
									"true"
							) {
								completedCheckboxes++;
							}
						}
					}
				} else if (child instanceof TFolder) {
					scan(child);
				}
			}
		};

		scan(folder);
		if (totalCheckboxes === 0) return null;
		return {
			total: totalCheckboxes,
			completed: completedCheckboxes,
			percent: Math.round((completedCheckboxes / totalCheckboxes) * 100),
		};
	}

	private async getYouTubeTitle(url: string): Promise<string | null> {
		try {
			const res = await requestUrl({
				url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
			});
			if (res.status === 200 && res.json) {
				return (res.json as { title: string }).title;
			}
		} catch {
			// Intentionally empty - return null on failure
		}
		return null;
	}

	private async getYouTubeDuration(url: string): Promise<string | null> {
		const apiKey = this.plugin.settings.youtubeApiKey;
		if (!apiKey) return null;

		const videoId = extractYouTubeVideoId(url);
		if (!videoId) return null;

		try {
			const res = await requestUrl({
				url: `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${apiKey}`,
			});
			if (res.status === 200 && res.json) {
				const data = res.json as {
					items: { contentDetails: { duration: string } }[];
				};
				const firstItem = data.items?.[0];
				if (firstItem?.contentDetails?.duration) {
					return this.parseISODuration(
						firstItem.contentDetails.duration,
					);
				}
			}
		} catch {
			// Silently fail — duration is optional
		}
		return null;
	}

	private parseISODuration(isoDuration: string): string {
		const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return "?";

		const hours = parseInt(match[1] ?? "0");
		const minutes = parseInt(match[2] ?? "0");
		const seconds = parseInt(match[3] ?? "0");

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		}
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	public async renderCanvas() {
		const container = this.contentEl;
		container.empty();
		container.addClass("gallery-view-canvas");

		const styleId = "gallery-view-fluid-responsive-styles";
		if (!window.activeDocument.getElementById(styleId)) {
			const styleEl = window.activeDocument.createElement("style");
			styleEl.id = styleId;
			styleEl.textContent = `
                .gallery-view-navigation-toolbar {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--background-modifier-border);
                    margin-bottom: 8px;
                    width: 100%;
                }
                .gallery-view-button-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    width: 100%;
                }
                .gallery-view-left-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .gallery-view-center-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    justify-content: center;
                    flex-grow: 1;
                }
                .gallery-view-right-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    justify-content: flex-end;
                    min-width: 260px;
                }
                .gallery-view-slider-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .gallery-view-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(var(--card-custom-size, 200px), 1fr));
                    gap: 16px;
                    padding: 16px;
                }
                @media (max-width: 768px) {
                    .gallery-view-button-row {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .gallery-view-center-group {
                        flex-direction: column;
                        align-items: stretch;
                        width: 100%;
                    }
                    .gallery-view-center-group input {
                        max-width: 100% !important;
                    }
                    .gallery-view-left-group, .gallery-view-right-group {
                        justify-content: space-between;
                        width: 100%;
                    }
                    .gallery-view-slider-row {
                        display: none !important;
                    }
                }
            `;
			window.activeDocument.head.appendChild(styleEl);
		}

		const activeSize = this.getActiveFolderSize();
		const toolbar = container.createDiv({
			cls: "gallery-view-navigation-toolbar",
		});

		const breadcrumbPath = this.currentPath || "Root Vault";
		toolbar
			.createDiv({
				cls: "gallery-view-breadcrumb",
				attr: {
					style: "font-family: var(--font-monospace), monospace; font-size: var(--font-ui-smaller, 0.85em); color: var(--text-muted); opacity: 0.6; letter-spacing: 0.5px; white-space: normal; word-break: break-word; width: 100%; line-height: 1.4;",
				},
			})
			.setText(`Browsing: ${breadcrumbPath}`);

		const buttonRow = toolbar.createDiv({ cls: "gallery-view-button-row" });

		// LEFT SIDE
		const leftGroup = buttonRow.createDiv({
			cls: "gallery-view-left-group",
		});
		const backBtn = leftGroup.createEl("button", {
			text: "← Back",
			cls: "gallery-view-back-btn mod-cta",
			attr: {
				style: "cursor: pointer; padding: 5px 12px; font-size: 0.85em; font-weight: 500; border-radius: 4px;",
			},
		});

		if (this.historyStack.length === 0) {
			backBtn.setAttribute("disabled", "true");
			backBtn.setCssProps({
				opacity: "0.4",
				cursor: "not-allowed",
			});
		} else {
			backBtn.addEventListener("click", () => {
				void (async () => {
					const previousPath = this.historyStack.pop();
					if (previousPath !== undefined) {
						this.currentPath = previousPath;
						this.plugin.settings.lastOpenPath = previousPath;
						await this.plugin.saveSettings();
						this.app.workspace.requestSaveLayout();
						await this.renderCanvas();
					}
				})();
			});
		}

		const grid = container.createDiv({
			cls: `gallery-view-grid${this.shouldAnimate ? " fresh-load" : ""}`,
			attr: { style: `--card-custom-size: ${activeSize}px;` },
		});

		// CENTER CONTROLS
		const centerGroup = buttonRow.createDiv({
			cls: "gallery-view-center-group",
		});
		const searchInput = centerGroup.createEl("input", {
			type: "text",
			placeholder: "Search files by name...",
			value: this.searchQuery,
			attr: {
				style: "width: 100%; max-width: 220px; padding: 4px 8px; font-size: 0.85em;",
			},
		});
		searchInput.addEventListener("input", (e) => {
			void (async () => {
				this.searchQuery = (
					e.target as HTMLInputElement
				).value.toLowerCase();
				await this.renderItemsGrid(grid);
			})();
		});

		const actionGroupWrapper = centerGroup.createDiv({
			attr: { style: "position: relative;" },
		});
		const addDropdownToggleBtn = actionGroupWrapper.createEl("button", {
			text: "Add +",
			cls: "mod-cta gallery-view-add-btn",
			attr: { style: "padding: 5px 12px; font-size: 0.85em;" },
		});
		const popoverMenuEl = actionGroupWrapper.createDiv({
			attr: {
				style: `display: none; position: absolute; top: 100%; left: 0; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 6px; flex-direction: column; gap: 4px; z-index: 999; min-width: 165px;`,
			},
		});

		addDropdownToggleBtn.addEventListener("click", (e: MouseEvent) => {
			e.stopPropagation();
			this.isAddMenuOpen = !this.isAddMenuOpen;
			popoverMenuEl.setCssProps({
				display: this.isAddMenuOpen ? "flex" : "none",
			});
		});

		const createNoteOpt = popoverMenuEl.createDiv({
			text: "📝 New Note",
			cls: "gallery-popover-menu-item",
		});
		createNoteOpt.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.isAddMenuOpen = false;
			popoverMenuEl.setCssProps({ display: "none" });
			new CreateNoteModal(this.app, (name) => {
				void (async () => {
					const uniquePath = this.generateUniquePath(name);

					let fileContents = "";
					if (this.plugin.settings.addPropertiesOnCreate) {
						fileContents = `---\ncreated: ${new Date().toISOString().split("T")[0]}\n---\n\n`;
					} else {
						fileContents = `\n`;
					}

					await this.app.vault.create(uniquePath, fileContents);

					// Force metadata cache to update
					const file =
						this.app.vault.getAbstractFileByPath(uniquePath);
					if (file instanceof TFile) {
						this.app.metadataCache.getFileCache(file);
					}

					// Small delay to ensure cache is ready
					await new Promise((resolve) =>
						window.setTimeout(resolve, 50),
					);

					await this.renderCanvas();
				})();
			}).open();
		});

		const createFolderOpt = popoverMenuEl.createDiv({
			text: "📁 New Folder",
			cls: "gallery-popover-menu-item",
		});
		// Find the createFolderOpt event listener and replace the folder creation logic:

		createFolderOpt.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.isAddMenuOpen = false;
			popoverMenuEl.setCssProps({ display: "none" });

			new CreateFolderModal(this.app, (folderName) => {
				if (!folderName) return;
				void (async () => {
					// Use the new method to get a unique folder path
					const folderPath =
						this.generateUniqueFolderPath(folderName);
					await this.app.vault.createFolder(folderPath);
					await this.renderCanvas();
				})();
			}).open();
		});
		const importYoutubeOpt = popoverMenuEl.createDiv({
			text: "🎬 Import YouTube",
			cls: "gallery-popover-menu-item",
		});
		importYoutubeOpt.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.isAddMenuOpen = false;
			popoverMenuEl.setCssProps({ display: "none" });
			new YouTubeUrlPromptModal(this.app, (url) => {
				const vid = extractYouTubeVideoId(url);
				if (!vid) return;
				void this.getYouTubeTitle(url).then((title) => {
					const finalT = title || "YouTube " + Date.now();
					new YouTubeConfirmModal(
						this.app,
						url,
						vid,
						finalT,
						(fTitle, thumb) => {
							void (async () => {
								const uniquePath =
									this.generateUniquePath(fTitle);

								// Fetch duration if API key is available
								const duration =
									await this.getYouTubeDuration(url);

								const iframeEmbed = `<iframe title="${fTitle.replace(/"/g, "&quot;")}" src="https://www.youtube.com/embed/${vid}?feature=oembed" height="113" width="200" allowfullscreen="" allow="fullscreen" style="aspect-ratio: 1.76991 / 1; width: 100%; height: 100%;"></iframe>`;

								let frontmatterLines = `banner: "${thumb}"`;
								if (duration) {
									frontmatterLines += `\nduration: "${duration}"`;
								}
								if (
									this.plugin.settings.addPropertiesOnCreate
								) {
									frontmatterLines += `\ncreated: ${new Date().toISOString().split("T")[0]}`;
								}

								const fileContents = `---\n${frontmatterLines}\n---\n\n${iframeEmbed}\n`;

								const newFile = await this.app.vault.create(
									uniquePath,
									fileContents,
								);

								// Wait for the metadata cache to have the banner
								let attempts = 0;
								while (attempts < 20) {
									const cache =
										this.app.metadataCache.getFileCache(
											newFile,
										);
									if (
										cache?.frontmatter &&
										cache.frontmatter.banner
									) {
										break;
									}
									await new Promise((resolve) =>
										window.setTimeout(resolve, 150),
									);
									attempts++;
								}

								await this.renderCanvas();
							})();
						},
					).open();
				});
			}).open();
		});
		// RIGHT CONTROLS
		const activeMethodKey = this.currentPath || "root";
		const currentSortMethod =
			this.plugin.settings.folderSortMethods[activeMethodKey] ||
			"alphabetical";
		const rightGroup = buttonRow.createDiv({
			cls: "gallery-view-right-group",
		});

		const sortSelect = rightGroup.createEl("select", {
			cls: "dropdown",
			attr: {
				style: "padding: 4px 8px; font-size: 0.85em; cursor: pointer; border-radius: 4px; flex-grow: 1; max-width: 170px;",
			},
		});
		const methods: { value: SortMethod; label: string }[] = [
			{ value: "alphabetical", label: "🔤 Alphabetical" },
			{ value: "properties", label: "🏷️ Properties (Tags)" },
			{ value: "manual", label: "🎯 Manual Reorder" },
		];
		methods.forEach((m) => {
			const opt = sortSelect.createEl("option", {
				text: m.label,
				value: m.value,
			});
			if (m.value === currentSortMethod) opt.selected = true;
		});
		sortSelect.addEventListener("change", () => {
			void (async () => {
				this.plugin.settings.folderSortMethods[activeMethodKey] =
					sortSelect.value as SortMethod;
				await this.plugin.saveSettings();
				await this.renderCanvas();
			})();
		});

		if (currentSortMethod === "manual") {
			const lockBtn = rightGroup.createEl("button", {
				cls: "clickable-icon gallery-view-lock-btn",
				attr: {
					style: `display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 4px; cursor: pointer; background: ${this.isDragLocked ? "var(--background-secondary-alt)" : "var(--interactive-accent)"}; color: ${this.isDragLocked ? "var(--text-muted)" : "var(--text-on-accent)"}; border: 1px solid var(--background-modifier-border); transition: all 0.2s ease-in-out;`,
					title: this.isDragLocked
						? "Manual sorting is Locked"
						: "Manual sorting is Unlocked",
				},
			});
			setIcon(lockBtn, this.isDragLocked ? "lock" : "unlock");
			lockBtn.addEventListener("click", (e) => {
				void (async () => {
					e.stopPropagation();
					this.isDragLocked = !this.isDragLocked;
					await this.renderCanvas();
				})();
			});
		}

		const sliderConfigRow = rightGroup.createDiv({
			cls: "gallery-view-slider-row",
		});
		sliderConfigRow.createSpan({
			text: "Size:",
			attr: { style: "font-size: 0.75em; color: var(--text-muted);" },
		});
		const sizeSlider = sliderConfigRow.createEl("input", {
			type: "range",
			attr: {
				min: "130",
				max: "420",
				value: activeSize.toString(),
				style: "cursor: pointer; width: 90px;",
			},
		});

		sizeSlider.addEventListener("input", (e) => {
			const val = (e.target as HTMLInputElement).value;
			grid.style.setProperty("--card-custom-size", `${val}px`);
		});

		sizeSlider.addEventListener("change", (e) => {
			void (async () => {
				const val = parseInt((e.target as HTMLInputElement).value, 10);
				const settings = this.plugin.settings;
				if (!settings.folderCardSizes) settings.folderCardSizes = {};
				settings.folderCardSizes[activeMethodKey] = val;
				await this.plugin.saveSettings();
			})();
		});

		grid.addEventListener("dragleave", (e: DragEvent) => {
			const rect = grid.getBoundingClientRect();
			if (
				e.clientX < rect.left ||
				e.clientX >= rect.right ||
				e.clientY < rect.top ||
				e.clientY >= rect.bottom
			) {
				if (this.indicatorEl)
					this.indicatorEl.setCssProps({ display: "none" });
				this.currentTargetName = null;
			}
		});

		await this.renderItemsGrid(grid);
	}

	// UPDATED: Added grid.empty() and grid.removeClass("fresh-load") at the beginning
	private async renderItemsGrid(grid: HTMLDivElement) {
		grid.empty();

		const activeMethodKey = this.currentPath || "root";
		const currentSortMethod =
			this.plugin.settings.folderSortMethods[activeMethodKey] ||
			"alphabetical";

		let rootFolder: TAbstractFile | null =
			this.currentPath.trim() === ""
				? this.app.vault.getRoot()
				: this.app.vault.getAbstractFileByPath(this.currentPath);

		if (rootFolder instanceof TFolder) {
			let validItems = rootFolder.children.filter(
				(item) =>
					item instanceof TFolder ||
					(item instanceof TFile &&
						(item.extension === "md" || item.extension === "pdf")),
			);

			if (this.searchQuery) {
				validItems = validItems.filter((item) =>
					item.name.toLowerCase().includes(this.searchQuery),
				);
			}

			// Apply sorting logic
			if (currentSortMethod === "alphabetical") {
				validItems.sort((a, b) =>
					a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					}),
				);
			} else if (currentSortMethod === "properties") {
				validItems.sort((a, b) => {
					const tagA =
						a instanceof TFile
							? ((
									this.app.metadataCache.getFileCache(a)
										?.frontmatter?.tags as
										| string[]
										| undefined
								)?.[0] ?? "")
							: "";
					const tagB =
						b instanceof TFile
							? ((
									this.app.metadataCache.getFileCache(b)
										?.frontmatter?.tags as
										| string[]
										| undefined
								)?.[0] ?? "")
							: "";
					return (
						tagA.localeCompare(tagB, undefined, {
							sensitivity: "base",
						}) ||
						a.name.localeCompare(b.name, undefined, {
							numeric: true,
							sensitivity: "base",
						})
					);
				});
			} else if (currentSortMethod === "manual") {
				let savedOrder =
					this.plugin.settings.folderManualOrders[activeMethodKey];
				if (!savedOrder || !Array.isArray(savedOrder)) {
					validItems.sort((a, b) =>
						a.name.localeCompare(b.name, undefined, {
							numeric: true,
							sensitivity: "base",
						}),
					);
					savedOrder = validItems.map((item) => item.name);
					this.plugin.settings.folderManualOrders[activeMethodKey] =
						savedOrder;
					await this.plugin.saveSettings();
				}
				const finalOrder: string[] = savedOrder;
				validItems.sort((a, b) => {
					const idxA = finalOrder.indexOf(a.name);
					const idxB = finalOrder.indexOf(b.name);
					if (idxA !== -1 && idxB !== -1) return idxA - idxB;
					if (idxA !== -1) return -1;
					if (idxB !== -1) return 1;
					return a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					});
				});
			}

			if (validItems.length === 0) {
				grid.createDiv({
					cls: "gallery-view-empty-msg",
					text: "This folder contains no library assets.",
				});
			} else {
				for (let i = 0; i < validItems.length; i++) {
					const item = validItems[i];
					if (!item) continue;
					const card = await this.renderCard(
						grid,
						item,
						item instanceof TFolder,
						currentSortMethod === "manual",
					);

					// Control animation based on shouldAnimate flag
					if (card) {
						if (this.shouldAnimate) {
							card.setCssProps({
								animation: `cardAppear 0.5s ease-out backwards`,
								animationDelay: `${i * 0.05}s`,
							});
						} else {
							card.setCssProps({ animation: "none" });
						}
					}
				}
			}
		}
	}

	private async renderCard(
		grid: HTMLElement,
		item: TAbstractFile,
		isFolder: boolean,
		isManualSort: boolean,
	): Promise<HTMLElement> {
		const card = grid.createDiv({
			cls: "gallery-view-card",
		}) as HTMLElement & { itemName?: string };
		card.itemName = item.name;

		if (isManualSort && !this.isDragLocked) {
			card.setAttribute("draggable", "true");
			card.setCssProps({ cursor: "grab" });

			card.addEventListener("dragstart", (e) => {
				this.draggedItemPath = item.name;
				card.setCssProps({ opacity: "0.3" });
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", item.name);
				}
			});

			card.addEventListener("dragend", () => {
				this.cleanupDragIndicators();
			});

			if (isManualSort && !this.isDragLocked) {
				card.setAttribute("draggable", "true");
				card.setCssProps({ cursor: "grab" });

				card.addEventListener("dragstart", (e) => {
					this.draggedItemPath = item.name;
					card.setCssProps({ opacity: "0.3" });
					if (e.dataTransfer) {
						e.dataTransfer.effectAllowed = "move";
						e.dataTransfer.setData("text/plain", item.name);
					}
				});

				card.addEventListener("dragend", () => {
					this.cleanupDragIndicators();
				});

				card.addEventListener("dragover", (e: DragEvent) => {
					e.preventDefault();
					if (
						!this.draggedItemPath ||
						this.draggedItemPath === item.name
					)
						return;

					if (!this.indicatorEl) {
						this.indicatorEl = grid.createDiv({
							cls: "gallery-view-drop-indicator",
						});
					}

					const cardRect = card.getBoundingClientRect();
					const gridRect = grid.getBoundingClientRect();
					const relativeMouseX = e.clientX - cardRect.left;
					this.insertAfterTarget =
						relativeMouseX > cardRect.width / 2;
					this.currentTargetName = item.name;

					const indicatorTop = cardRect.top - gridRect.top;
					const indicatorHeight = cardRect.height;
					let indicatorLeft = cardRect.left - gridRect.left;

					if (this.insertAfterTarget) {
						indicatorLeft += cardRect.width + 8;
					} else {
						indicatorLeft -= 10;
					}

					this.indicatorEl.setCssProps({
						top: `${indicatorTop}px`,
						height: `${indicatorHeight}px`,
						left: `${indicatorLeft}px`,
						display: "block",
					});
				});

				card.addEventListener("dragleave", () => {
					card.removeClass("gallery-view-drop-target");
				});

				card.addEventListener("drop", (e) => {
					void (async () => {
						e.preventDefault();
						const sourceName =
							this.draggedItemPath ||
							(e.dataTransfer
								? e.dataTransfer.getData("text/plain")
								: null);
						const targetName = this.currentTargetName;

						this.cleanupDragIndicators();
						if (
							!sourceName ||
							!targetName ||
							sourceName === targetName
						)
							return;

						const activeMethodKey = this.currentPath || "root";

						const itemsList = Array.from(grid.children)
							.map(
								(el) =>
									(el as HTMLElement & { itemName?: string })
										.itemName,
							)
							.filter(Boolean) as string[];

						const currentSavedOrder = this.plugin.settings
							.folderManualOrders[activeMethodKey] || [
							...itemsList,
						];
						const sourceIndex =
							currentSavedOrder.indexOf(sourceName);
						if (sourceIndex !== -1)
							currentSavedOrder.splice(sourceIndex, 1);

						let targetIndex = currentSavedOrder.indexOf(targetName);
						if (this.insertAfterTarget) targetIndex += 1;

						if (targetIndex !== -1) {
							currentSavedOrder.splice(
								targetIndex,
								0,
								sourceName,
							);
							this.plugin.settings.folderManualOrders[
								activeMethodKey
							] = currentSavedOrder;
							await this.plugin.saveSettings();

							this.shouldAnimate = false;
							await this.renderCanvas();
							this.shouldAnimate = true;
						}
					})();
				});
			} else {
				card.setAttribute("draggable", "false");
				card.setCssProps({ cursor: "pointer" });
			}
		} else {
			card.setAttribute("draggable", "false");
			card.setCssProps({ cursor: "pointer" });
		}

		const bannerContainer = card.createDiv({
			cls: "gallery-view-card-banner-wrap",
		});
		const infoSection = card.createDiv({ cls: "gallery-view-card-info" });
		const imgFitRule = this.plugin.settings.bannerFit || "cover";

		let usableName = item.name;
		if (!isFolder && item instanceof TFile) {
			usableName = item.basename;
		}

		const titleRow = infoSection.createDiv({
			attr: {
				style: "display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;",
			},
		});
		titleRow
			.createDiv({ cls: "gallery-view-card-title" })
			.setText(usableName);

		card.addEventListener("contextmenu", (e: MouseEvent) => {
			e.preventDefault();
			const fileMenu = new Menu();

			fileMenu.addItem((menuItem) => {
				menuItem
					.setTitle("Rename Asset")
					.setIcon("pencil")
					.onClick(() => {
						new RenameModal(this.app, item, () => {
							void this.renderCanvas();
						}).open();
					});
			});

			fileMenu.addItem((menuItem) => {
				menuItem
					.setTitle("Delete Asset")
					.setIcon("trash")
					.onClick(() => {
						void (async () => {
							await this.app.fileManager.trashFile(item);
							await this.renderCanvas();
						})();
					});
			});

			fileMenu.addSeparator();
			this.app.workspace.trigger(
				"file-menu",
				fileMenu,
				item,
				"gallery-context-menu",
			);
			fileMenu.showAtPosition({ x: e.clientX, y: e.clientY });
		});

		if (isFolder) {
			card.addClass("is-folder-father");
			const folderMeta = this.plugin.settings.folderOverrides[item.path];
			const bannerUrl =
				folderMeta?.bannerUrl ||
				this.plugin.settings.defaultFolderBanner;

			const bannerSrc = this.resolveBannerSrc(
				bannerUrl,
				item.parent?.path ?? this.currentPath,
			);

			bannerContainer.createEl("img", {
				attr: { src: bannerSrc, style: `object-fit: ${imgFitRule};` },
				cls: "gallery-view-banner-img",
			});

			// Add YouTube class for cropping
			if (
				bannerUrl &&
				(bannerUrl.includes("youtube.com") ||
					bannerUrl.includes("youtu.be") ||
					bannerUrl.includes("img.youtube.com"))
			) {
				bannerContainer.addClass("is-youtube-banner");
			}

			if (item instanceof TFolder) {
				const childCount = item.children.length;
				infoSection
					.createDiv({ cls: "gallery-view-card-meta" })
					.setText(
						`${childCount} item${childCount === 1 ? "" : "s"} inside`,
					);

				if (this.plugin.settings.showFolderProgress) {
					const metrics = this.getFolderProgressMetrics(item);
					if (metrics !== null) {
						const progressContainer = infoSection.createDiv({
							attr: {
								style: "width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;",
							},
						});
						const labelRow = progressContainer.createDiv({
							attr: {
								style: "display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-muted);",
							},
						});
						labelRow
							.createDiv()
							.setText(
								`Progress: ${metrics.completed}/${metrics.total}`,
							);
						labelRow.createDiv().setText(`${metrics.percent}%`);

						const barTrack = progressContainer.createDiv({
							attr: {
								style: "width: 100%; background: var(--background-modifier-border); border-radius: 4px; height: 5px; overflow: hidden;",
							},
						});
						barTrack.createDiv({
							attr: {
								style: `width: ${metrics.percent}%; background: var(--interactive-accent); height: 100%; border-radius: 4px; transition: width 0.25s ease-in-out;`,
							},
						});
					}
				}
			}

			card.addEventListener("click", () => {
				void (async () => {
					this.historyStack.push(this.currentPath);
					this.currentPath = item.path;
					this.plugin.settings.lastOpenPath = item.path;
					await this.plugin.saveSettings();
					this.app.workspace.requestSaveLayout();
					await this.renderCanvas();
				})();
			});
		} else if (item instanceof TFile) {
			card.addClass("is-file-child");
			const isPdf = item.extension === "pdf";

			let bannerUrl = isPdf
				? this.plugin.settings.defaultPdfBanner ||
					this.plugin.settings.defaultFileBanner
				: this.plugin.settings.defaultFileBanner;
			const frontmatter: Record<string, unknown> = {};
			if (!isPdf) {
				const fileCache = this.app.metadataCache.getFileCache(item);
				const cachedFrontmatter = fileCache?.frontmatter || {};
				Object.assign(frontmatter, cachedFrontmatter);
				bannerUrl =
					(frontmatter.banner as string) ||
					this.plugin.settings.defaultFileBanner;
			}

			const bannerSrc = this.resolveBannerSrc(
				bannerUrl,
				item.parent?.path ?? this.currentPath,
			);

			bannerContainer.createEl("img", {
				attr: { src: bannerSrc, style: `object-fit: ${imgFitRule};` },
				cls: "gallery-view-banner-img",
			});
			const metaContainer = infoSection.createDiv({
				cls: "gallery-view-card-meta",
			});

			if (isPdf) {
				const pdfBadge = metaContainer.createDiv({
					attr: {
						style: "background-color: var(--text-error); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; font-weight: bold; text-transform: uppercase;",
					},
				});
				pdfBadge.setText("PDF");
			} else {
				this.plugin.settings.visibleProperties.forEach((propKey) => {
					if (
						frontmatter[propKey] !== undefined &&
						propKey !== "checkbox"
					) {
						const badge = metaContainer.createDiv({
							cls: "gallery-view-property-badge",
						});
						badge.setText(
							`${propKey}: ${String(frontmatter[propKey])}`,
						);
					}
					// Duration badge (for YouTube imports)
					if (frontmatter.duration && !isPdf) {
						const durationBadge = metaContainer.createDiv({
							cls: "gallery-view-property-badge gallery-view-duration-badge",
						});
						durationBadge.setText(`⏱ ${frontmatter.duration}`);
					}
				});
			}

			if (this.plugin.settings.showCheckboxes && !isPdf) {
				const hasCheckboxProperty =
					Object.prototype.hasOwnProperty.call(
						frontmatter,
						"checkbox",
					);
				if (hasCheckboxProperty) {
					const checkboxWrapper = infoSection.createDiv({
						attr: {
							style: "display: flex; align-items: center; margin-top: 2px; width: fit-content;",
						},
					});
					const checkbox = checkboxWrapper.createEl("input", {
						type: "checkbox",
						attr: {
							style: "cursor: pointer; width: 16px; height: 16px; margin: 0;",
						},
					});
					checkbox.checked = Boolean(frontmatter["checkbox"]);

					checkbox.addEventListener("click", (e) => {
						void (async () => {
							e.stopPropagation();
							e.preventDefault(); // Add this to prevent any default behavior

							const targetValue = checkbox.checked;

							// Prevent the card animation from re-triggering
							const card = checkbox.closest(
								".gallery-view-card",
							) as HTMLElement;
							if (card) {
								card.setCssProps({ animation: "none" });
								void card.offsetHeight; // Force reflow
								card.setCssProps({ animation: "" });
							}

							await this.app.fileManager.processFrontMatter(
								item,
								(fm: Record<string, unknown>) => {
									fm["checkbox"] = targetValue;
								},
							);

							// Don't re-render the entire canvas, just update the UI if needed
							// The checkbox state is already visually updated by the click
						})();
					});
				}
			}

			card.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(item);
			});
		}
		return card;
	}
}

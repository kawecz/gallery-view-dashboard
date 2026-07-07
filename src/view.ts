import {
	ItemView,
	WorkspaceLeaf,
	TAbstractFile,
	TFolder,
	TFile,
	EventRef,
	setIcon,
	Menu,
	ViewStateResult,
} from "obsidian";
import GalleryViewPlugin from "./main";
import { SortMethod } from "./types";
import { CreateNoteModal, type PropertyEntry } from "./modals/create-note";
import { CreateFolderModal } from "./modals/create-folder";
import { RenameModal } from "./modals/rename";
import { YouTubeUrlPromptModal, YouTubeConfirmModal } from "./modals/youtube";
import { GoogleBookModal } from "./modals/google-book";
import { SteamGameModal } from "./modals/steam-game";
import { MovieModal } from "./modals/movie";
import { extractYouTubeVideoId, getYouTubeTitle } from "./importers/youtube";

export const VIEW_TYPE_GALLERY = "gallery-view-dashboard";

// Helper: simple string hash for deterministic tag colors
function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return Math.abs(hash);
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

		// Create popover on the container (canvas) instead of the button wrapper
		const popoverMenuEl = container.createDiv({
			attr: {
				style: "display: none; position: fixed; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px; flex-direction: column; gap: 4px; z-index: 9999; min-width: 175px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);",
			},
		});

		// Position the popover relative to the button
		addDropdownToggleBtn.addEventListener("click", (e: MouseEvent) => {
			e.stopPropagation();
			this.isAddMenuOpen = !this.isAddMenuOpen;

			if (this.isAddMenuOpen) {
				const btnRect = addDropdownToggleBtn.getBoundingClientRect();
				popoverMenuEl.setCssProps({
					display: "flex",
					top: `${btnRect.bottom + 4}px`,
					left: `${btnRect.left}px`,
				});
			} else {
				popoverMenuEl.setCssProps({ display: "none" });
			}
		});

		// Add menu items
		this.createPopoverMenuItem(popoverMenuEl, "📝 New Note", () => {
			void this.openCreateNoteModal();
		});

		this.createPopoverMenuItem(popoverMenuEl, "📁 New Folder", () => {
			this.openCreateFolderModal();
		});

		if (this.plugin.settings.showYouTubeImport) {
			this.createPopoverMenuItem(
				popoverMenuEl,
				"🎬 Import YouTube",
				() => {
					this.openYouTubeImport();
				},
			);
		}

		if (
			this.plugin.settings.showMovieImport &&
			this.plugin.settings.tmdbApiKey
		) {
			this.createPopoverMenuItem(popoverMenuEl, "🎬 Import Movie", () => {
				const currentPath = this.currentPath || "";
				new MovieModal(
					this.app,
					this.plugin.settings.tmdbApiKey || "",
					(movie) => {
						void this.plugin.createMovieNote(movie, currentPath);
						window.setTimeout(() => void this.renderCanvas(), 300);
					},
				).open();
			});
		}

		if (
			this.plugin.settings.showBookImport &&
			this.plugin.settings.googleBooksApiKey
		) {
			this.createPopoverMenuItem(popoverMenuEl, "📚 Import Book", () => {
				const currentPath = this.currentPath || "";
				new GoogleBookModal(
					this.app,
					this.plugin.settings.googleBooksApiKey || "",
					(book) => {
						void this.plugin.createBookNote(book, currentPath);
						window.setTimeout(() => void this.renderCanvas(), 300);
					},
				).open();
			});
		}

		if (this.plugin.settings.showGameImport) {
			this.createPopoverMenuItem(popoverMenuEl, "🎮 Import Game", () => {
				const currentPath = this.currentPath || "";
				new SteamGameModal(this.app, (game) => {
					void this.plugin.createGameNote(game, currentPath);
					window.setTimeout(() => void this.renderCanvas(), 300);
				}).open();
			});
		}

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
			{ value: "checkbox", label: "✅ Checkbox" },
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

		grid.addEventListener("contextmenu", (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest(".gallery-view-card")) return;
			e.preventDefault();
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("📝 New Note")
					.setIcon("file-plus")
					.onClick(() => void this.openCreateNoteModal());
			});

			menu.addItem((item) => {
				item.setTitle("📁 New Folder")
					.setIcon("folder-plus")
					.onClick(() => this.openCreateFolderModal());
			});

			menu.addSeparator();

			if (this.plugin.settings.showYouTubeImport) {
				menu.addItem((item) => {
					item.setTitle("🎬 Import YouTube")
						.setIcon("youtube")
						.onClick(() => this.openYouTubeImport());
				});
			}

			if (
				this.plugin.settings.showBookImport &&
				this.plugin.settings.googleBooksApiKey
			) {
				menu.addItem((item) => {
					item.setTitle("📚 Import Book")
						.setIcon("book")
						.onClick(() => {
							const currentPath = this.currentPath || "";
							new GoogleBookModal(
								this.app,
								this.plugin.settings.googleBooksApiKey || "",
								(book) => {
									void this.plugin.createBookNote(
										book,
										currentPath,
									);
									window.setTimeout(
										() => void this.renderCanvas(),
										300,
									);
								},
							).open();
						});
				});
			}

			if (this.plugin.settings.showGameImport) {
				menu.addItem((item) => {
					item.setTitle("🎮 Import Game")
						.setIcon("gamepad")
						.onClick(() => {
							const currentPath = this.currentPath || "";
							new SteamGameModal(this.app, (game) => {
								void this.plugin.createGameNote(
									game,
									currentPath,
								);
								window.setTimeout(
									() => void this.renderCanvas(),
									300,
								);
							}).open();
						});
				});
			}

			if (
				this.plugin.settings.showMovieImport &&
				this.plugin.settings.tmdbApiKey
			) {
				menu.addItem((item) => {
					item.setTitle("🎬 Import Movie")
						.setIcon("film")
						.onClick(() => {
							const currentPath = this.currentPath || "";
							new MovieModal(
								this.app,
								this.plugin.settings.tmdbApiKey || "",
								(movie) => {
									void this.plugin.createMovieNote(
										movie,
										currentPath,
									);
									window.setTimeout(
										() => void this.renderCanvas(),
										300,
									);
								},
							).open();
						});
				});
			}

			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});

		await this.renderItemsGrid(grid);
	}

	private createPopoverMenuItem(
		container: HTMLElement,
		label: string,
		onClick: () => void,
	) {
		const item = container.createDiv({
			text: label,
			cls: "gallery-popover-menu-item",
		});
		item.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.isAddMenuOpen = false;
			// Find the popover and hide it
			const popover = container.closest(
				'[style*="flex-direction: column"]',
			) as HTMLElement;
			if (popover) popover.setCssProps({ display: "none" });
			onClick();
		});
	}

	private async openCreateNoteModal() {
		const defaultProperties: PropertyEntry[] = [];
		const currentFolder = this.currentPath || "";

		if (this.plugin.settings.addPropertiesOnCreate) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr) {
				defaultProperties.push({ key: "created", value: dateStr });
			}
		}

		// Try to detect Folder Auto Properties rules — needs await
		const detectedProps =
			await this.detectFolderAutoProperties(currentFolder);
		detectedProps.forEach((prop) => {
			if (!defaultProperties.some((p) => p.key === prop.key)) {
				defaultProperties.push(prop);
			}
		});

		new CreateNoteModal(
			this.app,
			(title, properties) => {
				void (async () => {
					const uniquePath = this.generateUniquePath(title);
					const fmLines: string[] = [];
					properties.forEach((prop) => {
						fmLines.push(`${prop.key}: ${prop.value}`);
					});
					const fileContents =
						fmLines.length > 0
							? `---\n${fmLines.join("\n")}\n---\n\n`
							: `\n`;
					await this.app.vault.create(uniquePath, fileContents);
					const file =
						this.app.vault.getAbstractFileByPath(uniquePath);
					if (file instanceof TFile) {
						this.app.metadataCache.getFileCache(file);
					}
					await new Promise((resolve) =>
						window.setTimeout(resolve, 50),
					);
					await this.renderCanvas();
				})();
			},
			defaultProperties,
			currentFolder,
		).open();
	}

	/*
	 * Detects what properties Folder Auto Properties would add to a note
	 * in the given folder by reading its data.json settings.
	 */
	private async detectFolderAutoProperties(
		targetFolder: string,
	): Promise<PropertyEntry[]> {
		const properties: PropertyEntry[] = [];

		try {
			// Check if the plugin folder exists
			const configDir = this.app.vault.configDir;
			const pluginFolder = this.app.vault.getAbstractFileByPath(
				`${configDir}/plugins/folder-auto-properties`,
			);
			if (!(pluginFolder instanceof TFolder)) return properties;

			const dataFile = this.app.vault.getAbstractFileByPath(
				`${configDir}/plugins/folder-auto-properties/data.json`,
			);
			if (!(dataFile instanceof TFile)) return properties;

			// Use the cached read or read the file
			this.app.vault.read(dataFile).then((content) => {
				try {
					const settings = JSON.parse(content) as {
						rules?: {
							folder: string;
							properties: Record<string, unknown>;
						}[];
					};

					if (settings.rules && Array.isArray(settings.rules)) {
						// Find rules that match the target folder
						for (const rule of settings.rules) {
							// Check if targetFolder matches or is inside the rule's folder
							if (
								targetFolder === rule.folder ||
								targetFolder.startsWith(rule.folder + "/")
							) {
								if (rule.properties) {
									for (const [key, value] of Object.entries(
										rule.properties,
									)) {
										properties.push({
											key,
											value: String(value),
										});
									}
								}
							}
						}
					}
				} catch {
					// Invalid JSON
				}
			});
		} catch {
			// Plugin not found or can't read
		}

		return properties;
	}

	private openCreateFolderModal() {
		new CreateFolderModal(this.app, (folderName) => {
			if (!folderName) return;
			void (async () => {
				const folderPath = this.generateUniqueFolderPath(folderName);
				await this.app.vault.createFolder(folderPath);
				await this.renderCanvas();
			})();
		}).open();
	}

	private async openYouTubeImport() {
		const currentPath = this.currentPath || "";

		// Detect Folder Auto Properties rules for this folder
		const detectedProps =
			await this.plugin.detectFolderProperties(currentPath);

		new YouTubeUrlPromptModal(this.app, (url) => {
			const vid = extractYouTubeVideoId(url);
			if (!vid) return;
			void getYouTubeTitle(url).then((title) => {
				const finalT = title || "YouTube " + Date.now();

				// Pass only detected props — YouTubeConfirmModal will add banner/type/duration
				new YouTubeConfirmModal(
					this.app,
					url,
					vid,
					finalT,
					(fTitle, thumb) => {
						void this.plugin.createYouTubeNote(
							url,
							vid,
							fTitle,
							thumb,
							currentPath,
						);
						window.setTimeout(() => void this.renderCanvas(), 500);
					},
					detectedProps, // <-- just the detected props, no placeholders
					this.plugin.settings.youtubeApiKey || "",
					this.plugin.settings.addPropertiesOnCreate,
				).open();
			});
		}).open();
	}

	// UPDATED: renderItemsGrid with checkbox sort
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
			} else if (currentSortMethod === "checkbox") {
				validItems.sort((a, b) => {
					const getChecked = (item: TAbstractFile): number => {
						if (!(item instanceof TFile)) return 2; // folders in middle
						const cache = this.app.metadataCache.getFileCache(item);
						const fm = cache?.frontmatter;
						if (!fm) return 2;
						const checkboxVal = fm.checkbox;
						if (checkboxVal === undefined || checkboxVal === null)
							return 2;
						return checkboxVal === true ||
							String(checkboxVal).toLowerCase() === "true"
							? 0
							: 1;
					};
					const ca = getChecked(a);
					const cb = getChecked(b);
					if (ca !== cb) return ca - cb;
					return a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: "base",
					});
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

			card.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
				if (!this.draggedItemPath || this.draggedItemPath === item.name)
					return;

				if (!this.indicatorEl) {
					this.indicatorEl = grid.createDiv({
						cls: "gallery-view-drop-indicator",
					});
				}

				const cardRect = card.getBoundingClientRect();
				const gridRect = grid.getBoundingClientRect();
				const relativeMouseX = e.clientX - cardRect.left;
				this.insertAfterTarget = relativeMouseX > cardRect.width / 2;
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
					if (!sourceName || !targetName || sourceName === targetName)
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
						.folderManualOrders[activeMethodKey] || [...itemsList];
					const sourceIndex = currentSavedOrder.indexOf(sourceName);
					if (sourceIndex !== -1)
						currentSavedOrder.splice(sourceIndex, 1);

					let targetIndex = currentSavedOrder.indexOf(targetName);
					if (this.insertAfterTarget) targetIndex += 1;

					if (targetIndex !== -1) {
						currentSavedOrder.splice(targetIndex, 0, sourceName);
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

		// Context menu (right-click)
		// After creating the grid, add the right-click context menu:
		// ===== CARD CONTEXT MENU (right-click on individual card) =====
		// ===== CARD CONTEXT MENU (right-click on individual card) =====
		card.addEventListener("contextmenu", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
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

			bannerContainer.createEl("img", {
				attr: { src: bannerUrl, style: `object-fit: ${imgFitRule};` },
				cls: "gallery-view-banner-img",
			});

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
								style: `width: ${metrics.percent}%; background: var(--interactive-accent); height: 100%; border-radius: 4px;`,
							},
						});
					}
				}
			}

			// Folder card click - supports middle-click for new tab
			card.addEventListener("click", (e: MouseEvent) => {
				if (e.button === 1) {
					// Middle click - open in new tab
					e.preventDefault();
					void (async () => {
						const leaf = this.app.workspace.getLeaf("tab");
						await leaf.setViewState({
							type: VIEW_TYPE_GALLERY,
							active: true,
							state: {
								currentPath: item.path,
								historyStack: [
									...this.historyStack,
									this.currentPath,
								],
							},
						});
					})();
					return;
				}
				// Normal left click
				void (async () => {
					this.historyStack.push(this.currentPath);
					this.currentPath = item.path;
					this.plugin.settings.lastOpenPath = item.path;
					await this.plugin.saveSettings();
					this.app.workspace.requestSaveLayout();
					await this.renderCanvas();
				})();
			});

			// Auxclick fallback for middle-click
			card.addEventListener("auxclick", (e: MouseEvent) => {
				if (e.button === 1) {
					e.preventDefault();
					void (async () => {
						const leaf = this.app.workspace.getLeaf("tab");
						await leaf.setViewState({
							type: VIEW_TYPE_GALLERY,
							active: true,
							state: {
								currentPath: item.path,
								historyStack: [
									...this.historyStack,
									this.currentPath,
								],
							},
						});
					})();
				}
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

			bannerContainer.createEl("img", {
				attr: { src: bannerUrl, style: `object-fit: ${imgFitRule};` },
				cls: "gallery-view-banner-img",
			});

			// Type badge
			const typeVal = frontmatter.type as string | undefined;
			if (typeVal) {
				const typeBadge = bannerContainer.createDiv({
					cls: `gallery-view-type-badge type-${typeVal}`,
				});
				typeBadge.setText(typeVal);
			}

			const metaContainer = infoSection.createDiv({
				cls: "gallery-view-card-meta",
			});

			if (isPdf) {
				const pdfBadge = metaContainer.createDiv({
					cls: "gallery-view-card-pdf-badge",
				});
				const pdfIcon = pdfBadge.createSpan({
					cls: "gallery-view-pdf-icon",
				});
				pdfIcon.setText("📄");
				pdfBadge.createSpan({ text: "PDF Document" });
			} else {
				// Render tags as colorful pills
				const tagsValue = frontmatter.tags;
				if (tagsValue) {
					const tagArray: string[] = Array.isArray(tagsValue)
						? tagsValue
						: String(tagsValue)
								.split(",")
								.map((t) => t.trim());

					const tagsRow = metaContainer.createDiv({
						cls: "gallery-view-tags-row",
					});
					tagArray.forEach((tag) => {
						const colorIdx = hashString(tag) % 8;
						const pill = tagsRow.createDiv({
							cls: `gallery-view-tag-pill tag-color-${colorIdx}`,
						});
						pill.setText(`#${tag}`);
					});
				}

				// ---- Properties with icons ----
				const folderOverride =
					this.plugin.settings.folderOverrides[this.currentPath];
				const visibleProps =
					folderOverride?.visibleProperties ||
					this.plugin.settings.visibleProperties;

				// Filter out tags and checkbox (handled separately)
				const displayProps = visibleProps.filter(
					(p) => p !== "checkbox" && p !== "tags",
				);

				if (displayProps.length > 0 || frontmatter.duration) {
					const propsContainer = metaContainer.createDiv({
						cls: "gallery-view-props-container",
					});

					// Author / Director / Developer
					const authorKeys = [
						"author",
						"director",
						"developer",
						"writer",
						"publisher",
					];
					const authorKey = authorKeys.find(
						(k) => frontmatter[k] !== undefined,
					);
					if (authorKey && displayProps.includes(authorKey)) {
						const authorRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						authorRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "✍️",
						});
						authorRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-author",
							text: String(frontmatter[authorKey]),
						});
					}

					// Rating
					const ratingKeys = ["rating", "score", "metacritic"];
					const ratingKey = ratingKeys.find(
						(k) => frontmatter[k] !== undefined,
					);
					if (ratingKey && displayProps.includes(ratingKey)) {
						const ratingRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						ratingRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "⭐",
						});
						ratingRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-rating",
							text: String(frontmatter[ratingKey]),
						});
					}

					// Year / Release Date
					const yearKeys = ["year", "release_date", "created"];
					const yearKey = yearKeys.find(
						(k) => frontmatter[k] !== undefined,
					);
					if (yearKey && displayProps.includes(yearKey)) {
						const yearRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						yearRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "📅",
						});
						const yearVal = String(frontmatter[yearKey]);
						yearRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-year",
							text:
								yearVal.length > 10
									? yearVal.substring(0, 10)
									: yearVal,
						});
					}

					// Status
					const statusKeys = ["status", "todo", "state"];
					const statusKey = statusKeys.find(
						(k) => frontmatter[k] !== undefined,
					);
					if (statusKey && displayProps.includes(statusKey)) {
						const statusRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						statusRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "📌",
						});
						statusRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-status",
							text: String(frontmatter[statusKey]),
						});
					}

					// Genres
					const genreKeys = ["genres", "subjects", "category"];
					const genreKey = genreKeys.find(
						(k) => frontmatter[k] !== undefined,
					);
					if (genreKey && displayProps.includes(genreKey)) {
						const genreRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						genreRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "🎯",
						});
						genreRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-genres",
							text: String(frontmatter[genreKey]),
						});
					}

					// ISBN
					if (
						frontmatter.isbn !== undefined &&
						displayProps.includes("isbn")
					) {
						const isbnRow = propsContainer.createDiv({
							cls: "gallery-view-prop-row",
						});
						isbnRow.createSpan({
							cls: "gallery-view-prop-icon",
							text: "📖",
						});
						isbnRow.createSpan({
							cls: "gallery-view-prop-value gallery-view-prop-isbn",
							text: String(frontmatter.isbn),
						});
					}

					// Any remaining custom properties not matched above
					const handledKeys = [
						...authorKeys,
						...ratingKeys,
						...yearKeys,
						...statusKeys,
						...genreKeys,
						"isbn",
						"type",
						"banner",
						"duration",
						"steam_app_id",
						"tmdb_id",
					];
					displayProps.forEach((propKey) => {
						if (
							frontmatter[propKey] !== undefined &&
							!handledKeys.includes(propKey)
						) {
							const customRow = propsContainer.createDiv({
								cls: "gallery-view-prop-row",
							});
							customRow.createSpan({
								cls: "gallery-view-prop-icon",
								text: "🏷️",
							});
							customRow.createSpan({
								cls: "gallery-view-prop-label",
								text: `${propKey}: `,
							});
							customRow.createSpan({
								cls: "gallery-view-prop-value",
								text: String(frontmatter[propKey]),
							});
						}
					});
				}

				// Duration badge for YouTube
				if (frontmatter.duration && !isPdf) {
					const durationRow = metaContainer.createDiv({
						cls: "gallery-view-duration-row",
					});
					durationRow.createSpan({
						cls: "gallery-view-duration-icon",
						text: "⏱",
					});
					durationRow.createSpan({
						cls: "gallery-view-duration-text",
						text: String(frontmatter.duration),
					});
				}
			}

			// Enhanced checkbox
			if (this.plugin.settings.showCheckboxes && !isPdf) {
				const hasCheckboxProperty =
					Object.prototype.hasOwnProperty.call(
						frontmatter,
						"checkbox",
					);
				if (hasCheckboxProperty) {
					const isChecked = Boolean(frontmatter["checkbox"]);
					const checkboxWrapper = infoSection.createDiv({
						cls: "gallery-view-checkbox-wrapper",
					});

					const customCheckbox = checkboxWrapper.createDiv({
						cls: `gallery-view-custom-checkbox${isChecked ? " is-checked" : ""}`,
					});
					const checkboxLabel = checkboxWrapper.createSpan({
						text: isChecked ? "Completed" : "Pending",
						cls: "gallery-view-checkbox-label",
					});

					checkboxWrapper.addEventListener("click", (e) => {
						void (async () => {
							e.stopPropagation();
							const newValue =
								!customCheckbox.hasClass("is-checked");

							await this.app.fileManager.processFrontMatter(
								item,
								(fm: Record<string, unknown>) => {
									fm["checkbox"] = newValue;
								},
							);

							if (newValue) {
								customCheckbox.addClass("is-checked");
								checkboxLabel.setText("Completed");
							} else {
								customCheckbox.removeClass("is-checked");
								checkboxLabel.setText("Pending");
							}
						})();
					});
				}
			}

			// File card click - supports middle-click for new tab
			card.addEventListener("click", (e: MouseEvent) => {
				if (e.button === 1) {
					// Middle click - open in new tab
					e.preventDefault();
					void this.app.workspace.getLeaf("tab").openFile(item);
					return;
				}
				// Normal left click
				void this.app.workspace.getLeaf(false).openFile(item);
			});

			// Auxclick fallback for middle-click
			card.addEventListener("auxclick", (e: MouseEvent) => {
				if (e.button === 1) {
					e.preventDefault();
					void this.app.workspace.getLeaf("tab").openFile(item);
				}
			});
		}
		return card;
	}

	private getPropertyClass(propKey: string): string {
		const key = propKey.toLowerCase();
		if (key === "status" || key === "todo") return "prop-type-status";
		if (key === "author" || key === "director" || key === "developer")
			return "prop-type-author";
		if (key === "rating" || key === "score") return "prop-type-rating";
		if (key === "year" || key === "release_date") return "prop-type-year";
		return "";
	}
}

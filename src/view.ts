import { ItemView, WorkspaceLeaf, TAbstractFile, TFolder, TFile, EventRef, setIcon } from "obsidian";
import GalleryViewPlugin from "./main";
import { SortMethod } from "./types";

export const VIEW_TYPE_GALLERY = "gallery-view-dashboard";

export class GalleryDashboardView extends ItemView {
    plugin: GalleryViewPlugin;
    public currentPath: string = "";
    private historyStack: string[] = [];
    private metadataEventRef: EventRef | null = null;
    
    // Drag and Drop Trackers
    private draggedItemPath: string | null = null;
    private indicatorEl: HTMLElement | null = null;
    private currentTargetName: string | null = null;
    private insertAfterTarget: boolean = false;

    // Manual Reorder Lock State
    private isDragLocked: boolean = true;

    constructor(leaf: WorkspaceLeaf, plugin: GalleryViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentPath = this.plugin.settings.lastOpenPath || this.plugin.settings.rootSearchPath || "";
        this.rebuildHistoryStack();
    }

    getViewType(): string {
        return VIEW_TYPE_GALLERY;
    }

    getDisplayText(): string {
        return "Library Gallery";
    }

    getState() {
        return {
            currentPath: this.currentPath,
            historyStack: this.historyStack
        };
    }

    async setState(state: any, result: any) {
        if (state && typeof state.currentPath === "string") {
            this.currentPath = state.currentPath;
            this.historyStack = Array.isArray(state.historyStack) ? state.historyStack : [];
        } else {
            this.rebuildHistoryStack();
        }
        await this.renderCanvas();
        await super.setState(state, result);
    }

    private rebuildHistoryStack() {
        const rootPath: string = this.plugin.settings.rootSearchPath || "";
        this.historyStack = [];

        if (this.currentPath === rootPath || !this.currentPath) {
            return;
        }

        if (rootPath && !this.currentPath.startsWith(rootPath)) {
            return;
        }

        const segments = this.currentPath.split("/").filter(Boolean);
        const rootSegments = rootPath ? rootPath.split("/").filter(Boolean) : [];

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
            this.currentPath = this.plugin.settings.lastOpenPath || this.plugin.settings.rootSearchPath || "";
        }
        this.rebuildHistoryStack();
        await this.renderCanvas();

        this.metadataEventRef = this.app.metadataCache.on("changed", async (file) => {
            if (file instanceof TFile && file.parent?.path === (this.currentPath || "/")) {
                await this.renderCanvas();
            }
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

    public async renderCanvas() {
        const container = this.contentEl;
        container.empty();
        container.addClass("gallery-view-canvas");

        // 🗺️ 1. Navigation Header Block
        const toolbar = container.createDiv({
            cls: "gallery-view-navigation-toolbar",
            attr: { 
                style: `
                    display: flex; 
                    flex-direction: column; 
                    align-items: flex-start; 
                    gap: 8px; 
                    padding: 12px 16px; 
                    border-bottom: 1px solid var(--background-modifier-border); 
                    margin-bottom: 8px;
                    width: 100%;
                ` 
            }
        });

        const breadcrumbPath = this.currentPath || "Root Vault";
        toolbar.createDiv({
            cls: "gallery-view-breadcrumb",
            attr: { 
                style: `
                    font-family: var(--font-monospace), monospace;
                    font-size: var(--font-ui-smaller, 0.85em); 
                    color: var(--text-muted);
                    opacity: 0.6;
                    letter-spacing: 0.5px;
                    white-space: normal;
                    word-break: break-word;
                    width: 100%;
                    line-height: 1.4;
                ` 
            }
        }).setText(`Browsing: ${breadcrumbPath}`);

        const buttonRow = toolbar.createDiv({
            attr: { style: "display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px;" }
        });

        const leftGroup = buttonRow.createDiv({ attr: { style: "display: flex; gap: 8px; align-items: center;" } });

        const backBtn = leftGroup.createEl("button", {
            text: "← Back",
            cls: "gallery-view-back-btn mod-cta",
            attr: { style: "cursor: pointer; padding: 5px 12px; font-size: 0.85em; font-weight: 500; font-family: inherit; border-radius: 4px;" }
        });

        if (this.historyStack.length === 0) {
            backBtn.setAttribute("disabled", "true");
            backBtn.style.opacity = "0.4";
            backBtn.style.cursor = "not-allowed";
        } else {
            backBtn.addEventListener("click", async () => {
                const previousPath = this.historyStack.pop();
                if (previousPath !== undefined) {
                    this.currentPath = previousPath;
                    this.plugin.settings.lastOpenPath = previousPath;
                    await this.plugin.saveSettings();
                    this.app.workspace.requestSaveLayout();
                    await this.renderCanvas();
                }
            });
        }

        const activeMethodKey = this.currentPath || "root";
        const currentSortMethod = this.plugin.settings.folderSortMethods[activeMethodKey] || "alphabetical";

        const controlGroup = buttonRow.createDiv({
            attr: { style: "display: flex; align-items: center; gap: 8px;" }
        });

        const sortSelect = controlGroup.createEl("select", {
            cls: "dropdown",
            attr: { style: "padding: 4px 8px; font-size: 0.85em; cursor: pointer; border-radius: 4px;" }
        });
        
        const methods: { value: SortMethod; label: string }[] = [
            { value: "alphabetical", label: "🔤 Alphabetical" },
            { value: "properties", label: "🏷️ Properties (Tags)" },
            { value: "manual", label: "🎯 Manual Reorder (Drag)" }
        ];

        methods.forEach(m => {
            const opt = sortSelect.createEl("option", { text: m.label, value: m.value });
            if (m.value === currentSortMethod) opt.selected = true;
        });

        sortSelect.addEventListener("change", async () => {
            this.plugin.settings.folderSortMethods[activeMethodKey] = sortSelect.value as SortMethod;
            await this.plugin.saveSettings();
            await this.renderCanvas();
        });

        // 🔒 Functional Drag Lock Button
        if (currentSortMethod === "manual") {
            const lockBtn = controlGroup.createEl("button", {
                cls: "clickable-icon gallery-view-lock-btn",
                attr: {
                    style: `
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 6px;
                        border-radius: 4px;
                        cursor: pointer;
                        background: ${this.isDragLocked ? "var(--background-secondary-alt)" : "var(--interactive-accent)"};
                        color: ${this.isDragLocked ? "var(--text-muted)" : "var(--text-on-accent)"};
                        border: 1px solid var(--background-modifier-border);
                        transition: all 0.2s ease-in-out;
                    `,
                    title: this.isDragLocked ? "Manual sorting is Locked" : "Manual sorting is Unlocked"
                }
            });

            setIcon(lockBtn, this.isDragLocked ? "lock" : "unlock");

            lockBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                this.isDragLocked = !this.isDragLocked;
                
                lockBtn.style.transform = "scale(0.9)";
                setTimeout(() => { lockBtn.style.transform = "scale(1)"; }, 150);

                await this.renderCanvas();
            });
        }

        // 📦 2. Create Content Grid Container
        const grid = container.createDiv({ cls: "gallery-view-grid" });

        grid.addEventListener("dragleave", (e: DragEvent) => {
            const rect = grid.getBoundingClientRect();
            if (
                e.clientX < rect.left || e.clientX >= rect.right ||
                e.clientY < rect.top || e.clientY >= rect.bottom
            ) {
                if (this.indicatorEl) this.indicatorEl.style.display = "none";
                this.currentTargetName = null;
            }
        });
        
        let rootFolder: TAbstractFile | null = null;
        if (this.currentPath.trim() === "") {
            rootFolder = this.app.vault.getRoot();
        } else {
            rootFolder = this.app.vault.getAbstractFileByPath(this.currentPath);
        }

        if (rootFolder instanceof TFolder) {
            let validItems = rootFolder.children.filter(item => 
                item instanceof TFolder || (item instanceof TFile && (item.extension === "md" || item.extension === "pdf"))
            );

            if (currentSortMethod === "alphabetical") {
                validItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            } 
            else if (currentSortMethod === "properties") {
                validItems.sort((a, b) => {
                    const tagA = a instanceof TFile ? (this.app.metadataCache.getFileCache(a)?.frontmatter?.tags?.[0] || "") : "";
                    const tagB = b instanceof TFile ? (this.app.metadataCache.getFileCache(b)?.frontmatter?.tags?.[0] || "") : "";
                    return tagA.localeCompare(tagB, undefined, { sensitivity: 'base' }) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                });
            } 
            else if (currentSortMethod === "manual") {
                let savedOrder = this.plugin.settings.folderManualOrders[activeMethodKey];
                
                // 💡 If no manual order exists yet, initialize it using Alphabetical as the baseline blueprint!
                if (!savedOrder || !Array.isArray(savedOrder)) {
                    validItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                    savedOrder = validItems.map(item => item.name);
                    this.plugin.settings.folderManualOrders[activeMethodKey] = savedOrder;
                    await this.plugin.saveSettings();
                }

                // Create a guaranteed non-undefined reference for the inner callback closure
                const finalOrder: string[] = savedOrder;

                validItems.sort((a, b) => {
                    const idxA = finalOrder.indexOf(a.name);
                    const idxB = finalOrder.indexOf(b.name);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                });
            }

            if (validItems.length === 0) {
                grid.createDiv({ cls: "gallery-view-empty-msg", text: "This folder contains no library assets." });
            } else {
                for (const item of validItems) {
                    await this.renderCard(grid, item, item instanceof TFolder, currentSortMethod === "manual");
                }
            }
        }
    }

    private async renderCard(grid: HTMLElement, item: TAbstractFile, isFolder: boolean, isManualSort: boolean) {
        const card = grid.createDiv({ cls: "gallery-view-card" });
        (card as any).itemName = item.name;
        
        if (isManualSort && !this.isDragLocked) {
            card.setAttribute("draggable", "true");
            card.style.cursor = "grab";

            card.addEventListener("dragstart", (e) => {
                this.draggedItemPath = item.name;
                card.style.opacity = "0.3";
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
                if (!this.draggedItemPath || this.draggedItemPath === item.name) return;

                if (!this.indicatorEl) {
                    this.indicatorEl = grid.createDiv({ cls: "gallery-view-drop-indicator" });
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

                this.indicatorEl.style.top = `${indicatorTop}px`;
                this.indicatorEl.style.height = `${indicatorHeight}px`;
                this.indicatorEl.style.left = `${indicatorLeft}px`;
                this.indicatorEl.style.display = "block";
            });

            card.addEventListener("drop", async (e) => {
                e.preventDefault();
                
                const sourceName = this.draggedItemPath || (e.dataTransfer ? e.dataTransfer.getData("text/plain") : null);
                const targetName = this.currentTargetName;

                this.cleanupDragIndicators();

                if (!sourceName || !targetName || sourceName === targetName) return;

                const activeMethodKey = this.currentPath || "root";
                
                let itemsList = Array.from(grid.children)
                    .map(el => (el as any).itemName)
                    .filter(Boolean) as string[];

                if (itemsList.length === 0) {
                    let folderObj = this.app.vault.getAbstractFileByPath(this.currentPath) as TFolder;
                    if (folderObj) itemsList = folderObj.children.map(c => c.name);
                }

                const currentSavedOrder = this.plugin.settings.folderManualOrders[activeMethodKey] || [...itemsList];
                
                const sourceIndex = currentSavedOrder.indexOf(sourceName);
                if (sourceIndex !== -1) currentSavedOrder.splice(sourceIndex, 1);

                let targetIndex = currentSavedOrder.indexOf(targetName);
                if (this.insertAfterTarget) {
                    targetIndex += 1;
                }

                if (targetIndex !== -1) {
                    currentSavedOrder.splice(targetIndex, 0, sourceName);
                    this.plugin.settings.folderManualOrders[activeMethodKey] = currentSavedOrder;
                    this.plugin.settings.folderSortMethods[activeMethodKey] = "manual";
                    await this.plugin.saveSettings();
                    await this.renderCanvas();
                }
            });
        } else {
            card.setAttribute("draggable", "false");
            card.style.cursor = "pointer";
        }
        
        const bannerContainer = card.createDiv({ cls: "gallery-view-card-banner-wrap" });
        const infoSection = card.createDiv({ cls: "gallery-view-card-info" });

        let usableName = item.name;
        if (!isFolder && item instanceof TFile) {
            usableName = item.basename;
        }

        const titleRow = infoSection.createDiv({
            attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;" }
        });

        titleRow.createDiv({ cls: "gallery-view-card-title" }).setText(usableName);

        const imgFitRule = this.plugin.settings.bannerFit || "cover";

        if (isFolder) {
            card.addClass("is-folder-father");
            
            const folderMeta = this.plugin.settings.folderOverrides[item.path];
            const bannerUrl = folderMeta?.bannerUrl || this.plugin.settings.defaultFolderBanner;
            
            bannerContainer.createEl("img", { 
                attr: { src: bannerUrl, style: `object-fit: ${imgFitRule};` }, 
                cls: "gallery-view-banner-img" 
            });
            
            const childCount = (item as TFolder).children.length;
            infoSection.createDiv({ cls: "gallery-view-card-meta" }).setText(`${childCount} item${childCount === 1 ? "" : "s"} inside`);

            // 📊 INJECTED OPTIONAL RECURSIVE PROGRESS BAR
            if (this.plugin.settings.showFolderProgress) {
                const metrics = this.getFolderProgressMetrics(item as TFolder);
                if (metrics !== null) {
                    const progressContainer = infoSection.createDiv({
                        attr: { style: "width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;" }
                    });

                    const labelRow = progressContainer.createDiv({
                        attr: { style: "display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-muted);" }
                    });
                    labelRow.createDiv().setText(`Progress: ${metrics.completed}/${metrics.total}`);
                    labelRow.createDiv().setText(`${metrics.percent}%`);

                    const barTrack = progressContainer.createDiv({
                        attr: { style: "width: 100%; background: var(--background-modifier-border); border-radius: 4px; height: 5px; overflow: hidden;" }
                    });

                    barTrack.createDiv({
                        attr: { style: `width: ${metrics.percent}%; background: var(--interactive-accent); height: 100%; border-radius: 4px; transition: width 0.25s ease-in-out;` }
                    });
                }
            }

            card.addEventListener("click", async () => {
                this.historyStack.push(this.currentPath);
                this.currentPath = item.path;
                this.plugin.settings.lastOpenPath = item.path;
                await this.plugin.saveSettings();
                this.app.workspace.requestSaveLayout();
                await this.renderCanvas();
            });

        } else if (item instanceof TFile) {
            card.addClass("is-file-child");
            const isPdf = item.extension === "pdf";

            let bannerUrl = this.plugin.settings.defaultFileBanner;
            let frontmatter: any = {};

            if (!isPdf) {
                const fileCache = this.app.metadataCache.getFileCache(item);
                frontmatter = fileCache?.frontmatter || {};
                bannerUrl = frontmatter.banner || this.plugin.settings.defaultFileBanner;
            } else {
                const folderMeta = this.plugin.settings.folderOverrides[item.path];
                bannerUrl = folderMeta?.bannerUrl || this.plugin.settings.defaultPdfBanner;
            }

            bannerContainer.createEl("img", { 
                attr: { src: bannerUrl, style: `object-fit: ${imgFitRule};` }, 
                cls: "gallery-view-banner-img" 
            });

            const metaContainer = infoSection.createDiv({ cls: "gallery-view-card-meta" });

            if (isPdf) {
                const pdfBadge = metaContainer.createDiv({
                    attr: { style: "background-color: var(--text-error); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; font-weight: bold; text-transform: uppercase;" }
                });
                pdfBadge.setText("PDF");
            } else {
                this.plugin.settings.visibleProperties.forEach(propKey => {
                    if (frontmatter[propKey] !== undefined && propKey !== "checkbox") {
                        const badge = metaContainer.createDiv({ cls: "gallery-view-property-badge" });
                        badge.setText(`${propKey}: ${frontmatter[propKey]}`);
                    }
                });
            }

            if (this.plugin.settings.showCheckboxes && !isPdf) {
                const hasCheckboxProperty = frontmatter.hasOwnProperty("checkbox");

                if (hasCheckboxProperty) {
                    const checkboxWrapper = infoSection.createDiv({
                        attr: { style: "display: flex; align-items: center; margin-top: 2px; width: fit-content;" }
                    });

                    const checkbox = checkboxWrapper.createEl("input", {
                        type: "checkbox",
                        attr: { style: "cursor: pointer; width: 16px; height: 16px; margin: 0;" }
                    });

                    checkbox.checked = Boolean(frontmatter["checkbox"]);

                    checkbox.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        const targetValue = checkbox.checked;
                        await this.app.fileManager.processFrontMatter(item, (fm) => {
                            fm["checkbox"] = targetValue;
                        });
                    });
                }
            }

            card.addEventListener("click", () => {
                this.app.workspace.getLeaf(false).openFile(item);
            });
        }
    }

    private cleanupDragIndicators() {
        this.draggedItemPath = null;
        this.currentTargetName = null;
        if (this.indicatorEl) {
            this.indicatorEl.remove();
            this.indicatorEl = null;
        }
        this.contentEl.querySelectorAll(".gallery-view-card").forEach(el => {
            (el as HTMLElement).style.opacity = "1";
        });
    }

    // 📊 INJECTED METRIC COMPUTATION FUNCTION
    private getFolderProgressMetrics(folder: TFolder): { total: number; completed: number; percent: number } | null {
        let totalCheckboxes = 0;
        let completedCheckboxes = 0;

        const scan = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    const cache = this.app.metadataCache.getFileCache(child);
                    const frontmatter = cache?.frontmatter;
                    
                    if (frontmatter) {
                        const targetKey = Object.keys(frontmatter).find(k => k.toLowerCase() === "checkbox");
                        if (targetKey !== undefined && frontmatter[targetKey] !== undefined) {
                            totalCheckboxes++;
                            const value = frontmatter[targetKey];
                            const isCompleted = value === true || String(value).toLowerCase() === "true";
                            if (isCompleted) {
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

        const percent = Math.round((completedCheckboxes / totalCheckboxes) * 100);
        return { total: totalCheckboxes, completed: completedCheckboxes, percent };
    }
}
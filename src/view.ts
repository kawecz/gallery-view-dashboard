import { ItemView, WorkspaceLeaf, TAbstractFile, TFolder, TFile, EventRef } from "obsidian";
import GalleryViewPlugin from "./main";

export const VIEW_TYPE_GALLERY = "gallery-view-dashboard";

export class GalleryDashboardView extends ItemView {
    plugin: GalleryViewPlugin;
    public currentPath: string = "";
    private historyStack: string[] = [];
    private metadataEventRef: EventRef | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: GalleryViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        // Fall back to root settings if no state has been serialized yet
        this.currentPath = this.plugin.settings.lastOpenPath || this.plugin.settings.rootSearchPath || "";
    }

    getViewType(): string {
        return VIEW_TYPE_GALLERY;
    }

    getDisplayText(): string {
        return "Library Gallery";
    }

    /**
     * 🌟 Obsidian Navigation State Serialization
     * This saves the current view state into Obsidian's workspace configuration cache.
     */
    getState() {
        return {
            currentPath: this.currentPath,
            historyStack: this.historyStack
        };
    }

    /**
     * 🌟 Obsidian Navigation State Restoration
     * This triggers automatically when Obsidian reopens an existing workspace leaf pane.
     */
    async setState(state: any, result: any) {
        if (state && typeof state.currentPath === "string") {
            this.currentPath = state.currentPath;
            this.historyStack = Array.isArray(state.historyStack) ? state.historyStack : [];
        }
        await this.renderCanvas();
        await super.setState(state, result);
    }

    public async updateRootPath(newPath: string) {
        this.currentPath = newPath;
        this.historyStack = []; 
        
        // Keep persistent data sync files in alignment
        this.plugin.settings.lastOpenPath = newPath;
        await this.plugin.saveSettings();
        
        // Notify the workspace that this view changed state
        this.app.workspace.requestSaveLayout();
        
        await this.renderCanvas();
    }

    async onOpen() {
        // Fall back to saved global settings if the layout engine didn't restore path parameters yet
        if (!this.currentPath) {
            this.currentPath = this.plugin.settings.lastOpenPath || this.plugin.settings.rootSearchPath || "";
        }

        await this.renderCanvas();

        this.metadataEventRef = this.app.metadataCache.on("changed", async (file) => {
            if (file instanceof TFile && file.parent?.path === (this.currentPath || "/")) {
                await this.renderCanvas();
            }
        });
        
        this.plugin.registerEvent(this.metadataEventRef);
    }

    async onClose() {
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
            attr: { style: "display: flex; width: 100%; align-items: center;" }
        });

        const backBtn = buttonRow.createEl("button", {
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

        // 📦 2. Create Content Grid Container
        const grid = container.createDiv({
            cls: "gallery-view-grid"
        });
        
        let rootFolder: TAbstractFile | null = null;
        if (this.currentPath.trim() === "") {
            rootFolder = this.app.vault.getRoot();
        } else {
            rootFolder = this.app.vault.getAbstractFileByPath(this.currentPath);
        }

        if (rootFolder instanceof TFolder) {
            const sortedChildren = [...rootFolder.children].sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            const validItems = sortedChildren.filter(item => item instanceof TFolder || (item instanceof TFile && (item.extension === "md" || item.extension === "pdf")));
            if (validItems.length === 0) {
                grid.createDiv({
                    cls: "gallery-view-empty-msg",
                    text: "This folder contains no library assets."
                });
            } else {
                for (const item of validItems) {
                    await this.renderCard(grid, item, item instanceof TFolder);
                }
            }
        }
    }

    private async renderCard(grid: HTMLElement, item: TAbstractFile, isFolder: boolean) {
        const card = grid.createDiv({
            cls: "gallery-view-card"
        });
        
        const bannerContainer = card.createDiv({
            cls: "gallery-view-card-banner-wrap"
        });
        
        const infoSection = card.createDiv({
            cls: "gallery-view-card-info"
        });

        let usableName = item.name;
        if (!isFolder && item instanceof TFile) {
            usableName = item.basename;
        }

        const titleRow = infoSection.createDiv({
            attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;" }
        });

        titleRow.createDiv({
            cls: "gallery-view-card-title"
        }).setText(usableName);

        const imgFitRule = this.plugin.settings.bannerFit || "cover";

        if (isFolder) {
            card.addClass("is-folder-father");
            
            const folderMeta = this.plugin.settings.folderOverrides[item.path];
            const bannerUrl = folderMeta?.bannerUrl || this.plugin.settings.defaultFolderBanner;
            
            bannerContainer.createEl("img", { 
                attr: { 
                    src: bannerUrl, 
                    style: `object-fit: ${imgFitRule};` 
                }, 
                cls: "gallery-view-banner-img" 
            });
            
            const childCount = (item as TFolder).children.length;
            infoSection.createDiv({
                cls: "gallery-view-card-meta"
            }).setText(`${childCount} item${childCount === 1 ? "" : "s"} inside`);

            card.addEventListener("click", async () => {
                this.historyStack.push(this.currentPath);
                this.currentPath = item.path;
                
                // Keep file systems cached tightly
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
            }

            bannerContainer.createEl("img", { 
                attr: { 
                    src: bannerUrl, 
                    style: `object-fit: ${imgFitRule};` 
                }, 
                cls: "gallery-view-banner-img" 
            });

            const metaContainer = infoSection.createDiv({
                cls: "gallery-view-card-meta"
            });

            if (isPdf) {
                const pdfBadge = metaContainer.createDiv({
                    attr: { style: "background-color: var(--text-error); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; font-weight: bold; text-transform: uppercase;" }
                });
                pdfBadge.setText("PDF");
            } else {
                this.plugin.settings.visibleProperties.forEach(propKey => {
                    if (frontmatter[propKey] !== undefined && propKey !== "checkbox") {
                        const badge = metaContainer.createDiv({
                            cls: "gallery-view-property-badge"
                        });
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
}
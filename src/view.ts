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
        this.currentPath = this.plugin.settings.rootSearchPath || "";
    }

    getViewType(): string {
        return VIEW_TYPE_GALLERY;
    }

    getDisplayText(): string {
        return "Library Gallery";
    }

    // Public method to let external modifications update the track path dynamically
    public async updateRootPath(newPath: string) {
        this.currentPath = newPath;
        this.historyStack = []; // Reset navigation tracking history safely
        await this.renderCanvas();
    }

    async onOpen() {
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
        container.addClass("gallery-view-dashboard-wrapper");

        // 🗺️ 1. Create Navigation Toolbar Area
        const toolbar = container.createDiv({
            cls: "gallery-view-navigation-toolbar",
            attr: { style: "display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 8px;" }
        });

        // Back Arrow Button
        const backBtn = toolbar.createEl("button", {
            text: "← Back",
            cls: "mod-cta",
            attr: { style: "cursor: pointer; padding: 6px 12px; font-size: 0.9em; font-weight: 500; font-family: inherit;" }
        });

        if (this.historyStack.length === 0) {
            backBtn.setAttribute("disabled", "true");
            backBtn.style.opacity = "0.5";
            backBtn.style.cursor = "not-allowed";
        } else {
            backBtn.addEventListener("click", async () => {
                const previousPath = this.historyStack.pop();
                if (previousPath !== undefined) {
                    this.currentPath = previousPath;
                    await this.renderCanvas();
                }
            });
        }

        // Current Location Breadcrumb Title Text
        const breadcrumbPath = this.currentPath || "Root Vault";
        toolbar.createDiv({
            cls: "gallery-view-breadcrumb",
            attr: { style: "font-size: 1.2em; font-weight: 500; color: var(--text-normal);" }
        }).setText(`Browsing: ${breadcrumbPath}`);

        // 📦 2. Create Content Grid Container
        const grid = container.createDiv({
            cls: "gallery-view-grid-layout",
            attr: { style: "display: flex; flex-wrap: wrap; gap: 16px; padding: 16px; width: 100%;" }
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

            for (const item of sortedChildren) {
                if (item instanceof TFolder || (item instanceof TFile && (item.extension === "md" || item.extension === "pdf"))) {
                    await this.renderCard(grid, item, item instanceof TFolder);
                }
            }
        }
    }

    private async renderCard(grid: HTMLElement, item: TAbstractFile, isFolder: boolean) {
        const card = grid.createDiv({
            cls: "gallery-view-card",
            attr: { 
                style: "width: 240px; display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border); box-shadow: 0 4px 6px rgba(0,0,0,0.05); cursor: pointer;" 
            }
        });
        
        const bannerContainer = card.createDiv({
            cls: "gallery-view-card-banner-wrap",
            attr: { 
                style: "height: 140px; width: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--background-secondary);" 
            }
        });
        
        const infoSection = card.createDiv({
            cls: "gallery-view-card-info",
            attr: { style: "padding: 12px; display: flex; flex-direction: column; gap: 6px;" }
        });

        let usableName = item.name;
        if (!isFolder && item instanceof TFile) {
            usableName = item.basename;
        }

        const titleRow = infoSection.createDiv({
            attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;" }
        });

        titleRow.createDiv({
            cls: "gallery-view-card-title",
            attr: { style: "font-weight: 600; font-size: 1.1em; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1;" }
        }).setText(usableName);

        const imgFitRule = this.plugin.settings.bannerFit || "cover";

        if (isFolder) {
            card.addClass("is-folder-father");
            
            const folderMeta = this.plugin.settings.folderOverrides[item.path];
            const bannerUrl = folderMeta?.bannerUrl || this.plugin.settings.defaultFolderBanner;
            
            bannerContainer.createEl("img", { 
                attr: { 
                    src: bannerUrl, 
                    style: `object-fit: ${imgFitRule}; width: 100%; height: 100%; max-width: 100%; max-height: 100%;` 
                }, 
                cls: "gallery-view-banner-img" 
            });
            
            const childCount = (item as TFolder).children.length;
            infoSection.createDiv({
                cls: "gallery-view-card-meta",
                attr: { style: "font-size: 0.85em; color: var(--text-muted);" }
            }).setText(`${childCount} item${childCount === 1 ? "" : "s"} inside`);

            card.addEventListener("click", async () => {
                this.historyStack.push(this.currentPath);
                this.currentPath = item.path;
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
                    style: `object-fit: ${imgFitRule}; width: 100%; height: 100%; max-width: 100%; max-height: 100%;` 
                }, 
                cls: "gallery-view-banner-img" 
            });

            const metaContainer = infoSection.createDiv({
                cls: "gallery-view-card-meta",
                attr: { style: "display: flex; flex-wrap: wrap; gap: 4px; font-size: 0.85em; min-height: 20px;" }
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
                            cls: "gallery-view-property-badge",
                            attr: { style: "background: var(--background-modifier-border); padding: 2px 6px; border-radius: 4px; color: var(--text-normal); font-size: 0.8em;" }
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
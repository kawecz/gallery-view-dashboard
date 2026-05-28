import { App, PluginSettingTab, Setting, TFolder, TAbstractFile } from "obsidian";
import GalleryViewPlugin from "./main";
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
        
        document.addEventListener("click", (e) => {
            if (e.target !== this.inputEl && this.suggestionEl && !this.suggestionEl.contains(e.target as Node)) {
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

        const filtered = folders.filter(f => f.toLowerCase().includes(value)).slice(0, 8);

        if (filtered.length === 0) {
            this.close();
            return;
        }

        if (!this.suggestionEl) {
            this.suggestionEl = document.body.createDiv({ cls: "suggestion-container" });
            const rect = this.inputEl.getBoundingClientRect();
            this.suggestionEl.setAttrs({
                style: `position: absolute; top: ${rect.bottom + window.scrollY}px; left: ${rect.left + window.scrollX}px; width: ${rect.width}px; max-height: 240px; overflow-y: auto; z-index: var(--layer-menu); background-color: var(--background-secondary); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: var(--shadow-l); padding: 4px;`
            });
        } else {
            this.suggestionEl.empty();
        }

        const listWrap = this.suggestionEl.createDiv({ cls: "suggestion" });

        filtered.forEach(folderPath => {
            const item = listWrap.createDiv({ 
                cls: "suggestion-item", 
                text: folderPath,
                attr: { style: "padding: 6px 10px; cursor: pointer; border-radius: 4px; color: var(--text-normal); font-size: var(--font-ui-small); transition: background-color 0.1s ease;" }
            });

            item.addEventListener("mouseenter", () => {
                item.style.backgroundColor = "var(--background-modifier-hover)";
                item.style.color = "var(--text-accent)";
            });
            item.addEventListener("mouseleave", () => {
                item.style.backgroundColor = "transparent";
                item.style.color = "var(--text-normal)";
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
    private debounceTimeout: NodeJS.Timeout | null = null;

    constructor(app: App, plugin: GalleryViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private broadcastPathChange(newPath: string) {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        leaves.forEach(leaf => {
            if (leaf.view instanceof GalleryDashboardView) {
                leaf.view.updateRootPath(newPath);
            }
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Gallery View Configurations" });

        const rootSetting = new Setting(containerEl)
            .setName("Library Root Target Path")
            .setDesc("Specify the folder path that acts as your library dashboard.");
        
        rootSetting.addText(text => {
            text.setPlaceholder("e.g., conteudo/cursos")
                .setValue(this.plugin.settings.rootSearchPath);

            text.inputEl.addEventListener("input", (e) => {
                const targetValue = (e.target as HTMLInputElement).value;

                if (this.debounceTimeout) {
                    clearTimeout(this.debounceTimeout);
                }

                this.debounceTimeout = setTimeout(async () => {
                    const trimmedValue = targetValue.trim();
                    this.plugin.settings.rootSearchPath = trimmedValue;
                    await this.plugin.saveSettings();
                    this.broadcastPathChange(trimmedValue);
                    
                    const treeRoot = containerEl.querySelector(".gallery-view-subfolder-tree-root") as HTMLElement;
                    if (treeRoot) {
                        treeRoot.empty();
                        const activeTargetRoot = trimmedValue || "/";
                        this.displayFolderTree(treeRoot, activeTargetRoot === "/" ? "" : activeTargetRoot, 0);
                    }
                }, 300);
            });

            new FolderSuggest(this.app, text.inputEl);
        });

        containerEl.createEl("h3", { text: "Global Display Settings" });
        
        new Setting(containerEl)
            .setName("Visible Metadata Keys")
            .addText(text => text
                .setPlaceholder("tags, status, todo")
                .setValue(this.plugin.settings.visibleProperties.join(", "))
                .onChange(async (value) => {
                    this.plugin.settings.visibleProperties = value.split(",").map(p => p.trim()).filter(p => p.length > 0);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Show Action Checkboxes")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCheckboxes)
                .onChange(async (value) => {
                    this.plugin.settings.showCheckboxes = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl("h4", { text: "Asset Fallbacks" });

        new Setting(containerEl)
            .setName("Default Folder Banner")
            .addText(text => text
                .setValue(this.plugin.settings.defaultFolderBanner)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFolderBanner = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Default Note File Banner")
            .addText(text => text
                .setValue(this.plugin.settings.defaultFileBanner)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFileBanner = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl("h3", { text: "Live Library Vault Tree Structure" });
        const activeTargetRoot = this.plugin.settings.rootSearchPath || "/";
        const treeContainer = containerEl.createDiv({
            cls: "gallery-view-subfolder-tree-root",
            attr: { style: "background: var(--background-secondary); padding: 12px; border-radius: 6px; margin-bottom: 20px;" }
        });
        this.displayFolderTree(treeContainer, activeTargetRoot === "/" ? "" : activeTargetRoot, 0);

        containerEl.createEl("h3", { text: "Manual Customizations Overrides" });

        Object.keys(this.plugin.settings.folderOverrides).forEach(folderPath => {
            const config = this.plugin.settings.folderOverrides[folderPath];
            if (!config || !(config as any).isManual) return;
            if (folderPath === (this.plugin.settings.rootSearchPath || "/")) return;

            const rowSetting = new Setting(containerEl);
            rowSetting.addText(text => {
                text.setValue(folderPath).setPlaceholder("Folder Path");
                if (folderPath.startsWith("new-folder-path-")) {
                    text.setDisabled(false);
                    text.onChange(async (val) => {
                        this.plugin.settings.folderOverrides[val] = { ...config, folderPath: val };
                        delete this.plugin.settings.folderOverrides[folderPath];
                        await this.plugin.saveSettings();
                    });
                    new FolderSuggest(this.app, text.inputEl);
                } else {
                    text.setDisabled(true);
                }
            });
            rowSetting.addText(text => text
                .setValue(config.bannerUrl ?? "")
                .setPlaceholder("Banner URL...")
                .onChange(async (val) => { config.bannerUrl = val; await this.plugin.saveSettings(); })
            );
            rowSetting.addButton(btn => btn.setButtonText("❌").onClick(async () => {
                delete this.plugin.settings.folderOverrides[folderPath];
                await this.plugin.saveSettings();
                this.display();
            }));
        });

        const btnContainer = containerEl.createDiv({ attr: { style: "margin-top: 10px;" } });
        const addBtn = btnContainer.createEl("button", { text: "+ Add Manual Override", cls: "mod-cta" });
        addBtn.addEventListener("click", async () => {
            this.plugin.settings.folderOverrides["new-folder-path-" + Date.now()] = { 
                folderPath: "", bannerUrl: "", showSubs: false, isManual: true 
            } as any;
            await this.plugin.saveSettings();
            this.display();
        });
    }

    private displayFolderTree(containerEl: HTMLElement, currentPath: string, level: number) {
        const resolvedPath = currentPath === "/" ? "" : currentPath;
        const abstractFolder = this.app.vault.getAbstractFileByPath(resolvedPath);
        if (!(abstractFolder instanceof TFolder)) return;

        const sortedChildren = [...abstractFolder.children].sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        );

        sortedChildren.forEach(child => {
            if (child instanceof TFolder) {
                const childPath = child.path;

                const rowWrapper = containerEl.createDiv({
                    attr: { style: `margin-left: ${level * 12}px; margin-top: 6px;` }
                });

                const flexRow = rowWrapper.createDiv({
                    attr: { style: "display: flex; align-items: center; gap: 8px; width: 100%;" }
                });

                flexRow.createSpan({ 
                    text: "↳ 📁", 
                    attr: { style: "color: var(--text-muted); font-weight: bold;" } 
                });

                flexRow.createSpan({ 
                    text: `${child.name}:`, 
                    attr: { style: "min-width: 120px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-ui-small);" } 
                });

                if (!this.plugin.settings.folderOverrides[childPath]) {
                    this.plugin.settings.folderOverrides[childPath] = { folderPath: childPath, bannerUrl: "", showSubs: false };
                }
                const folderData = this.plugin.settings.folderOverrides[childPath];

                const input = flexRow.createEl("input", {
                    type: "text",
                    placeholder: "Custom Banner URL...",
                    value: folderData?.bannerUrl ?? "",
                    attr: { style: "flex-grow: 1; padding: 4px 8px; font-family: inherit; font-size: var(--font-ui-small);" }
                });

                input.addEventListener("input", async (e) => {
                    if (this.plugin.settings.folderOverrides[childPath]) {
                        this.plugin.settings.folderOverrides[childPath]!.bannerUrl = (e.target as HTMLInputElement).value;
                        await this.plugin.saveSettings();
                    }
                });

                const hasSubfolders = child.children.some(item => item instanceof TFolder);

                if (hasSubfolders) {
                    const isChildExpanded = !!folderData?.showSubs;
                    const nestedChildContainer = rowWrapper.createDiv({
                        attr: { style: isChildExpanded ? "display: block;" : "display: none;" }
                    });

                    const toggleBtn = flexRow.createEl("button", {
                        text: isChildExpanded ? "▲" : "▼",
                        attr: { style: "padding: 2px 6px; cursor: pointer; font-family: inherit; font-size: var(--font-ui-small);" }
                    });

                    toggleBtn.addEventListener("click", async () => {
                        if (this.plugin.settings.folderOverrides[childPath]) {
                            const nextState = !this.plugin.settings.folderOverrides[childPath]!.showSubs;
                            this.plugin.settings.folderOverrides[childPath]!.showSubs = nextState;
                            await this.plugin.saveSettings();
                            
                            nestedChildContainer.style.display = nextState ? "block" : "none";
                            toggleBtn.setText(nextState ? "▲" : "▼");
                        }
                    });

                    this.displayFolderTree(nestedChildContainer, childPath, level + 1);
                }
            }
        });
    }
}
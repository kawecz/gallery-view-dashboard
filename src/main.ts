import { Plugin, WorkspaceLeaf, TFolder } from "obsidian";
import { GalleryDashboardView, VIEW_TYPE_GALLERY } from "./view";
import { GalleryViewSettings, DEFAULT_SETTINGS } from "./types";
import { GalleryViewSettingTab } from "./settings";

export default class GalleryViewPlugin extends Plugin {
    settings!: GalleryViewSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GalleryViewSettingTab(this.app, this));
        
        this.registerView(
            VIEW_TYPE_GALLERY,
            (leaf: WorkspaceLeaf) => new GalleryDashboardView(leaf, this)
        );

        this.addRibbonIcon("library", "Open Library Gallery", () => {
            this.activateGalleryView();
        });

        this.addCommand({
            id: "open-gallery-dashboard",
            name: "Open Gallery Dashboard Layout",
            callback: () => this.activateGalleryView(),
        });

        // 🌟 Fix Bug: Intercept all file/folder renames and moves across paths to update data keys dynamically
        this.registerEvent(
            this.app.vault.on("rename", async (file, oldPath) => {
                let layoutChanged = false;

                // 1. Update Custom Banner Configuration Paths
                if (this.settings.folderOverrides[oldPath]) {
                    const dataConfig = this.settings.folderOverrides[oldPath];
                    dataConfig.folderPath = file.path;
                    this.settings.folderOverrides[file.path] = dataConfig;
                    delete this.settings.folderOverrides[oldPath];
                    layoutChanged = true;
                }

                // 2. Update Sort Strategy Mappings
                if (this.settings.folderSortMethods[oldPath]) {
                    this.settings.folderSortMethods[file.path] = this.settings.folderSortMethods[oldPath];
                    delete this.settings.folderSortMethods[oldPath];
                    layoutChanged = true;
                }

                // 3. Update Drag and Drop Item Caches
                if (this.settings.folderManualOrders[oldPath]) {
                    this.settings.folderManualOrders[file.path] = this.settings.folderManualOrders[oldPath];
                    delete this.settings.folderManualOrders[oldPath];
                    layoutChanged = true;
                }

                // 4. Update parent items array cache if a child item was moved/renamed within manual lists
                const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf("/")) || "";
                const newParentPath = file.path.substring(0, file.path.lastIndexOf("/")) || "";
                const oldName = oldPath.substring(oldPath.lastIndexOf("/") + 1);

                if (this.settings.folderManualOrders[oldParentPath]) {
                    this.settings.folderManualOrders[oldParentPath] = this.settings.folderManualOrders[oldParentPath]
                        .map(name => name === oldName ? file.name : name);
                    layoutChanged = true;
                }

                if (layoutChanged) {
                    await this.saveSettings();
                }
            })
        );

        // 🌟 Re-sync explicitly if layout structures load out of alignment
        this.app.workspace.onLayoutReady(async () => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
            for (const leaf of leaves) {
                if (leaf.view instanceof GalleryDashboardView) {
                    if (!leaf.view.currentPath) {
                        leaf.view.currentPath = this.settings.lastOpenPath || this.settings.rootSearchPath || "";
                        await leaf.view.renderCanvas();
                    }
                }
            }
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALLERY);
    }

    async activateGalleryView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        const existingLeaf = leaves[0];

        if (existingLeaf) {
            workspace.revealLeaf(existingLeaf);
        } else {
            const leaf = workspace.getLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_GALLERY,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        for (const leaf of leaves) {
            if (leaf.view instanceof GalleryDashboardView) {
                const existingPath = leaf.view.currentPath;
                leaf.view.currentPath = existingPath || this.settings.rootSearchPath || "";
                leaf.view.renderCanvas();
            }
        }
    }
}
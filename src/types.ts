export type SortMethod = "alphabetical" | "properties" | "manual";

export interface FolderOverride {
    folderPath: string;
    bannerUrl: string;
    showSubs: boolean;
    isManual?: boolean;
}

export interface GalleryViewSettings {
    rootSearchPath: string;
    lastOpenPath: string;
    visibleProperties: string[];
    showCheckboxes: boolean;
    showFolderProgress: boolean;
    defaultFolderBanner: string;
    defaultFileBanner: string;
    defaultPdfBanner: string;
    bannerFit: "cover" | "contain";
    folderSortMethods: Record<string, SortMethod>;
    folderManualOrders: Record<string, string[]>;
    folderOverrides: Record<string, FolderOverride>;
    folderCardSizes: Record<string, number>;
    addPropertiesOnCreate: boolean; // New configuration key
}

export const DEFAULT_SETTINGS: GalleryViewSettings = {
    rootSearchPath: "",
    lastOpenPath: "",
    visibleProperties: ["tags", "status", "todo"],
    showCheckboxes: true,
    showFolderProgress: true,
    defaultFolderBanner: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
    defaultFileBanner: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
    defaultPdfBanner: "https://cdn-icons-png.flaticon.com/512/337/337946.png",
    bannerFit: "cover",
    folderSortMethods: {},
    folderManualOrders: {},
    folderOverrides: {},
    folderCardSizes: {},
    addPropertiesOnCreate: true
};
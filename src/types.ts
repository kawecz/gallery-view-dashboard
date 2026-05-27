export interface FolderCardConfig {
    folderPath: string;
    bannerUrl?: string;
    accentColor?: string;
    displayName?: string;
    showSubs?: boolean; // 🌟 Added safely for the recursive settings menu tracking state
}

export interface GalleryViewSettings {
    rootSearchPath: string;          // The base folder to act as your "Library"
    defaultFolderBanner: string;     // Default fallback image for folder cards
    defaultFileBanner: string;       // Default fallback image for note cards
    showCheckboxes: boolean;         // Global toggle for quick toggles
    visibleProperties: string[];     // String list of YAML frontmatter keys to print on cards
    folderOverrides: Record<string, FolderCardConfig>; // Path-mapped customized configurations
    bannerFit: "cover" | "contain"; // Global Image fit setting
}

export const DEFAULT_SETTINGS: GalleryViewSettings = {
    rootSearchPath: "",
    defaultFolderBanner: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe", 
    defaultFileBanner: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809",   
    showCheckboxes: true,
    visibleProperties: ["tags", "status", "todo"],
    folderOverrides: {},
    bannerFit: "cover" // Default to standard cropping format
};
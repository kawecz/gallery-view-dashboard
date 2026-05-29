export interface FolderCardConfig {
    folderPath: string;
    bannerUrl?: string;
    accentColor?: string;
    displayName?: string;
    showSubs?: boolean; // 🌟 Added safely for the recursive settings menu tracking state
}

// 📦 Added customizable sorting options for version v1.0.2
export type SortMethod =  | "alphabetical" | "properties" | "manual";

export interface GalleryViewSettings {
    rootSearchPath: string;          // The base folder to act as your "Library"
    lastOpenPath: string;            // 💾 Tracks session history state across Obsidian application restarts
    defaultFolderBanner: string;     // Default fallback image for folder cards
    defaultFileBanner: string;       // Default fallback image for note cards
    defaultPdfBanner: string;        // 📄 Added fallback banner specifically for PDF files
    showCheckboxes: boolean;         // Global toggle for quick toggles
    visibleProperties: string[];     // String list of YAML frontmatter keys to print on cards
    folderOverrides: Record<string, FolderCardConfig>; // Path-mapped customized configurations
    bannerFit: "cover" | "contain"; // Global Image fit setting
    
    // 🔀 Sorting Configurations per Directory
    folderSortMethods: Record<string, SortMethod>;   // Tracks the selected sort algorithm per folder path
    folderManualOrders: Record<string, string[]>;    // Caches the explicit manual drag-and-drop array of item names
}

export const DEFAULT_SETTINGS: GalleryViewSettings = {
    rootSearchPath: "",
    lastOpenPath: "",                // Initialize empty so it falls back to rootSearchPath on first load
    defaultFolderBanner: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe", 
    defaultFileBanner: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809",   
    defaultPdfBanner: "https://images.unsplash.com/photo-1568667256549-094345857637", // Clean default library book stacks
    showCheckboxes: true,
    visibleProperties: ["tags", "status", "todo"],
    folderOverrides: {},
    bannerFit: "cover", // Default to standard cropping format
    folderSortMethods: {},
    folderManualOrders: {}
};
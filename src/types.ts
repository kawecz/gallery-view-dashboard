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
	addPropertiesOnCreate: boolean;
	youtubeApiKey?: string;
}

export const DEFAULT_SETTINGS: GalleryViewSettings = {
	rootSearchPath: "",
	lastOpenPath: "",
	visibleProperties: ["tags", "status", "todo"],
	showCheckboxes: true,
	showFolderProgress: true,
	defaultFolderBanner:
		"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
	defaultFileBanner:
		"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
	defaultPdfBanner: "https://cdn-icons-png.flaticon.com/512/337/337946.png",
	bannerFit: "cover",
	folderSortMethods: {},
	folderManualOrders: {},
	folderOverrides: {},
	folderCardSizes: {},
	addPropertiesOnCreate: true,
	youtubeApiKey: "",
};

// Type for frontmatter to avoid using 'any'
export interface FrontmatterData {
	banner?: string;
	tags?: string | string[];
	checkbox?: boolean;
	[key: string]: unknown;
}

// Type for file cache with frontmatter
export interface FileCacheWithFrontmatter {
	frontmatter?: FrontmatterData;
}

// Type for folder progress metrics
export interface FolderProgressMetrics {
	total: number;
	completed: number;
	percent: number;
}

// Type for sort option in UI
export interface SortOption {
	value: SortMethod;
	label: string;
}

// Type for YouTube oEmbed response
export interface YouTubeOEmbedResponse {
	title: string;
	author_name: string;
	author_url: string;
	type: string;
	height: number;
	width: number;
	version: string;
	provider_name: string;
	provider_url: string;
	thumbnail_url: string;
	thumbnail_width: number;
	thumbnail_height: number;
}

// Type for state management
export interface GalleryViewState {
	currentPath: string;
	historyStack: string[];
}

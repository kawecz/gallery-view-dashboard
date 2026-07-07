export type SortMethod = "alphabetical" | "properties" | "manual" | "checkbox";

export interface FolderOverride {
	folderPath: string;
	bannerUrl: string;
	showSubs: boolean;
	isManual?: boolean;
	visibleProperties?: string[]; // Per-folder override
	googleBooksApiKey?: string;
}

export interface GalleryViewSettings {
	rootSearchPath: string;
	lastOpenPath: string;
	visibleProperties: string[]; // Global default
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
	tmdbApiKey?: string;
	googleBooksApiKey?: string;
	showYouTubeImport: boolean;
	showBookImport: boolean;
	showGameImport: boolean;
	showMovieImport: boolean;
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
	tmdbApiKey: "",
	showYouTubeImport: true,
	showBookImport: true,
	showGameImport: true,
	showMovieImport: true,
};

export interface FrontmatterData {
	banner?: string;
	tags?: string | string[];
	checkbox?: boolean;
	[key: string]: unknown;
}

export interface FileCacheWithFrontmatter {
	frontmatter?: FrontmatterData;
}

export interface FolderProgressMetrics {
	total: number;
	completed: number;
	percent: number;
}

export interface SortOption {
	value: SortMethod;
	label: string;
}

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

export interface GalleryViewState {
	currentPath: string;
	historyStack: string[];
}

// Book types for Open Library API
export interface OpenLibraryBook {
	title: string;
	authors?: { name: string }[];
	cover_i?: number;
	isbn?: string[];
	description?: string | { value: string };
	subjects?: string[];
	first_publish_year?: number;
	publisher?: string[];
}

export interface SteamGameData {
	name: string;
	steam_appid: number;
	developers?: string[];
	publishers?: string[];
	genres?: { description: string }[];
	header_image?: string;
	short_description?: string;
	release_date?: { date: string };
	metacritic?: { score: number };
}

export interface TMDBMovie {
	id: number;
	title: string;
	overview: string;
	poster_path: string | null;
	release_date: string;
	vote_average: number;
	genres?: { name: string }[];
	director?: string;
}

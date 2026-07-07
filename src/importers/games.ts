import { requestUrl } from "obsidian";
import type { SteamGameData } from "../types";

export interface GameMetadata {
	title: string;
	developer: string;
	publisher: string;
	genres: string;
	coverUrl: string;
	description: string;
	releaseDate: string;
	rating: string;
	steamAppId: string;
}

function extractSteamAppId(input: string): string | null {
	// Match Steam store URL patterns
	const storeMatch = input.match(/store\.steampowered\.com\/app\/(\d+)/);
	if (storeMatch?.[1]) return storeMatch[1];

	// Match steamcommunity.com app URL
	const communityMatch = input.match(/steamcommunity\.com\/app\/(\d+)/);
	if (communityMatch?.[1]) return communityMatch[1];

	// If it's just numbers, treat as app ID
	if (/^\d+$/.test(input.trim())) return input.trim();

	return null;
}

export async function fetchSteamGame(input: string): Promise<GameMetadata | null> {
	const appId = extractSteamAppId(input);
	if (!appId) return null;

	try {
		// Use Steam Store API (no key required)
		const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
		const response = await requestUrl({ url });

		if (response.status !== 200) return null;

		const data = response.json as Record<string, { success: boolean; data: SteamGameData }>;
		const gameData = data[appId];

		if (!gameData?.success || !gameData.data) return null;

		const game = gameData.data;

		return {
			title: game.name,
			developer: game.developers?.join(", ") || "",
			publisher: game.publishers?.join(", ") || "",
			genres: game.genres?.map((g) => g.description).join(", ") || "",
			coverUrl: game.header_image || "",
			description: game.short_description || "",
			releaseDate: game.release_date?.date || "",
			rating: game.metacritic?.score?.toString() || "",
			steamAppId: appId,
		};
	} catch {
		return null;
	}
}
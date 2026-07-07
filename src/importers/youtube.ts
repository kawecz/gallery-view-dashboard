import { requestUrl } from "obsidian";

export interface YouTubeMetadata {
	title: string;
	videoId: string;
	thumbnailUrl: string;
	duration: string | null;
}

export function extractYouTubeVideoId(url: string): string | null {
	const regex =
		/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
	const match = url.match(regex);
	return match?.[1] || null;
}

export async function getYouTubeTitle(url: string): Promise<string | null> {
	try {
		const res = await requestUrl({
			url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
		});
		if (res.status === 200 && res.json) {
			return (res.json as { title: string }).title;
		}
	} catch {
		// Intentionally empty
	}
	return null;
}

function parseISODuration(isoDuration: string): string {
	const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return "?";

	const hours = parseInt(match[1] ?? "0");
	const minutes = parseInt(match[2] ?? "0");
	const seconds = parseInt(match[3] ?? "0");

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export async function getYouTubeDuration(
	url: string,
	apiKey: string,
): Promise<string | null> {
	if (!apiKey) return null;

	const videoId = extractYouTubeVideoId(url);
	if (!videoId) return null;

	try {
		const res = await requestUrl({
			url: `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${apiKey}`,
		});
		if (res.status === 200 && res.json) {
			const data = res.json as {
				items: { contentDetails: { duration: string } }[];
			};
			const item = data.items?.[0];
			if (item?.contentDetails?.duration) {
				return parseISODuration(item.contentDetails.duration);
			}
		}
	} catch {
		// Silently fail
	}
	return null;
}
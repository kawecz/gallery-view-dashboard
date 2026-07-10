import { requestUrl } from "obsidian";
import type { TMDBMovie } from "../types";

export interface MovieMetadata {
	title: string;
	director: string;
	year: string;
	genres: string;
	coverUrl: string;
	description: string;
	rating: string;
	tmdbId: string;
}

export async function searchTMDB(
	query: string,
	apiKey: string,
): Promise<MovieMetadata[]> {
	const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
	const response = await requestUrl({ url: searchUrl });

	if (response.status !== 200) {
		throw new Error("Failed to search TMDB");
	}

	const data = response.json as { results: TMDBMovie[] };

	// Fetch full details for each search result to get genres and director
	const results: MovieMetadata[] = [];
	for (const movie of data.results.slice(0, 5)) {
		const details = await fetchMovieDetails(movie.id.toString(), apiKey);
		if (details) {
			results.push(details);
		}
	}

	return results;
}

export async function fetchMovieDetails(
	movieId: string,
	apiKey: string,
): Promise<MovieMetadata | null> {
	const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&append_to_response=credits`;
	const response = await requestUrl({ url });

	if (response.status !== 200) return null;

	const movie = response.json as TMDBMovie & {
		credits?: { crew?: { job: string; name: string }[] };
		genres?: { id: number; name: string }[];
	};

	const director =
		movie.credits?.crew?.find((c) => c.job === "Director")?.name || "";

	const genres = movie.genres?.map((g) => g.name).join(", ") || "";

	return {
		title: movie.title,
		director,
		year: movie.release_date ? movie.release_date.substring(0, 4) : "",
		genres,
		coverUrl: movie.poster_path
			? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
			: "",
		description: movie.overview || "",
		rating: movie.vote_average?.toString() || "",
		tmdbId: movie.id.toString(),
	};
}

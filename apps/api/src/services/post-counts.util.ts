import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { likes, comments } = schema;

export interface PostCounts {
	likeCount: number;
	commentCount: number;
	isLiked: boolean;
}

/**
 * Reusable batch hydration utility to eliminate N+1 database queries.
 *
 * Anti-Pattern Prevented:
 * Previously, iterating over N posts and calling `getPostCounts(post.id)` generated 3*N SQL queries
 * (1 for likes count, 1 for comments count, 1 for like status).
 *
 * Solution:
 * This utility uses batched `IN (...)` filters with `GROUP BY` to retrieve all metrics in
 * a constant number of queries (O(1)) regardless of whether 10, 50, or 100 posts are loaded.
 */
export async function enrichPostsWithCounts<T extends { id: string }>(
	postsList: T[],
	userId?: string,
): Promise<(T & PostCounts)[]> {
	if (postsList.length === 0) {
		return [];
	}

	const postIds = postsList.map((p) => p.id);

	// Batch query 1: Like counts for all posts in a single grouped query
	const likesCounts = await db
		.select({
			postId: likes.postId,
			count: sql<number>`count(*)`,
		})
		.from(likes)
		.where(inArray(likes.postId, postIds))
		.groupBy(likes.postId);

	// Batch query 2: Comment counts for all posts in a single grouped query
	const commentsCounts = await db
		.select({
			postId: comments.postId,
			count: sql<number>`count(*)`,
		})
		.from(comments)
		.where(inArray(comments.postId, postIds))
		.groupBy(comments.postId);

	// Batch query 3 (optional): Requester like status for all posts in a single query
	let userLikedSet = new Set<string>();
	if (userId) {
		const userLikes = await db
			.select({ postId: likes.postId })
			.from(likes)
			.where(and(inArray(likes.postId, postIds), eq(likes.userId, userId)));
		userLikedSet = new Set(userLikes.map((l) => l.postId));
	}

	const likesMap = new Map<string, number>(
		likesCounts.map((r) => [r.postId, Number(r.count)]),
	);
	const commentsMap = new Map<string, number>(
		commentsCounts.map((r) => [r.postId, Number(r.count)]),
	);

	return postsList.map((post) => ({
		...post,
		likeCount: likesMap.get(post.id) || 0,
		commentCount: commentsMap.get(post.id) || 0,
		isLiked: userLikedSet.has(post.id),
	}));
}

/**
 * Single post count helper implemented via the batch utility to maintain DRY consistency.
 */
export async function getPostCounts(
	postId: string,
	userId?: string,
): Promise<PostCounts> {
	const enriched = await enrichPostsWithCounts([{ id: postId }], userId);
	return {
		likeCount: enriched[0].likeCount,
		commentCount: enriched[0].commentCount,
		isLiked: enriched[0].isLiked,
	};
}

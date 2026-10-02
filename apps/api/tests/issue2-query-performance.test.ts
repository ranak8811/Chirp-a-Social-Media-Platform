import { and, desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import {
	getBookmarkedPosts,
	toggleBookmark,
} from "../src/services/bookmarks.service";
import { getHomeFeed } from "../src/services/feed.service";
import { enrichPostsWithCounts } from "../src/services/post-counts.util";
import { getUserPosts } from "../src/services/posts.service";
import { getUser } from "../src/services/users.service";
import {
	createTestComment,
	createTestFollow,
	createTestLike,
	createTestPost,
	createTestUser,
} from "./helpers";

function trackQueries() {
	const client = (db as any).$client;
	const queries: string[] = [];
	const origExecute = client.execute.bind(client);
	client.execute = function (stmt: any) {
		const sql =
			typeof stmt === "string" ? stmt : stmt?.sql || JSON.stringify(stmt);
		queries.push(sql);
		return origExecute(stmt);
	};
	return {
		get count() {
			return queries.length;
		},
		get queries() {
			return [...queries];
		},
		restore() {
			client.execute = origExecute;
		},
		reset() {
			queries.length = 0;
		},
	};
}

describe("Issue 2: Query Performance & N+1 Prevention", () => {
	it("reusable batch hydration executes constant number of queries regardless of post count", async () => {
		const author = await createTestUser();
		const posts: { id: string }[] = [];
		for (let i = 0; i < 10; i++) {
			const postId = await createTestPost(
				author.id,
				`Performance test post #${i}`,
			);
			posts.push({ id: postId });
		}

		const tracker = trackQueries();
		try {
			tracker.reset();
			const enriched = await enrichPostsWithCounts(posts, author.id);

			expect(enriched).toHaveLength(10);
			// Must be exactly 3 batch queries (likes counts, comments counts, user like status)
			// Previously this would have required 3 * 10 = 30 queries
			expect(tracker.count).toBeLessThanOrEqual(3);

			for (const post of enriched) {
				expect(post).toHaveProperty("likeCount");
				expect(post).toHaveProperty("commentCount");
				expect(post).toHaveProperty("isLiked");
			}
		} finally {
			tracker.restore();
		}
	});

	it("home feed executes constant O(1) queries instead of O(N)", async () => {
		const user = await createTestUser();
		const friend = await createTestUser();
		await createTestFollow(user.id, friend.id);

		// Friend creates 10 posts
		for (let i = 0; i < 10; i++) {
			const postId = await createTestPost(friend.id, `Friend post #${i}`);
			await createTestLike(user.id, postId);
			await createTestComment(postId, friend.id, `Comment #${i}`);
		}

		const tracker = trackQueries();
		try {
			tracker.reset();
			const feed = await getHomeFeed(user.id, { limit: 10 });
			expect(feed).toHaveLength(10);

			// Baseline was 32 queries (2 + 3*10). With batch hydration it is <= 5 queries
			expect(tracker.count).toBeLessThanOrEqual(5);
		} finally {
			tracker.restore();
		}
	});

	it("bookmarked posts executes constant O(1) queries instead of O(N)", async () => {
		const user = await createTestUser();
		const author = await createTestUser();

		for (let i = 0; i < 10; i++) {
			const postId = await createTestPost(author.id, `Post to bookmark #${i}`);
			await toggleBookmark(postId, user.id);
		}

		const tracker = trackQueries();
		try {
			tracker.reset();
			const bookmarks = await getBookmarkedPosts(user.id, user.id, 10);
			expect(bookmarks).toHaveLength(10);

			// Baseline was 41 queries (1 + 4*10). With batch hydration it is <= 5 queries
			expect(tracker.count).toBeLessThanOrEqual(5);
		} finally {
			tracker.restore();
		}
	});

	it("user profile queries are consolidated and execute in minimal queries", async () => {
		const profileUser = await createTestUser();
		const viewer = await createTestUser();
		await createTestFollow(viewer.id, profileUser.id);

		for (let i = 0; i < 10; i++) {
			await createTestPost(profileUser.id, `Profile post #${i}`);
		}

		const tracker = trackQueries();
		try {
			tracker.reset();
			const user = await getUser(profileUser.username, viewer.id);
			const posts = await getUserPosts(profileUser.username, viewer.id);

			expect(user.username).toBe(profileUser.username);
			expect(user.followerCount).toBe(1);
			expect(user.postCount).toBe(10);
			expect(user.isFollowing).toBe(true);
			expect(posts).toHaveLength(10);

			// getUser (2 queries) + getUserPosts (<= 5 queries) = <= 7 queries total (down from ~37)
			expect(tracker.count).toBeLessThanOrEqual(7);
		} finally {
			tracker.restore();
		}
	});
});

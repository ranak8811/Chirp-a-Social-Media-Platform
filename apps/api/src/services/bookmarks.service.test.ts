import { describe, expect, it } from "vitest";
import {
	createTestPost,
	createTestUser,
} from "../../tests/helpers";
import {
	getBookmarkStatus,
	getBookmarkedPosts,
	toggleBookmark,
} from "./bookmarks.service";

describe("BookmarksService", () => {
	it("toggles bookmark on and off for a post", async () => {
		const user = await createTestUser();
		const author = await createTestUser();
		const postId = await createTestPost(author.id, "Bookmarkable post");

		// Toggle on
		const addResult = await toggleBookmark(postId, user.id);
		expect(addResult.bookmarked).toBe(true);

		const statusAfterAdd = await getBookmarkStatus(postId, user.id);
		expect(statusAfterAdd.bookmarked).toBe(true);

		// Toggle off
		const removeResult = await toggleBookmark(postId, user.id);
		expect(removeResult.bookmarked).toBe(false);

		const statusAfterRemove = await getBookmarkStatus(postId, user.id);
		expect(statusAfterRemove.bookmarked).toBe(false);
	});

	it("throws an error when toggling bookmark on a non-existent post", async () => {
		const user = await createTestUser();
		await expect(
			toggleBookmark("non-existent-post-id", user.id),
		).rejects.toThrow("Post not found");
	});

	it("retrieves bookmarked posts with pagination and metadata", async () => {
		const user = await createTestUser();
		const author = await createTestUser();

		const post1 = await createTestPost(author.id, "First bookmarked post");
		const post2 = await createTestPost(author.id, "Second bookmarked post");

		await toggleBookmark(post1, user.id);
		await toggleBookmark(post2, user.id);

		const bookmarked = await getBookmarkedPosts(user.id, user.id, 10, 0);
		expect(bookmarked.length).toBe(2);
		expect(bookmarked.some((p) => p.id === post1)).toBe(true);
		expect(bookmarked.some((p) => p.id === post2)).toBe(true);
	});

	it("returns empty array when user has no bookmarks", async () => {
		const user = await createTestUser();
		const bookmarked = await getBookmarkedPosts(user.id, user.id);
		expect(bookmarked).toEqual([]);
	});
});

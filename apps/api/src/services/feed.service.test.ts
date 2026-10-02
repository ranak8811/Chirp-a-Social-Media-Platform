import { describe, expect, it } from "vitest";
import {
	createTestFollow,
	createTestPost,
	createTestUser,
} from "../../tests/helpers";
import { getExploreFeed, getHomeFeed } from "./feed.service";

describe("FeedService", () => {
	it("retrieves home feed containing posts from followed users and self", async () => {
		const user1 = await createTestUser();
		const user2 = await createTestUser();
		const user3 = await createTestUser();

		await createTestFollow(user1.id, user2.id);

		const postUser1 = await createTestPost(user1.id, "My own post");
		const postUser2 = await createTestPost(user2.id, "Followed user post");
		const postUser3 = await createTestPost(user3.id, "Unfollowed user post");

		const feed = await getHomeFeed(user1.id);
		const feedPostIds = feed.map((p) => p.id);

		expect(feedPostIds).toContain(postUser1);
		expect(feedPostIds).toContain(postUser2);
		expect(feedPostIds).not.toContain(postUser3);
	});

	it("returns empty home feed when user has no posts and follows no one with posts", async () => {
		const user = await createTestUser();
		const feed = await getHomeFeed(user.id);
		expect(feed).toEqual([]);
	});

	it("retrieves explore feed with all recent posts", async () => {
		const user1 = await createTestUser();
		const user2 = await createTestUser();

		const post1 = await createTestPost(user1.id, "Explore post 1");
		const post2 = await createTestPost(user2.id, "Explore post 2");

		const exploreFeed = await getExploreFeed({ limit: 10 });
		const exploreIds = exploreFeed.map((p) => p.id);

		expect(exploreIds).toContain(post1);
		expect(exploreIds).toContain(post2);
	});
});

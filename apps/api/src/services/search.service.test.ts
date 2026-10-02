import { describe, expect, it } from "vitest";
import {
	createTestPost,
	createTestUser,
} from "../../tests/helpers";
import { searchPosts, searchUsers } from "./search.service";

describe("SearchService", () => {
	it("returns empty array for empty or blank query", async () => {
		expect(await searchPosts("")).toEqual([]);
		expect(await searchPosts("   ")).toEqual([]);
		expect(await searchUsers("")).toEqual([]);
		expect(await searchUsers("   ")).toEqual([]);
	});

	it("searches posts by substring matching content", async () => {
		const author = await createTestUser();
		const matchingPost = await createTestPost(author.id, "Hello unique_refactor_word world");
		await createTestPost(author.id, "Completely different text");

		const results = await searchPosts("unique_refactor_word");
		expect(results.length).toBe(1);
		expect(results[0].id).toBe(matchingPost);
	});

	it("searches users by username and display name substring", async () => {
		await createTestUser({
			username: "coder_bob",
			displayName: "Bob Developer",
			email: "bob@example.com",
		});

		const byUsername = await searchUsers("coder_bob");
		expect(byUsername.length).toBe(1);
		expect(byUsername[0].username).toBe("coder_bob");

		const byDisplayName = await searchUsers("Developer");
		expect(byDisplayName.length).toBe(1);
		expect(byDisplayName[0].displayName).toBe("Bob Developer");
	});
});

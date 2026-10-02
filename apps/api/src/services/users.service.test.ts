import { describe, expect, it } from "vitest";
import {
	createTestFollow,
	createTestPost,
	createTestUser,
} from "../../tests/helpers";
import {
	getUser,
	updateProfile,
} from "./users.service";

describe("UsersService", () => {
	it("retrieves user with follower, following, and post counts", async () => {
		const userA = await createTestUser({
			username: "alice_profile",
			displayName: "Alice",
		});
		const userB = await createTestUser();

		await createTestPost(userA.id, "Alice's post");
		await createTestFollow(userB.id, userA.id);

		const profile = await getUser("alice_profile", userB.id);
		expect(profile.username).toBe("alice_profile");
		expect(profile.postCount).toBe(1);
		expect(profile.followerCount).toBe(1);
		expect(profile.followingCount).toBe(0);
		expect(profile.isFollowing).toBe(true);
	});

	it("throws error for non-existent user", async () => {
		await expect(getUser("non_existent_username")).rejects.toThrow("User not found");
	});

	it("updates user profile metadata", async () => {
		const user = await createTestUser();
		const result = await updateProfile({
			userId: user.id,
			displayName: "New Display Name",
			bio: "Updated bio description",
		});

		expect(result.success).toBe(true);

		const updated = await getUser(user.username);
		expect(updated.displayName).toBe("New Display Name");
		expect(updated.bio).toBe("Updated bio description");
	});
});

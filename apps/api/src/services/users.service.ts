import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { users, follows, posts } = schema;

export interface UpdateProfileInput {
	userId: string;
	displayName?: string;
	bio?: string;
	avatarUrl?: string;
}

export async function getUser(username: string, requesterId?: string) {
	const user = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			bio: users.bio,
			role: users.role,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(eq(users.username, username))
		.get();

	if (!user) {
		throw new Error("User not found");
	}

	// Consolidate follower count, following count, post count, and follow status into a single query
	const isDifferentRequester = requesterId && requesterId !== user.id;
	const statsResult = await db.get<{
		followerCount: number;
		followingCount: number;
		postCount: number;
		isFollowing: number;
	}>(sql`
		SELECT 
			(SELECT count(*) FROM follows WHERE following_id = ${user.id}) as followerCount,
			(SELECT count(*) FROM follows WHERE follower_id = ${user.id}) as followingCount,
			(SELECT count(*) FROM posts WHERE author_id = ${user.id}) as postCount,
			CASE WHEN ${isDifferentRequester ? 1 : 0} = 1 THEN
				EXISTS(SELECT 1 FROM follows WHERE follower_id = ${requesterId || ""} AND following_id = ${user.id})
			ELSE 0 END as isFollowing
	`);

	return {
		...user,
		followerCount: Number(statsResult?.followerCount || 0),
		followingCount: Number(statsResult?.followingCount || 0),
		postCount: Number(statsResult?.postCount || 0),
		isFollowing: Boolean(statsResult?.isFollowing),
	};
}

export async function updateProfile(input: UpdateProfileInput) {
	const updateData: Record<string, string> = {};

	if (input.displayName !== undefined) {
		updateData.displayName = input.displayName;
	}

	if (input.bio !== undefined) {
		updateData.bio = input.bio;
	}

	if (input.avatarUrl !== undefined) {
		updateData.avatarUrl = input.avatarUrl;
	}

	if (Object.keys(updateData).length === 0) {
		return { success: true };
	}

	await db
		.update(users)
		.set({
			...updateData,
			updatedAt: new Date(),
		})
		.where(eq(users.id, input.userId));

	return { success: true };
}

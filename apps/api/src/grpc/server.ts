import {
	AdminService,
	AuthService,
	BookmarksService,
	CommentsService,
	FeedService,
	FollowsService,
	LikesService,
	NotificationsService,
	PostsService,
	SearchService,
	UsersService,
} from "@chirp/proto";
import { Server, ServerCredentials } from "@grpc/grpc-js";
import { adaptService } from "@protobuf-ts/grpc-backend";
import { wrapServiceWithObservability } from "../observability/interceptor";
import { adminHandler } from "./handlers/admin.handler";
import { authHandler } from "./handlers/auth.handler";
import { bookmarksHandler } from "./handlers/bookmarks.handler";
import { commentsHandler } from "./handlers/comments.handler";
import { feedHandler } from "./handlers/feed.handler";
import { followsHandler } from "./handlers/follows.handler";
import { likesHandler } from "./handlers/likes.handler";
import { notificationsHandler } from "./handlers/notifications.handler";
import { postsHandler } from "./handlers/posts.handler";
import { searchHandler } from "./handlers/search.handler";
import { usersHandler } from "./handlers/users.handler";

export function startGrpcServer(port: number): Promise<Server> {
	const server = new Server();

	// Register all service handlers with request tracing, structured logging, and unified error mapping
	server.addService(...adaptService(AuthService, wrapServiceWithObservability("AuthService", authHandler)));
	server.addService(...adaptService(PostsService, wrapServiceWithObservability("PostsService", postsHandler)));
	server.addService(...adaptService(CommentsService, wrapServiceWithObservability("CommentsService", commentsHandler)));
	server.addService(...adaptService(LikesService, wrapServiceWithObservability("LikesService", likesHandler)));
	server.addService(...adaptService(FollowsService, wrapServiceWithObservability("FollowsService", followsHandler)));
	server.addService(...adaptService(FeedService, wrapServiceWithObservability("FeedService", feedHandler)));
	server.addService(...adaptService(SearchService, wrapServiceWithObservability("SearchService", searchHandler)));
	server.addService(...adaptService(UsersService, wrapServiceWithObservability("UsersService", usersHandler)));
	server.addService(...adaptService(AdminService, wrapServiceWithObservability("AdminService", adminHandler)));
	server.addService(...adaptService(NotificationsService, wrapServiceWithObservability("NotificationsService", notificationsHandler)));
	server.addService(...adaptService(BookmarksService, wrapServiceWithObservability("BookmarksService", bookmarksHandler)));

	return new Promise((resolve, reject) => {
		server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (error, boundPort) => {
			if (error) {
				console.error("Failed to bind gRPC server:", error);
				reject(error);
				return;
			}
			console.log(`   gRPC server bound to port ${boundPort}`);
			resolve(server);
		});
	});
}

use axum::extract::State;
use conduwuit::{Err, Result, info, utils, warn};
use conduwuit::utils::ReadyExt;
use futures::{FutureExt, StreamExt};
use ruma::{OwnedRoomAliasId, OwnedUserId};
use ruminuwuity::admin::continuwuity::rooms;

use crate::Ruma;

/// # `DELETE /_continuwuity/admin/v2/rooms/{room_id}`
///
/// Purge a room: evict all local users, remove local aliases,
/// unpublish from directory, disable federation, and ban.
/// Returns a UUID tracking the operation.
pub(crate) async fn purge_room(
	State(services): State<crate::State>,
	body: Ruma<rooms::purge::v1::Request>,
) -> Result<rooms::purge::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let room_id = &body.room_id;

	if services.rooms.metadata.is_banned(room_id).await {
		return Err!(Request(InvalidParam("Room is already banned")));
	}

	info!(%sender_user, "Purging room {room_id}");

	// Evict local users
	let mut evicted: Vec<OwnedUserId> = Vec::new();
	let mut users = services
		.rooms
		.state_cache
		.room_members(room_id)
		.ready_filter(|user| services.globals.user_is_local(user))
		.boxed();

	while let Some(ref user_id) = users.next().await {
		match crate::client::leave_room(&services, user_id, room_id, None)
			.boxed()
			.await
		{
			Ok(()) => {
				services.rooms.state_cache.forget(room_id, user_id);
				evicted.push(user_id.clone());
			},
			Err(e) => {
				warn!("Failed to evict user {user_id} from room {room_id}: {e}");
			},
		}
	}

	// Remove local aliases
	let aliases: Vec<OwnedRoomAliasId> = services
		.rooms
		.alias
		.local_aliases_for_room(room_id)
		.collect()
		.await;

	for alias in &aliases {
		let _ = services
			.rooms
			.alias
			.remove_alias(alias, &services.globals.server_user)
			.await;
	}

	// Remove from directory and disable federation
	services.rooms.directory.set_not_public(room_id);
	services.rooms.metadata.ban_room(room_id, true);
	services.rooms.metadata.disable_room(room_id, true);

	let delete_id = format!(
		"{}-{}-{}-{}",
		utils::random_string(8),
		utils::random_string(4),
		utils::random_string(4),
		utils::random_string(12),
	);

	let notice = format!(
		"{sender_user} purged {room_id}: evicted {} users, removed {} aliases (id: {delete_id})",
		evicted.len(),
		aliases.len()
	);
	services.admin.notice(&notice).await;

	info!(%sender_user, "Purged room {room_id} (delete_id: {delete_id})");
	Ok(rooms::purge::v1::Response::new(delete_id))
}

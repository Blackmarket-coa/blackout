use axum::extract::State;
use conduwuit::{Err, Result, info};
use futures::StreamExt;
use ruma::OwnedRoomId;
use ruminuwuity::admin::continuwuity::rooms;

use crate::Ruma;

/// # `GET /_continuwuity/admin/v1/rooms`
///
/// Lists all rooms with a total count (for server stats).
pub(crate) async fn list_rooms_stats(
	State(services): State<crate::State>,
	body: Ruma<rooms::stats::v1::Request>,
) -> Result<rooms::stats::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let mut rooms: Vec<OwnedRoomId> = services
		.rooms
		.metadata
		.iter_ids()
		.filter_map(|room_id| async move {
			if !services.rooms.metadata.is_banned(&room_id).await {
				Some(room_id.clone())
			} else {
				None
			}
		})
		.collect()
		.await;
	rooms.sort();

	let total = rooms.len() as u64;

	info!(%sender_user, "Listed {total} rooms");
	Ok(rooms::stats::v1::Response::new(rooms, total))
}

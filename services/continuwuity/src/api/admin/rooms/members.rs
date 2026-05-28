use axum::extract::State;
use conduwuit::{Err, Result, info};
use futures::StreamExt;
use ruma::OwnedUserId;
use ruminuwuity::admin::continuwuity::rooms;

use crate::Ruma;

/// # `GET /_continuwuity/admin/v1/rooms/{room_id}/members`
///
/// Lists all members of a room (admin-level access).
pub(crate) async fn list_members(
	State(services): State<crate::State>,
	body: Ruma<rooms::members::v1::Request>,
) -> Result<rooms::members::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let members: Vec<OwnedUserId> = services
		.rooms
		.state_cache
		.room_members(&body.room_id)
		.collect()
		.await;

	let total = members.len() as u64;

	info!(%sender_user, "Listed {} members of {}", total, body.room_id);
	Ok(rooms::members::v1::Response::new(members, total))
}

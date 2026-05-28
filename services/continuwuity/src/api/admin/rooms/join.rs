use axum::extract::State;
use conduwuit::{Err, Result, info};
use ruminuwuity::admin::continuwuity::rooms;

use crate::Ruma;

/// # `POST /_continuwuity/admin/v1/join/{room_id}`
///
/// Force-join a local user into a room. The calling admin must be a member
/// of the room (or the room must be local and the admin must be able to join).
pub(crate) async fn join_room(
	State(services): State<crate::State>,
	body: Ruma<rooms::join::v1::Request>,
) -> Result<rooms::join::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	services
		.rooms
		.membership
		.join_room(&body.user_id, &body.room_id, None, &[])
		.await?;

	info!(%sender_user, "Force-joined {} to {}", body.user_id, body.room_id);
	Ok(rooms::join::v1::Response::new(true))
}
